// Supabase Edge Function: sends an e-mail for each new row in public.notifications.
//
// Setup (see docs/SUPABASE.md):
//   supabase functions deploy notify-email --no-verify-jwt
//   Secrets: BREVO_API_KEY, MAIL_FROM, MAIL_FROM_NAME, APP_URL, WEBHOOK_SECRET
//   Database Webhook: table notifications, event INSERT, HTTP header x-webhook-secret = WEBHOOK_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderEmail, shouldEmail, type EmailPrefs, type NotificationRecord } from './format.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return json({ error: 'forbidden' }, 403);

  const payload = await req.json().catch(() => null) as { type?: string; table?: string; record?: NotificationRecord } | null;
  if (payload?.type !== 'INSERT' || payload.table !== 'notifications' || !payload.record) return json({ skipped: 'not a notification insert' });
  const n = payload.record;

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const [{ data: profile }, { data: settings }] = await Promise.all([
    sb.from('profiles').select('email, name, email_personal, email_broadcast').eq('id', n.user_id).maybeSingle(),
    sb.from('settings').select('club_name').eq('id', 1).maybeSingle(),
  ]);
  if (!profile?.email || !shouldEmail(n.type, profile as EmailPrefs)) return json({ skipped: 'user does not want this e-mail' });

  const appUrl = Deno.env.get('APP_URL') ?? '';
  const clubName = settings?.club_name ?? 'Fanclub';
  const mail = renderEmail(n, appUrl, clubName);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': Deno.env.get('BREVO_API_KEY')!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: Deno.env.get('MAIL_FROM'), name: Deno.env.get('MAIL_FROM_NAME') ?? clubName },
      to: [{ email: profile.email, name: profile.name }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
  });
  if (!res.ok) return json({ error: 'mail provider refused', status: res.status, detail: await res.text() }, 502);
  return json({ sent: true });
});
