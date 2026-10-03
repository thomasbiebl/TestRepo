import { describe, expect, it } from 'vitest';
import { renderEmail, shouldEmail } from '../supabase/functions/notify-email/format';

describe('notify-email', () => {
  it('sends personal messages by default and messages to everyone only on request', () => {
    const defaults = { email_personal: true, email_broadcast: false };
    for (const type of ['allocated', 'waitlisted', 'promoted', 'trip_cancelled', 'booking_removed']) expect(shouldEmail(type, defaults)).toBe(true);
    for (const type of ['new_trip', 'news']) expect(shouldEmail(type, defaults)).toBe(false);
    expect(shouldEmail('news', { email_personal: false, email_broadcast: true })).toBe(true);
    expect(shouldEmail('allocated', { email_personal: false, email_broadcast: true })).toBe(false);
  });

  it('links to the trip and escapes the content', () => {
    const mail = renderEmail({ id: '1', user_id: 'u', type: 'allocated', title: 'Platz <b>bestätigt</b>', body: 'Zeile 1\nZeile & 2', trip_id: 't-1' }, 'https://x.github.io/Fanclub-App/', 'FC "Test"');
    expect(mail.subject).toContain('Platz');
    expect(mail.html).not.toContain('<b>bestätigt</b>');
    expect(mail.html).toContain('&lt;b&gt;bestätigt&lt;/b&gt;');
    expect(mail.html).toContain('Zeile 1<br>Zeile &amp; 2');
    expect(mail.html).toContain('href="https://x.github.io/Fanclub-App/#/trip/t-1"');
    expect(mail.text).toContain('https://x.github.io/Fanclub-App/#/trip/t-1');
    expect(renderEmail({ id: '2', user_id: 'u', type: 'news', title: 'N', body: 'b', trip_id: null }, 'https://a/', 'C').text).toContain('https://a/#/notifications');
  });
});
