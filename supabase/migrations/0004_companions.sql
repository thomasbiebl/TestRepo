-- Stufe 3: Begleitpersonen, Zustiegsstellen, mehrere Busse.
-- Eine Buchung belegt 1 + Begleitpersonen Plätze.

alter table public.trips
  add column stops text[] not null default '{}',
  add column buses integer not null default 1 check (buses between 1 and 10);

alter table public.bookings
  add column companions integer not null default 0 check (companions between 0 and 20),
  add column companion_names text not null default '',
  add column stop text,
  add column bus integer check (bus is null or bus >= 1);

alter table public.settings
  add column max_companions integer not null default 3 check (max_companions between 0 and 10);

-- Wartelistenplätze rücken nach, wenn ihre Gruppe noch passt.
create or replace function public.promote_waitlist(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare free integer; r record;
begin
  select t.seats - coalesce((select sum(1 + b.companions) from public.bookings b where b.trip_id = t.id and b.status = 'confirmed'), 0)
    into free from public.trips t where t.id = p_trip;
  if free is null then return; end if;
  for r in
    select id, 1 + companions as need from public.bookings
     where trip_id = p_trip and status = 'waitlist'
     order by queued_at, created_at
  loop
    if r.need <= free then
      update public.bookings set status = 'confirmed', queued_at = null where id = r.id;
      free := free - r.need;
    end if;
  end loop;
end;
$$;

-- Vergabe nach Rangfolge. Passt eine Gruppe nicht mehr, kommt sie auf die Warteliste,
-- und die nächsten Interessenten werden weiter geprüft.
create or replace function public.allocate_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips; r record; used integer := 0; i integer := 0;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.cancelled_at is not null or t.allocated_at is not null or now() < t.interest_ends_at then
    return;
  end if;

  for r in
    select b.id, 1 + b.companions as need from public.bookings b
     where b.trip_id = p_trip and b.status = 'interested'
     order by public.past_trips(b.user_id) desc, b.created_at asc, b.id
  loop
    i := i + 1;
    if used + r.need <= t.seats then
      update public.bookings set status = 'confirmed', queued_at = null where id = r.id;
      used := used + r.need;
    else
      update public.bookings set status = 'waitlist', queued_at = now() + i * interval '1 millisecond' where id = r.id;
    end if;
  end loop;

  update public.trips set allocated_at = now() where id = p_trip;
end;
$$;

drop function public.book_trip(uuid);

create function public.book_trip(
  p_trip uuid,
  p_companions integer default 0,
  p_names text default '',
  p_stop text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  u public.profiles;
  t public.trips;
  s public.settings;
  need integer;
  is_full boolean;
  new_status text;
  stop_value text := nullif(trim(coalesce(p_stop, '')), '');
begin
  select * into u from public.profiles where id = auth.uid();
  if not found then raise exception 'Bitte melde dich an.'; end if;

  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;
  if t.cancelled_at is not null then raise exception 'Die Fahrt wurde abgesagt.'; end if;

  perform public.allocate_trip(p_trip);
  select * into s from public.settings where id = 1;

  if coalesce(p_companions, 0) < 0 or coalesce(p_companions, 0) > s.max_companions then
    raise exception 'Du kannst höchstens % Begleitpersonen mitbringen.', s.max_companions;
  end if;
  need := 1 + coalesce(p_companions, 0);

  if cardinality(t.stops) > 0 then
    if stop_value is null or not (stop_value = any (t.stops)) then
      raise exception 'Bitte wähle eine Zustiegsstelle.';
    end if;
  else
    stop_value := null;
  end if;

  if exists (select 1 from public.bookings where trip_id = p_trip and user_id = u.id) then
    raise exception 'Du hast diese Fahrt schon gebucht.';
  end if;
  if now() >= t.departure then raise exception 'Die Fahrt ist bereits abgefahren.'; end if;

  if now() < t.interest_ends_at then
    if not u.is_member then raise exception 'Nur Mitglieder können jetzt Interesse bekunden.'; end if;
    insert into public.bookings (trip_id, user_id, status, companions, companion_names, stop)
    values (p_trip, u.id, 'interested', need - 1, coalesce(trim(p_names), ''), stop_value);
    return 'interested';
  end if;

  if not u.is_member and not s.guests_may_book then
    raise exception 'Die Buchung ist zurzeit nur für Mitglieder möglich.';
  end if;
  is_full := coalesce((select sum(1 + companions) from public.bookings where trip_id = p_trip and status = 'confirmed'), 0) + need > t.seats;
  if is_full and not s.waitlist_enabled then raise exception 'Die Fahrt ist leider ausgebucht.'; end if;

  new_status := case when is_full then 'waitlist' else 'confirmed' end;
  insert into public.bookings (trip_id, user_id, status, queued_at, companions, companion_names, stop)
  values (p_trip, u.id, new_status, case when is_full then now() end, need - 1, coalesce(trim(p_names), ''), stop_value);
  return new_status;
end;
$$;

revoke execute on function public.book_trip(uuid, integer, text, text) from public, anon;
grant execute on function public.book_trip(uuid, integer, text, text) to authenticated;

-- Admin ordnet eine Buchung einem Bus zu (null = nicht zugeordnet).
create function public.admin_set_booking_bus(p_booking uuid, p_bus integer) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  select t2.* into t from public.trips t2 join public.bookings b on b.trip_id = t2.id where b.id = p_booking;
  if not found then raise exception 'Buchung nicht gefunden.'; end if;
  if p_bus is not null and (p_bus < 1 or p_bus > t.buses) then raise exception 'Diesen Bus gibt es bei der Fahrt nicht.'; end if;
  update public.bookings set bus = p_bus where id = p_booking;
end;
$$;

revoke execute on function public.admin_set_booking_bus(uuid, integer) from public, anon;
grant execute on function public.admin_set_booking_bus(uuid, integer) to authenticated;
