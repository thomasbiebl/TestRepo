-- Fanclub Busfahrten: Schema, Zugriffsregeln und Platzvergabe.
-- Im Supabase SQL-Editor ausführen (oder mit `supabase db push`).

------------------------------------------------------------------------------
-- Tabellen
------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  is_member boolean not null default false,
  is_admin boolean not null default false,
  member_requested boolean not null default false,
  base_trips integer not null default 0 check (base_trips >= 0),
  created_at timestamptz not null default now()
);

create table public.settings (
  id integer primary key default 1 check (id = 1),
  club_name text not null default 'Fanclub' check (length(trim(club_name)) > 0),
  interest_days integer not null default 3 check (interest_days between 0 and 30),
  guests_may_book boolean not null default true,
  waitlist_enabled boolean not null default true,
  default_seats integer not null default 50 check (default_seats >= 1),
  default_price numeric(8, 2) not null default 30 check (default_price >= 0),
  default_meeting_point text not null default 'Parkplatz Stadion' check (length(trim(default_meeting_point)) > 0)
);
insert into public.settings default values;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  departure timestamptz not null,
  meeting_point text not null,
  price numeric(8, 2) not null check (price >= 0),
  seats integer not null check (seats >= 1),
  created_at timestamptz not null default now(),
  interest_ends_at timestamptz not null default now(),
  allocated_at timestamptz
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('interested', 'confirmed', 'waitlist')),
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  unique (trip_id, user_id)
);
create index bookings_trip_idx on public.bookings (trip_id);
create index bookings_user_idx on public.bookings (user_id);

create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Namen und Fahrtenzahl für Ranglisten. Enthält bewusst keine E-Mail-Adressen.
create view public.public_profiles as
  select id, name, base_trips, is_member from public.profiles;

------------------------------------------------------------------------------
-- Hilfsfunktionen
------------------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Bisherige Fahrten: Startwert plus bestätigte Plätze auf abgefahrenen Fahrten.
create function public.past_trips(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select base_trips from public.profiles where id = p_user), 0)
       + (select count(*)::integer from public.bookings b
            join public.trips t on t.id = b.trip_id
           where b.user_id = p_user and b.status = 'confirmed' and t.departure <= now())
$$;

-- Neues Konto: Profil anlegen. Name und Mitgliedschaftswunsch kommen aus der Registrierung.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, member_requested)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, 'Mitglied'), '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'wants_membership') = 'true', false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Neue Fahrt: Zeitstempel und Ende der Mitglieder-Phase setzt der Server.
create function public.trips_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare days integer;
begin
  select interest_days into days from public.settings where id = 1;
  new.created_at := now();
  new.interest_ends_at := now() + make_interval(days => days);
  new.allocated_at := null;
  return new;
end;
$$;

create trigger trips_before_insert
  before insert on public.trips
  for each row execute function public.trips_before_insert();

------------------------------------------------------------------------------
-- Platzvergabe
------------------------------------------------------------------------------

