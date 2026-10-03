import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Notification, NotificationType } from '../domain/types';
import { useApp } from '../state/AppContext';

const ICON: Record<NotificationType, string> = {
  allocated: '✅', waitlisted: '⏳', promoted: '🎉', trip_cancelled: '⚠️', booking_removed: '🚫', new_trip: '🚌', news: '📰',
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function Notifications() {
  const { snap, user, data, reload } = useApp();
  const mine = (snap?.notifications ?? [])
    .filter((n) => n.userId === user?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Remember what was new when the page opened, so it stays highlighted while it is marked as read.
  const [fresh] = useState(() => new Set(mine.filter((n) => !n.readAt).map((n) => n.id)));

  useEffect(() => {
    if (user && fresh.size > 0) void data.markNotificationsRead(user.id).then(reload);
    // only on opening the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!snap || !user) return null;
  const target = (n: Notification) => (n.tripId && snap.trips.some((t) => t.id === n.tripId) ? `/trip/${n.tripId}` : n.type === 'news' ? '/news' : null);

  return (
    <>
      <h1 className="title">Mitteilungen</h1>
      {mine.length === 0 && <p className="notice">Noch keine Mitteilungen. Hier erfährst du, wenn dein Platz vergeben wird oder es Neues gibt.</p>}
      <div className="stack">
        {mine.map((n) => {
          const to = target(n);
          const body = (
            <>
              <div className="row between">
                <span aria-hidden="true">{ICON[n.type]}</span>
                <span className="muted">{fmtWhen(n.createdAt)}</span>
              </div>
              <h3>{n.title}</h3>
              {n.body && <p className="prose muted">{n.body}</p>}
            </>
          );
          return to ? (
            <Link key={n.id} to={to} className={`card note${fresh.has(n.id) ? ' hot' : ''}`}>{body}</Link>
          ) : (
            <article key={n.id} className={`card note${fresh.has(n.id) ? ' hot' : ''}`}>{body}</article>
          );
        })}
      </div>
    </>
  );
}
