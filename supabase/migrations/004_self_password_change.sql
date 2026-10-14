-- Allow an authenticated user to clear only their own temporary-password flag
-- after Supabase Auth has accepted a password change.
create or replace function public.mark_my_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  update public.profiles
     set must_change_password = false
   where id = auth.uid();
  if not found then
    raise exception 'application profile not found';
  end if;
end;
$$;
revoke all on function public.mark_my_password_changed() from public;
grant execute on function public.mark_my_password_changed() to authenticated;
