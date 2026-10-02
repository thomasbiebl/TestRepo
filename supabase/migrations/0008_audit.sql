-- Stufe 7: Änderungsprotokoll für Admins. Wer hat wann was geändert?
-- Geschrieben wird nur von der Datenbank selbst (Trigger), gelesen nur von Admins.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,                              -- bewusst ohne Verweis: bleibt auch nach dem Löschen eines Kontos
  actor_name text not null default '',
  action text not null,
  detail text not null default ''
);
create index audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;
create policy audit_log_admin on public.audit_log for select to authenticated using (public.is_admin());

create function public.log_event(p_action text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, actor_name, action, detail)
  values (auth.uid(), coalesce((select name from public.profiles where id = auth.uid()), 'System'), p_action, coalesce(p_detail, ''))
$$;
revoke execute on function public.log_event(text, text) from public, anon, authenticated;

-- Fahrten
create function public.trips_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('trip_created', new.title);
  elsif tg_op = 'DELETE' then
    perform public.log_event('trip_deleted', old.title);
  elsif new.cancelled_at is not null and old.cancelled_at is null then
    perform public.log_event('trip_cancelled', new.title || coalesce(': ' || new.cancel_reason, ''));
  elsif new.interest_ends_at is distinct from old.interest_ends_at then
    perform public.log_event('interest_ended', new.title);
  elsif (new.title, new.departure, new.meeting_point, new.price, new.seats, new.kickoff, new.return_time, new.notes, new.stops, new.buses, new.points)
        is distinct from
        (old.title, old.departure, old.meeting_point, old.price, old.seats, old.kickoff, old.return_time, old.notes, old.stops, old.buses, old.points) then
    perform public.log_event('trip_updated', new.title);
  end if;
  return null;
end;
$$;
create trigger trips_audit after insert or update or delete on public.trips
  for each row execute function public.trips_audit();

-- News
create function public.news_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('news_created', new.title);
  elsif tg_op = 'DELETE' then
    perform public.log_event('news_deleted', old.title);
  elsif (new.title, new.body, new.pinned) is distinct from (old.title, old.body, old.pinned) then
    perform public.log_event('news_updated', new.title);
  end if;
  return null;
end;
$$;
create trigger news_audit after insert or update or delete on public.news
  for each row execute function public.news_audit();

-- Einstellungen
create function public.settings_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare changed text[] := '{}';
begin
  if new.club_name is distinct from old.club_name then changed := array_append(changed, 'Vereinsname'); end if;
  if new.interest_days is distinct from old.interest_days then changed := array_append(changed, 'Vorlauf für Mitglieder'); end if;
  if new.guests_may_book is distinct from old.guests_may_book then changed := array_append(changed, 'Gäste dürfen buchen'); end if;
  if new.waitlist_enabled is distinct from old.waitlist_enabled then changed := array_append(changed, 'Warteliste'); end if;
  if new.default_seats is distinct from old.default_seats then changed := array_append(changed, 'Standard-Plätze'); end if;
  if new.default_price is distinct from old.default_price then changed := array_append(changed, 'Standard-Preis'); end if;
  if new.default_meeting_point is distinct from old.default_meeting_point then changed := array_append(changed, 'Standard-Treffpunkt'); end if;
  if new.cancel_deadline_hours is distinct from old.cancel_deadline_hours then changed := array_append(changed, 'Stornofrist'); end if;
  if new.max_companions is distinct from old.max_companions then changed := array_append(changed, 'Begleitpersonen'); end if;
  if new.no_show_penalty is distinct from old.no_show_penalty then changed := array_append(changed, 'Abzug bei Nichterscheinen'); end if;
  if cardinality(changed) > 0 then
    perform public.log_event('settings_changed', array_to_string(changed, ', '));
  end if;
  return null;
end;
$$;
create trigger settings_audit after update on public.settings
  for each row execute function public.settings_audit();

-- Benutzer: Mitgliedschaft, Admin-Rechte, Startwert. Beim Listenimport wird nicht jede Person einzeln protokolliert.
create function public.profiles_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.log_event('user_deleted', old.name || ' (' || old.email || ')');
    return null;
  end if;
  if new.is_member is distinct from old.is_member and coalesce(current_setting('app.silent', true), '') <> '1' then
    perform public.log_event('member_changed', new.name || ': ' || case when new.is_member then 'jetzt Mitglied' else 'kein Mitglied mehr' end);
  end if;
  if new.is_admin is distinct from old.is_admin then
    perform public.log_event('admin_changed', new.name || ': ' || case when new.is_admin then 'jetzt Admin' else 'kein Admin mehr' end);
  end if;
  if new.base_trips is distinct from old.base_trips then
    perform public.log_event('points_changed', new.name || ': Startwert ' || old.base_trips || ' → ' || new.base_trips);
  end if;
  return null;
end;
$$;
create trigger profiles_audit after update or delete on public.profiles
  for each row execute function public.profiles_audit();

-- Buchungen: bezahlt, eingestiegen, Bus (nur von Admins änderbar)
create function public.bookings_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; title text;
begin
  select p.name into who from public.profiles p where p.id = new.user_id;
  select t.title into title from public.trips t where t.id = new.trip_id;
  if new.paid is distinct from old.paid then
    perform public.log_event('booking_paid', who || ' · ' || title || ': ' || case when new.paid then 'bezahlt' else 'nicht bezahlt' end);
  end if;
  if new.attended is distinct from old.attended then
    perform public.log_event('booking_attended', who || ' · ' || title || ': ' ||
      case when new.attended is true then 'eingestiegen' when new.attended is false then 'nicht erschienen' else 'zurückgesetzt' end);
  end if;
  if new.bus is distinct from old.bus then
    perform public.log_event('booking_bus', who || ' · ' || title || ': ' || coalesce('Bus ' || new.bus, 'kein Bus'));
  end if;
  return null;
end;
$$;
create trigger bookings_audit after update of paid, attended, bus on public.bookings
  for each row execute function public.bookings_audit();

-- Mitgliederliste und Code: die Funktionen aus 0007 mit Protokoll
create or replace function public.admin_import_roster(p_entries jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare added integer := 0; updated integer := 0; promoted integer; e jsonb; mail text;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if jsonb_typeof(p_entries) <> 'array' then raise exception 'Ungültige Liste.'; end if;
  perform set_config('app.silent', '1', true);
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
  perform public.log_event('roster_imported', added || ' neu, ' || updated || ' aktualisiert, ' || promoted || ' zu Mitgliedern');
  return jsonb_build_object('added', added, 'updated', updated, 'promoted', promoted);
end;
$$;

create or replace function public.admin_clear_roster() returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  delete from public.member_roster;
  get diagnostics n = row_count;
  perform public.log_event('roster_cleared', n || ' Einträge entfernt');
end;
$$;

create or replace function public.admin_set_member_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare c text := trim(coalesce(p_code, '')); old_code text;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if c <> '' and (length(c) < 4 or length(c) > 40) then raise exception 'Der Mitgliedscode braucht 4 bis 40 Zeichen.'; end if;
  select member_code into old_code from public.member_secrets where id = 1;
  if c is distinct from old_code then
    update public.member_secrets set member_code = c where id = 1;
    perform public.log_event('member_code_changed', case when c = '' then 'Code entfernt' else 'Code geändert' end);
  end if;
end;
$$;
