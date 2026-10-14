-- Server-side station readiness: UI/client state can never activate an incomplete site.
create or replace function public.station_configuration_ready(p_station public.stations)
returns boolean language sql immutable as $$
 select length(trim(coalesce(p_station.name,'')))>=2
  and length(trim(coalesce(p_station.location,'')))>=2
  and coalesce((p_station.configuration->>'pumps')::integer,0)>0
  and coalesce((p_station.configuration#>>'{tanks,petrol,capacity}')::numeric,0)>0
  and coalesce((p_station.configuration#>>'{tanks,diesel,capacity}')::numeric,0)>0
  and coalesce((p_station.configuration#>>'{prices,petrol}')::numeric,0)>0
  and coalesce((p_station.configuration#>>'{prices,diesel}')::numeric,0)>0
$$;
create or replace function public.enforce_station_activation() returns trigger language plpgsql as $$
begin
 if new.status='operational' and not public.station_configuration_ready(new) then
   raise exception 'Station configuration incomplete: name, location, pump count, both tank capacities and both fuel prices are required';
 end if;
 new.updated_at:=now();return new;
end $$;
create trigger enforce_station_activation before insert or update on public.stations for each row execute function public.enforce_station_activation();
create or replace function public.activate_station(p_station uuid) returns public.stations
language plpgsql security definer set search_path=public as $$
declare result public.stations;
begin
 if public.my_role()<>'manager' then raise exception 'regional Manager permission required';end if;
 update public.stations set status='operational' where id=p_station and region_id=public.my_region() returning * into result;
 if not found then raise exception 'station not found in your region';end if;
 return result;
end $$;
grant execute on function public.activate_station(uuid) to authenticated;