-- Wartelistenplätze rücken nach, solange Plätze frei sind.
create function public.promote_waitlist(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare free integer;
begin
  select t.seats - (select count(*) from public.bookings b where b.trip_id = t.id and b.status = 'confirmed')
    into free from public.trips t where t.id = p_trip;
  if coalesce(free, 0) > 0 then
    update public.bookings set status = 'confirmed', queued_at = null
     where id in (
       select id from public.bookings
        where trip_id = p_trip and status = 'waitlist'
        order by queued_at, created_at
        limit free);
  end if;
end;
$$;

-- Vergibt die Plätze nach der Mitglieder-Phase: meiste bisherige Fahrten zuerst,
-- bei Gleichstand früheres Interesse. Läuft nur einmal pro Fahrt.
create function public.allocate_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.allocated_at is not null or now() < t.interest_ends_at then
    return;
  end if;

  with ranked as (
    select b.id,
           row_number() over (order by public.past_trips(b.user_id) desc, b.created_at asc, b.id) as rn
      from public.bookings b
     where b.trip_id = p_trip and b.status = 'interested')
  update public.bookings b
     set status = case when r.rn <= t.seats then 'confirmed' else 'waitlist' end,
         queued_at = case when r.rn <= t.seats then null else now() + r.rn * interval '1 millisecond' end
    from ranked r
   where b.id = r.id;

  update public.trips set allocated_at = now() where id = p_trip;
end;
$$;

create function public.allocate_due_trips() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.trips where allocated_at is null and interest_ends_at <= now() loop
    perform public.allocate_trip(r.id);
  end loop;
end;
$$;

create function public.bookings_after_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'confirmed' then
    perform public.promote_waitlist(old.trip_id);
  end if;
  return old;
end;
$$;

create trigger bookings_after_delete
  after delete on public.bookings
  for each row execute function public.bookings_after_delete();

create function public.trips_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.seats > old.seats then
    perform public.promote_waitlist(new.id);
  end if;
  return new;
end;
$$;

create trigger trips_after_update
  after update of seats on public.trips
  for each row execute function public.trips_after_update();

------------------------------------------------------------------------------
-- Aktionen für angemeldete Benutzer
------------------------------------------------------------------------------

-- Interesse (Mitglieder-Phase) oder Buchung (offene Phase). Gibt den neuen Status zurück.
create function public.book_trip(p_trip uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  u public.profiles;
  t public.trips;
  s public.settings;
  is_full boolean;
  new_status text;
begin
  select * into u from public.profiles where id = auth.uid();
  if not found then raise exception 'Bitte melde dich an.'; end if;

  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;

  -- Erst vergeben, damit niemand einem Interessenten den Platz wegbucht.
  perform public.allocate_trip(p_trip);
  select * into s from public.settings where id = 1;

  if exists (select 1 from public.bookings where trip_id = p_trip and user_id = u.id) then
    raise exception 'Du hast diese Fahrt schon gebucht.';
  end if;
  if now() >= t.departure then raise exception 'Die Fahrt ist bereits abgefahren.'; end if;

  if now() < t.interest_ends_at then
    if not u.is_member then raise exception 'Nur Mitglieder können jetzt Interesse bekunden.'; end if;
    insert into public.bookings (trip_id, user_id, status) values (p_trip, u.id, 'interested');
    return 'interested';
  end if;

  if not u.is_member and not s.guests_may_book then
    raise exception 'Die Buchung ist zurzeit nur für Mitglieder möglich.';
  end if;
  is_full := (select count(*) from public.bookings where trip_id = p_trip and status = 'confirmed') >= t.seats;
  if is_full and not s.waitlist_enabled then raise exception 'Die Fahrt ist leider ausgebucht.'; end if;

  new_status := case when is_full then 'waitlist' else 'confirmed' end;
  insert into public.bookings (trip_id, user_id, status, queued_at)
  values (p_trip, u.id, new_status, case when is_full then now() end);
  return new_status;
end;
$$;

create function public.cancel_booking(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips; n integer;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;
  if now() >= t.departure then raise exception 'Die Fahrt ist bereits abgefahren.'; end if;
  delete from public.bookings where trip_id = p_trip and user_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Keine Buchung gefunden.'; end if;
end;
$$;

------------------------------------------------------------------------------
-- Aktionen nur für Admins
------------------------------------------------------------------------------

create function public.admin_end_interest(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;
  if now() >= t.interest_ends_at then raise exception 'Die Interessensphase ist schon vorbei.'; end if;
  update public.trips set interest_ends_at = now() where id = p_trip;
  perform public.allocate_trip(p_trip);
end;
$$;

create function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if p_user = auth.uid() then raise exception 'Du kannst dich nicht selbst löschen.'; end if;
  delete from auth.users where id = p_user;
end;
$$;

------------------------------------------------------------------------------
-- Zugriffsrechte und Row Level Security
------------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.trips enable row level security;
alter table public.bookings enable row level security;
alter table public.news enable row level security;

-- Profile: jeder sieht sein eigenes, Admins sehen alle. Admins dürfen Flags ändern, nicht die E-Mail.
grant select on public.profiles to authenticated;
grant update (name, is_member, is_admin, member_requested, base_trips) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.public_profiles to authenticated;

-- Einstellungen: lesbar auch vor der Anmeldung (Vereinsname auf der Login-Seite).
grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
create policy settings_select on public.settings for select to anon, authenticated using (true);
create policy settings_admin_update on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Fahrten und News: alle Angemeldeten lesen, Admins schreiben.
grant select on public.trips, public.news to authenticated;
grant insert, update, delete on public.trips, public.news to authenticated;
create policy trips_select on public.trips for select to authenticated using (true);
create policy trips_admin_insert on public.trips for insert to authenticated with check (public.is_admin());
create policy trips_admin_update on public.trips for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy trips_admin_delete on public.trips for delete to authenticated using (public.is_admin());

create policy news_select on public.news for select to authenticated using (true);
create policy news_admin_insert on public.news for insert to authenticated with check (public.is_admin());
create policy news_admin_update on public.news for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy news_admin_delete on public.news for delete to authenticated using (public.is_admin());

-- Buchungen: alle Angemeldeten lesen (für Platzzahlen und Ranglisten), geschrieben wird nur über die Funktionen.
grant select on public.bookings to authenticated;
create policy bookings_select on public.bookings for select to authenticated using (true);

-- Funktionen: intern bleibt intern.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.book_trip(uuid), public.cancel_booking(uuid), public.allocate_due_trips(),
  public.admin_end_interest(uuid), public.admin_delete_user(uuid), public.is_admin(), public.past_trips(uuid)
  to authenticated;

------------------------------------------------------------------------------
-- Automatische Vergabe alle 5 Minuten (nur wenn pg_cron verfügbar ist)
------------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('allocate-due-trips', '*/5 * * * *', 'select public.allocate_due_trips()');
exception when others then
  raise notice 'pg_cron nicht verfügbar (%). Die Vergabe läuft dann beim Öffnen der App.', sqlerrm;
end;
$$;
