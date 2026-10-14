-- Automatically audit significant station and assignment mutations, including REST updates.
create or replace function public.audit_station_mutation() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); rid uuid; sid uuid; verb text; oldj jsonb; newj jsonb;
begin
  if tg_table_name='stations' then
    actor:=coalesce(actor,new.created_by,old.created_by);
    rid:=coalesce(new.region_id,old.region_id);sid:=coalesce(new.id,old.id);
    if tg_op='INSERT' then verb:='station_created';newj:=to_jsonb(new);elsif tg_op='UPDATE' then verb:='station_updated';oldj:=to_jsonb(old);newj:=to_jsonb(new);else verb:='station_deleted';oldj:=to_jsonb(old);end if;
  else
    actor:=coalesce(actor,new.assigned_by,old.assigned_by);
    select region_id into rid from public.stations where id=coalesce(new.station_id,old.station_id);
    sid:=coalesce(new.station_id,old.station_id);
    if tg_op='INSERT' then verb:='supervisor_assigned';newj:=to_jsonb(new);elsif tg_op='UPDATE' then verb:='assignment_updated';oldj:=to_jsonb(old);newj:=to_jsonb(new);else verb:='assignment_deleted';oldj:=to_jsonb(old);end if;
  end if;
  insert into public.audit_events(region_id,station_id,actor_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(rid,sid,actor,verb,tg_table_name,coalesce(new.id,old.id),oldj,newj,'Database audit trigger');
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger stations_audit after insert or update or delete on public.stations for each row execute function public.audit_station_mutation();
create trigger assignments_audit after insert or update or delete on public.station_assignments for each row execute function public.audit_station_mutation();
