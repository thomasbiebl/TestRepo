-- Stufe 6: Mitgliederliste (CSV-Import) und Mitgliedscode.
-- Beides liegt in eigenen Tabellen, die nur Admins lesen dürfen. Die Einstellungen sind für alle sichtbar.

create table public.member_roster (
  email text primary key check (email = lower(email)),
  name text not null default '',
  member_number text not null default '',
  created_at timestamptz not null default now()
);

create table public.member_secrets (
  id integer primary key default 1 check (id = 1),
  member_code text not null default ''
);
insert into public.member_secrets default values;

-- Fehlversuche beim Einlösen des Codes (für die Bremse gegen Durchprobieren). Von außen nicht lesbar.
create table public.member_code_attempts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index member_code_attempts_idx on public.member_code_attempts (user_id, at);

-- Neues Konto: Profil anlegen. Steht die E-Mail-Adresse in der Mitgliederliste, ist die Person gleich Mitglied.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, member_requested, is_member)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'Mitglied'), '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'wants_membership') = 'true', false),
    exists (select 1 from public.member_roster r where r.email = lower(coalesce(new.email, '')))
  );
  return new;
end;
$$;

-- Fügt Einträge hinzu oder aktualisiert sie und macht registrierte Personen daraus zu Mitgliedern.
-- Erwartet ein JSON-Array mit {email, name, memberNumber}. Gibt die Zahlen als JSON zurück.
create function public.admin_import_roster(p_entries jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare added integer := 0; updated integer := 0; promoted integer; e jsonb; mail text;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if jsonb_typeof(p_entries) <> 'array' then raise exception 'Ungültige Liste.'; end if;
  for e in select * from jsonb_array_elements(p_entries) loop
    mail := lower(trim(coalesce(e ->> 'email', '')));
    if mail !~ '^\S+@\S+\.\S+$' then continue; end if;
    if exists (select 1 from public.member_roster where email = mail) then
      update public.member_roster
         set name = coalesce(e ->> 'name', ''), member_number = coalesce(e ->> 'memberNumber', '')
       where email = mail;
      updated := updated + 1;
    else
      insert into public.member_roster (email, name, member_number)
      values (mail, coalesce(e ->> 'name', ''), coalesce(e ->> 'memberNumber', ''));
      added := added + 1;
    end if;
  end loop;
  with p as (
    update public.profiles set is_member = true, member_requested = false
     where not is_member and lower(email) in (select email from public.member_roster)
    returning 1)
  select count(*)::integer into promoted from p;
  return jsonb_build_object('added', added, 'updated', updated, 'promoted', promoted);
end;
$$;

create function public.admin_clear_roster() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  delete from public.member_roster;
end;
$$;

create function public.admin_set_member_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare c text := trim(coalesce(p_code, ''));
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if c <> '' and (length(c) < 4 or length(c) > 40) then raise exception 'Der Mitgliedscode braucht 4 bis 40 Zeichen.'; end if;
  update public.member_secrets set member_code = c where id = 1;
end;
$$;

-- Mitgliedschaft per Code. Gibt false zurück, wenn der Code nicht stimmt. Das ist bewusst kein Fehler:
-- ein Fehler würde die Transaktion zurückrollen und den Fehlversuch gleich mit löschen.
-- Nach 5 Fehlversuchen pro Stunde ist erst einmal Pause.
create function public.redeem_member_code(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare code text; tries integer;
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  select count(*) into tries from public.member_code_attempts where user_id = auth.uid() and at > now() - interval '1 hour';
  if tries >= 5 then raise exception 'Zu viele Versuche. Bitte warte eine Stunde oder frage den Vorstand.'; end if;
  select member_code into code from public.member_secrets where id = 1;
  if code = '' or lower(trim(coalesce(p_code, ''))) <> lower(code) then
    insert into public.member_code_attempts (user_id) values (auth.uid());
    return false;
  end if;
  update public.profiles set is_member = true, member_requested = false where id = auth.uid();
  return true;
end;
$$;

alter table public.member_roster enable row level security;
alter table public.member_secrets enable row level security;
alter table public.member_code_attempts enable row level security;
grant select on public.member_roster, public.member_secrets to authenticated;
create policy member_roster_admin on public.member_roster for select to authenticated using (public.is_admin());
create policy member_secrets_admin on public.member_secrets for select to authenticated using (public.is_admin());

revoke execute on function public.admin_import_roster(jsonb), public.admin_clear_roster(), public.admin_set_member_code(text),
  public.redeem_member_code(text) from public, anon;
grant execute on function public.admin_import_roster(jsonb), public.admin_clear_roster(), public.admin_set_member_code(text),
  public.redeem_member_code(text) to authenticated;
