-- Stufe 5: Mitteilungen in der App. Der E-Mail-Versand läuft über die Edge Function notify-email.

alter table public.profiles
  add column email_personal boolean not null default true,    -- Platz vergeben, nachgerückt, Fahrt abgesagt
  add column email_broadcast boolean not null default false;  -- neue Fahrt, News

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('allocated', 'waitlisted', 'promoted', 'trip_cancelled', 'new_trip', 'news')),
  title text not null,
  body text not null default '',
  trip_id uuid references public.trips (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create function public.fmt_departure(p_at timestamptz) returns text
language sql immutable as $$
  select to_char(p_at at time zone 'Europe/Berlin', 'DD.MM.YYYY, HH24:MI') || ' Uhr'
$$;

-- Platz vergeben, Warteliste, nachgerückt.
create function public.bookings_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.trips;
begin
  if new.status = old.status then return new; end if;
  select * into t from public.trips where id = new.trip_id;
  if old.status = 'interested' and new.status = 'confirmed' then
    insert into public.notifications (user_id, type, title, body, trip_id)
    values (new.user_id, 'allocated', 'Platz bestätigt: ' || t.title, 'Du hast einen Platz bekommen. Abfahrt: ' || public.fmt_departure(t.departure) || '.', t.id);
  elsif old.status = 'interested' and new.status = 'waitlist' then
    insert into public.notifications (user_id, type, title, body, trip_id)
    values (new.user_id, 'waitlisted', 'Warteliste: ' || t.title, 'Leider hat es nicht für einen Platz gereicht. Du bist auf der Warteliste und rückst automatisch nach.', t.id);
  elsif old.status = 'waitlist' and new.status = 'confirmed' then
    insert into public.notifications (user_id, type, title, body, trip_id)
    values (new.user_id, 'promoted', 'Platz frei: ' || t.title, 'Du bist von der Warteliste nachgerückt und hast jetzt einen Platz. Abfahrt: ' || public.fmt_departure(t.departure) || '.', t.id);
  end if;
  return new;
end;
$$;

create trigger bookings_after_update
  after update of status on public.bookings
  for each row execute function public.bookings_after_update();

-- Neue Fahrt: alle bekommen eine Mitteilung.
create function public.trips_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, trip_id)
  select p.id, 'new_trip', 'Neue Fahrt: ' || new.title, 'Abfahrt ' || public.fmt_departure(new.departure) || '. Jetzt in der App ansehen.', new.id
    from public.profiles p;
  return new;
end;
$$;

create trigger trips_after_insert
  after insert on public.trips
  for each row execute function public.trips_after_insert();

-- Fahrt abgesagt: alle mit einer Buchung oder Interesse werden informiert.
create function public.trips_after_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cancelled_at is not null and old.cancelled_at is null then
    insert into public.notifications (user_id, type, title, body, trip_id)
    select b.user_id, 'trip_cancelled', 'Fahrt abgesagt: ' || new.title,
           coalesce(new.cancel_reason, 'Die Fahrt wurde leider abgesagt.'), new.id
      from public.bookings b where b.trip_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trips_after_cancel
  after update of cancelled_at on public.trips
  for each row execute function public.trips_after_cancel();

-- Neue News: alle außer dem Autor.
create function public.news_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body)
  select p.id, 'news', new.title, left(new.body, 140)
    from public.profiles p where p.id is distinct from new.author_id;
  return new;
end;
$$;

create trigger news_after_insert
  after insert on public.news
  for each row execute function public.news_after_insert();

create function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

create function public.update_my_notification_prefs(p_personal boolean, p_broadcast boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte melde dich an.'; end if;
  update public.profiles set email_personal = coalesce(p_personal, true), email_broadcast = coalesce(p_broadcast, false)
   where id = auth.uid();
end;
$$;

alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());

revoke execute on function public.mark_notifications_read(), public.update_my_notification_prefs(boolean, boolean) from public, anon;
grant execute on function public.mark_notifications_read(), public.update_my_notification_prefs(boolean, boolean) to authenticated;
revoke execute on function public.fmt_departure(timestamptz) from public, anon;
