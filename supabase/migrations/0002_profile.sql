-- Stufe 1: Eigenes Profil bearbeiten und Konto löschen.

create function public.update_my_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Bitte einen Namen angeben.'; end if;
  update public.profiles set name = trim(p_name) where id = auth.uid();
end;
$$;

-- Löscht das eigene Konto samt Buchungen. Der letzte Admin kann sich nicht selbst löschen.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  if public.is_admin() and not exists (select 1 from public.profiles where is_admin and id <> auth.uid()) then
    raise exception 'Du bist der einzige Admin. Ernenne zuerst jemand anderen zum Admin.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.update_my_name(text), public.delete_my_account() from public, anon;
grant execute on function public.update_my_name(text), public.delete_my_account() to authenticated;
