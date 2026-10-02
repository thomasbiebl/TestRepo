-- Stufe 4: Zahlungsstatus, Einstieg/Nicht erschienen, Punkte je Fahrt, Abzug bei No-Show.

alter table public.trips
  add column points integer not null default 1 check (points between 0 and 10);

alter table public.bookings
  add column paid boolean not null default false,
  add column attended boolean;  -- null = nicht erfasst, true = eingestiegen, false = nicht erschienen

alter table public.settings
  add column no_show_penalty integer not null default 0 check (no_show_penalty between 0 and 10);

-- Bisherige Fahrten: Startwert plus bestätigte Plätze auf abgefahrenen, nicht abgesagten Fahrten.
-- Wer als "nicht erschienen" markiert wurde, zählt nicht.
create or replace function public.past_trips(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select base_trips from public.profiles where id = p_user), 0)
       + (select count(*)::integer from public.bookings b
            join public.trips t on t.id = b.trip_id
           where b.user_id = p_user and b.status = 'confirmed' and t.departure <= now()
             and t.cancelled_at is null and b.attended is distinct from false)
$$;

-- Punkte für die Rangfolge: Startwert plus Punkte der Fahrten, minus Abzug je No-Show.
create function public.user_score(p_user uuid) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((select base_trips from public.profiles where id = p_user), 0)
    + coalesce((select sum(t.points)::integer from public.bookings b
                  join public.trips t on t.id = b.trip_id
                 where b.user_id = p_user and b.status = 'confirmed' and t.departure <= now()
                   and t.cancelled_at is null and b.attended is distinct from false), 0)
    - (select no_show_penalty from public.settings where id = 1)
      * (select count(*)::integer from public.bookings b
           join public.trips t on t.id = b.trip_id
          where b.user_id = p_user and b.status = 'confirmed' and t.departure <= now()
            and t.cancelled_at is null and b.attended = false))
$$;

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
     order by public.user_score(b.user_id) desc, b.created_at asc, b.id
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

create function public.admin_set_booking_paid(p_booking uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  update public.bookings set paid = coalesce(p_paid, false) where id = p_booking;
  if not found then raise exception 'Buchung nicht gefunden.'; end if;
end;
$$;

create function public.admin_set_booking_attended(p_booking uuid, p_attended boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'Buchung nicht gefunden.'; end if;
  if b.status <> 'confirmed' then raise exception 'Nur bestätigte Buchungen können abgehakt werden.'; end if;
  update public.bookings set attended = p_attended where id = p_booking;
end;
$$;

revoke execute on function public.user_score(uuid), public.admin_set_booking_paid(uuid, boolean),
  public.admin_set_booking_attended(uuid, boolean) from public, anon;
grant execute on function public.user_score(uuid), public.admin_set_booking_paid(uuid, boolean),
  public.admin_set_booking_attended(uuid, boolean) to authenticated;
