// Pure helpers of the notify-email function, kept free of Deno APIs so they can be tested with Vitest.

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  trip_id: string | null;
}

export interface EmailPrefs {
  email_personal: boolean;
  email_broadcast: boolean;
}

const PERSONAL = new Set(['allocated', 'waitlisted', 'promoted', 'trip_cancelled', 'booking_removed']);

/** Personal messages follow `email_personal`, messages to everyone follow `email_broadcast`. */
export function shouldEmail(type: string, prefs: EmailPrefs): boolean {
  return PERSONAL.has(type) ? prefs.email_personal : prefs.email_broadcast;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderEmail(n: NotificationRecord, appUrl: string, clubName: string) {
  const link = n.trip_id ? `${appUrl}#/trip/${n.trip_id}` : `${appUrl}#/notifications`;
  const text = `${n.body}\n\nIn der App ansehen: ${link}\n\nDu bekommst diese Mail, weil du E-Mail-Benachrichtigungen aktiviert hast. Das kannst du in deinem Profil ändern.`;
  const html = [
    `<p style="font-size:16px"><b>${escapeHtml(n.title)}</b></p>`,
    `<p>${escapeHtml(n.body).replace(/\n/g, '<br>')}</p>`,
    `<p><a href="${escapeHtml(link)}">In der App ansehen</a></p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(clubName)} · Du bekommst diese Mail, weil du E-Mail-Benachrichtigungen aktiviert hast. Das kannst du in deinem Profil ändern.</p>`,
  ].join('');
  return { subject: n.title, html, text };
}
