-- Stufe 9: Admins können Buchungen anderer stornieren (auch nach der Stornofrist).

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('allocated', 'waitlisted', 'promoted', 'trip_cancelled', 'new_trip', 'news', 'booking_removed'));

-- Storniert eine Buchung (bestätigt, Warteliste oder Interesse). Die Stornofrist gilt nicht,
-- nach der Abfahrt geht es nicht mehr. Wer wartet, rückt über den Trigger bookings_after_delete nach.
create function public.admin_cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings; t public.trips; who text;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'Buchung nicht gefunden.'; end if;
  select * into t from public.trips where id = b.trip_id for update;
  if now() >= t.departure then raise exception 'Die Fahrt ist bereits abgefahren.'; end if;
  select name into who from public.profiles where id = b.user_id;

  insert into public.notifications (user_id, type, title, body, trip_id)
  values (b.user_id, 'booking_removed', 'Buchung storniert: ' || t.title,
          'Der Verein hat deine Buchung storniert. Bei Fragen melde dich bitte beim Admin.', t.id);
  perform public.log_event('booking_removed', who || ' · ' || t.title || ': ' ||
    case b.status when 'confirmed' then 'Platz bestätigt' when 'waitlist' then 'Warteliste' else 'Interesse' end || ' storniert');

  delete from public.bookings where id = p_booking;
end;
$$;

revoke execute on function public.admin_cancel_booking(uuid) from public, anon;
grant execute on function public.admin_cancel_booking(uuid) to authenticated;
