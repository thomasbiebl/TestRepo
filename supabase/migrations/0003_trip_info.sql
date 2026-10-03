-- Stufe 2: Fahrt-Infos (Anstoß, Rückfahrt, Hinweise), Absage der Fahrt, Stornofrist.

alter table public.trips
  add column kickoff timestamptz,
  add column return_time timestamptz,
  add column notes text not null default '',
  add column cancelled_at timestamptz,
  add column cancel_reason text;

alter table public.settings
  add column cancel_deadline_hours integer not null default 0
    check (cancel_deadline_hours between 0 and 720);

create or replace function public.trips_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare days integer;
begin
  select interest_days into days from public.settings where id = 1;
  new.created_at := now();
  new.interest_ends_at := now() + make_interval(days => days);
  new.allocated_at := null;
  new.cancelled_at := null;
  new.cancel_reason := null;
  return new;
end;
$$;

-- Abgesagte Fahrten werden nicht mehr vergeben.
create or replace function public.allocate_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found or t.cancelled_at is not null or t.allocated_at is not null or now() < t.interest_ends_at then
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

create or replace function public.book_trip(p_trip uuid) returns text
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
  if t.cancelled_at is not null then raise exception 'Die Fahrt wurde abgesagt.'; end if;

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

create or replace function public.cancel_booking(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips; b public.bookings; hours integer;
begin
  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;
  if now() >= t.departure then raise exception 'Die Fahrt ist bereits abgefahren.'; end if;
  select * into b from public.bookings where trip_id = p_trip and user_id = auth.uid();
  if not found then raise exception 'Keine Buchung gefunden.'; end if;
  select cancel_deadline_hours into hours from public.settings where id = 1;
  if b.status = 'confirmed' and hours > 0 and now() >= t.departure - make_interval(hours => hours) then
    raise exception 'Stornieren ist nur bis % Stunden vor der Abfahrt möglich. Bitte melde dich beim Admin.', hours;
  end if;
  delete from public.bookings where id = b.id;
end;
$$;

create or replace function public.admin_end_interest(p_trip uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;
  if t.cancelled_at is not null then raise exception 'Die Fahrt wurde abgesagt.'; end if;
  if now() >= t.interest_ends_at then raise exception 'Die Interessensphase ist schon vorbei.'; end if;
  update public.trips set interest_ends_at = now() where id = p_trip;
  perform public.allocate_trip(p_trip);
end;
$$;

create function public.admin_cancel_trip(p_trip uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  update public.trips
     set cancelled_at = now(), cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_trip and cancelled_at is null;
  if not found then raise exception 'Fahrt nicht gefunden oder schon abgesagt.'; end if;
end;
$$;

revoke execute on function public.admin_cancel_trip(uuid, text) from public, anon;
grant execute on function public.admin_cancel_trip(uuid, text) to authenticated;
