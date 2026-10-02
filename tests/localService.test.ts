import { describe, expect, it } from 'vitest';
import { LocalStorageService } from '../src/data/localStorageService';
import { hashPassword } from '../src/data/seed';
import { parseRoster } from '../src/domain/roster';
import type { User } from '../src/domain/types';

// The service falls back to memory when there is no localStorage (as in Node), which is enough here.
const newUser = async (email: string): Promise<User> => ({
  id: `u-${email}`, email, name: 'Neu', passwordHash: await hashPassword('x'), isMember: false, isAdmin: false,
  memberRequested: false, baseTrips: 0, createdAt: new Date().toISOString(), emailPersonal: true, emailBroadcast: false,
});

describe('member list import', () => {
  it('parses pasted lists in any column order, skips headers, reports bad lines', () => {
    const { entries, errors } = parseRoster([
      'E-Mail;Name;Nr',
      'Max@Example.org;Max Huber;1024',
      '"Anna Maier";anna@example.org;1025',
      'kein-mail;Nur Name;3',
      'lukas@example.org',
      'max@example.org;Max H.;1024',
      'kaputt@@x',
    ].join('\n'));
    expect(entries).toEqual([
      { email: 'max@example.org', name: 'Max H.', memberNumber: '1024' },
      { email: 'anna@example.org', name: 'Anna Maier', memberNumber: '1025' },
      { email: 'lukas@example.org', name: '', memberNumber: '' },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/Zeile 4/);
  });

  it('makes registered people members on import and new accounts members on registration', async () => {
    const svc = new LocalStorageService();
    await svc.addUser(await newUser('frueh@example.org'));
    const res = await svc.importRoster([
      { email: 'frueh@example.org', name: 'Früh', memberNumber: '1' },
      { email: 'spaeter@example.org', name: 'Später', memberNumber: '2' },
    ]);
    expect(res).toEqual({ ok: true, added: 2, updated: 0, promoted: 1 });
    await svc.addUser(await newUser('spaeter@example.org'));
    await svc.addUser(await newUser('fremd@example.org'));
    const snap = await svc.load();
    const member = (mail: string) => snap.users.find((u) => u.email === mail)?.isMember;
    expect([member('frueh@example.org'), member('spaeter@example.org'), member('fremd@example.org')]).toEqual([true, true, false]);
    expect(await svc.importRoster([{ email: 'frueh@example.org', name: 'Neu', memberNumber: '1' }])).toMatchObject({ added: 0, updated: 1 });
  });
});

describe('member code', () => {
  it('only works when set and matches ignoring case and spaces', async () => {
    const svc = new LocalStorageService();
    await svc.addUser(await newUser('a@example.org'));
    expect((await svc.redeemMemberCode('u-a@example.org', 'egal')).ok).toBe(false);
    const snap = await svc.load();
    await svc.saveSettings({ ...snap.settings, memberCode: 'Adler1899' });
    expect((await svc.redeemMemberCode('u-a@example.org', 'falsch')).ok).toBe(false);
    expect((await svc.redeemMemberCode('u-a@example.org', '  adler1899 ')).ok).toBe(true);
    expect((await svc.load()).users.find((u) => u.id === 'u-a@example.org')?.isMember).toBe(true);
  });

  it('refuses a code that is too short', async () => {
    const svc = new LocalStorageService();
    const snap = await svc.load();
    expect((await svc.saveSettings({ ...snap.settings, memberCode: 'abc' })).ok).toBe(false);
  });
});

describe('change log in the demo', () => {
  it('records admin changes in the log, newest first', async () => {
    const svc = new LocalStorageService();
    await svc.saveNews(null, { title: 'Hallo', body: 'Welt', pinned: false }, 'admin');
    const snap = await svc.load();
    await svc.saveSettings({ ...snap.settings, interestDays: 1 });
    const log = (await svc.load()).audit;
    expect(log.map((e) => e.action)).toEqual(['settings_changed', 'news_created']);
    expect(log[0]!.detail).toBe('Vorlauf für Mitglieder');
  });
});
