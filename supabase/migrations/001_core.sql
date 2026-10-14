-- Supabase production foundation. Apply to a fresh project using Supabase CLI.
create extension if not exists pgcrypto;
create type public.app_role as enum ('manager','supervisor');
create type public.banking_status as enum ('draft','pending_approval','approved','rejected');

create table public.regions (id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz not null default now());
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  region_id uuid references public.regions(id),
  full_name text not null,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id),
  name text not null check(length(trim(name)) between 2 and 70),
  location text not null default '',
  status text not null default 'pending_configuration' check(status in ('pending_configuration','operational','disabled')),
  configuration jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(region_id,name)
);
-- Regional managers are identities, not station rows. Assignment rows are the only Supervisor-to-station relationship.
create table public.station_assignments (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index no_duplicate_active_station_assignment on public.station_assignments(station_id,supervisor_id) where revoked_at is null;
create table public.banking_records (
  id uuid primary key default gen_random_uuid(), station_id uuid not null references public.stations(id),
  supervisor_id uuid not null references public.profiles(id), region_id uuid not null,
  amount numeric(14,2) not null check(amount > 0), banked_at timestamptz not null,
  bank_name text not null check(length(trim(bank_name)) > 0), branch text, transaction_reference text not null,
  receipt_path text not null, status public.banking_status not null default 'pending_approval',
  submitted_at timestamptz not null default now(), rejection_reason text,
  approved_by uuid references public.profiles(id), decided_at timestamptz,
  correction_of uuid references public.banking_records(id),
  created_at timestamptz not null default now(),
  constraint receipt_path_required check(length(trim(receipt_path)) > 0),
  constraint receipt_station_record_path check(receipt_path like station_id::text || '/' || id::text || '/%'),
  constraint decision_pair check ((status in ('approved','rejected')) = (decided_at is not null))
);
create table public.audit_events (
  id bigint generated always as identity primary key, region_id uuid not null, station_id uuid references public.stations(id),
  actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id uuid,
  before_data jsonb, after_data jsonb, reason text, created_at timestamptz not null default now()
);
create index banking_region_queue on public.banking_records(region_id,status,submitted_at);
create index audit_station_time on public.audit_events(station_id,created_at desc);

create or replace function public.my_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() $$;
create or replace function public.my_region() returns uuid language sql stable security definer set search_path=public as $$ select region_id from profiles where id=auth.uid() $$;
create or replace function public.is_assigned(p_station uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from station_assignments where station_id=p_station and supervisor_id=auth.uid() and revoked_at is null) $$;

alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.station_assignments enable row level security;
alter table public.banking_records enable row level security;
alter table public.audit_events enable row level security;
create policy profile_read_self_or_manager on public.profiles for select using (id=auth.uid() or (public.my_role()='manager' and region_id=public.my_region()));
create policy region_station_read on public.stations for select using ((public.my_role()='manager' and region_id=public.my_region()) or public.is_assigned(id));
create policy manager_station_admin on public.stations for all using(public.my_role()='manager' and region_id=public.my_region()) with check(public.my_role()='manager' and region_id=public.my_region());
create policy assignment_read on public.station_assignments for select using(supervisor_id=auth.uid() or (public.my_role()='manager' and exists(select 1 from stations s where s.id=station_id and s.region_id=public.my_region())));
create policy manager_assignment_admin on public.station_assignments for all using(public.my_role()='manager' and exists(select 1 from stations s where s.id=station_id and s.region_id=public.my_region())) with check(public.my_role()='manager' and assigned_by=auth.uid() and exists(select 1 from stations s join profiles p on p.id=supervisor_id where s.id=station_id and s.region_id=public.my_region() and p.region_id=s.region_id and p.role='supervisor'));
create policy banking_read on public.banking_records for select using((public.my_role()='manager' and region_id=public.my_region()) or (supervisor_id=auth.uid() and public.is_assigned(station_id)));
create policy supervisor_submit_banking on public.banking_records for insert with check(public.my_role()='supervisor' and supervisor_id=auth.uid() and public.is_assigned(station_id) and region_id=public.my_region() and exists(select 1 from stations s where s.id=station_id and s.region_id=public.my_region() and s.status='operational') and status='pending_approval' and approved_by is null and receipt_path <> '');
-- No UPDATE/DELETE policy for banking records: submitted records are immutable. Decisions go through RPC.
create policy audit_read_region on public.audit_events for select using(public.my_role()='manager' and region_id=public.my_region());

-- Private receipt bucket. Upload paths must be station UUID / banking UUID / random filename.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bank-receipts','bank-receipts',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy receipt_read_authorized on storage.objects for select using(bucket_id='bank-receipts' and (public.my_role()='manager' and (storage.foldername(name))[1] in (select id::text from stations where region_id=public.my_region()) or public.my_role()='supervisor' and public.is_assigned(((storage.foldername(name))[1])::uuid)));
create policy receipt_upload_assigned on storage.objects for insert with check(bucket_id='bank-receipts' and public.my_role()='supervisor' and public.is_assigned(((storage.foldername(name))[1])::uuid));

create or replace function public.decide_banking(p_record uuid,p_decision text,p_reason text default null)
returns public.banking_records language plpgsql security definer set search_path=public as $$
declare r public.banking_records; begin
  if public.my_role()<>'manager' then raise exception 'manager role required'; end if;
  select * into r from banking_records where id=p_record and region_id=public.my_region() for update;
  if not found or r.status<>'pending_approval' then raise exception 'record unavailable or already decided'; end if;
  if r.supervisor_id=auth.uid() then raise exception 'self approval prohibited'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid decision'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'rejection reason required'; end if;
  if p_decision='approved' and not exists(select 1 from storage.objects where bucket_id='bank-receipts' and name=r.receipt_path) then raise exception 'receipt evidence is missing'; end if;
  update banking_records set status=p_decision::public.banking_status,approved_by=auth.uid(),decided_at=now(),rejection_reason=case when p_decision='rejected' then trim(p_reason) else null end where id=p_record returning * into r;
  insert into audit_events(region_id,station_id,actor_id,action,entity_type,entity_id,after_data,reason)
  values(r.region_id,r.station_id,auth.uid(),'banking_'||p_decision,'banking_record',r.id,to_jsonb(r),p_reason);
  return r;
end $$;
grant execute on function public.decide_banking(uuid,text,text) to authenticated;
