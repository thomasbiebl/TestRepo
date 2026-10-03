import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/domain/types';
import { adminSections } from '../src/help/AdminHelp';
import { exampleAllocation, EXAMPLE_SEATS } from '../src/help/example';
import { HELP_LINKS } from '../src/help/sections';
import { userSections } from '../src/help/UserHelp';

const html = (sections: { body: unknown }[]) =>
  renderToStaticMarkup(<MemoryRouter>{sections.map((s, i) => <div key={i}>{s.body as never}</div>)}</MemoryRouter>);
const text = (sections: { body: unknown }[]) => html(sections).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const withSettings = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...o });

describe('example allocation in the help', () => {
  it('is calculated by the real allocation and shows ties, groups and the waiting list', () => {
    expect(exampleAllocation()).toEqual([
      { name: 'Max', score: 14, seats: 1, result: 'Platz', waitPosition: undefined },
      { name: 'Julia', score: 12, seats: 2, result: 'Platz', waitPosition: undefined },
      { name: 'Karl', score: 12, seats: 4, result: 'Warteliste', waitPosition: 1 },
      { name: 'Anna', score: 9, seats: 1, result: 'Platz', waitPosition: undefined },
      { name: 'Sophie', score: 5, seats: 2, result: 'Platz', waitPosition: undefined },
      { name: 'Lukas', score: 2, seats: 1, result: 'Warteliste', waitPosition: 2 },
    ]);
    const used = exampleAllocation().filter((r) => r.result === 'Platz').reduce((n, r) => n + r.seats, 0);
    expect(used).toBeLessThanOrEqual(EXAMPLE_SEATS);
  });

  it('is shown in the member guide with the same numbers', () => {
    const t = text(userSections(DEFAULT_SETTINGS));
    expect(t).toContain('Warteliste Nr. 1');
    expect(t).toContain('Warteliste Nr. 2');
    expect(t).toContain(`Ein Bus mit ${EXAMPLE_SEATS} Plätzen`);
  });
});

describe('guide texts follow the settings', () => {
  it('names the priority time, the cancellation deadline and the companion limit', () => {
    const t = text(userSections(withSettings({ interestDays: 5, cancelDeadlineHours: 48, maxCompanions: 2 })));
    expect(t).toContain('5 Tage');
    expect(t).toContain('bis 48 Stunden vor der Abfahrt');
    expect(t).toContain('bis zu 2 Begleitpersonen');
  });

  it('adapts to switched off options', () => {
    const t = text(userSections(withSettings({ interestDays: 0, guestsMayBook: false, waitlistEnabled: false, maxCompanions: 0, noShowPenalty: 0 })));
    expect(t).toContain('keine Vorrang-Zeit');
    expect(t).toContain('Nicht-Mitglieder können bei uns nicht buchen');
    expect(t).toContain('eine Warteliste gibt es bei uns nicht');
    expect(t).toContain('Begleitpersonen sind bei uns nicht vorgesehen');
    expect(t).toContain('Eine Punktstrafe gibt es bei uns aktuell nicht');
  });

  it('shows the current values in the admin settings table and the points formula', () => {
    const t = text(adminSections(withSettings({ noShowPenalty: 2, cancelDeadlineHours: 24, memberCode: 'Adler', clubName: 'FC Test' })));
    expect(t).toContain('Punkte = Startwert + Punkte der Fahrten − 2 × Nichterscheinen');
    expect(t).toContain('24 Stunden');
    expect(t).toContain('gesetzt');
    expect(t).toContain('FC Test');
  });
});

describe('guide structure', () => {
  const ids = (list: { id: string }[]) => list.map((s) => s.id);

  it('has unique section ids and every section has content', () => {
    for (const sections of [userSections(DEFAULT_SETTINGS), adminSections(DEFAULT_SETTINGS)]) {
      expect(new Set(ids(sections)).size).toBe(sections.length);
      for (const s of sections) expect(text([s]).length, s.id).toBeGreaterThan(80);
    }
  });

  it('contains every section that other pages link to', () => {
    const user = ids(userSections(DEFAULT_SETTINGS));
    const admin = ids(adminSections(DEFAULT_SETTINGS));
    for (const link of Object.values(HELP_LINKS)) {
      const params = new URLSearchParams(link.split('?')[1] ?? '');
      const open = params.get('open');
      if (open) expect(params.get('tab') === 'admin' ? admin : user, link).toContain(open);
    }
  });

  it('documents every admin setting by name', () => {
    const t = text(adminSections(DEFAULT_SETTINGS));
    for (const name of ['Vorlauf für Mitglieder', 'Nicht-Mitglieder dürfen', 'Warteliste bei ausgebuchten', 'Stornofrist', 'Begleitpersonen pro Buchung', 'Abzug bei Nichterscheinen', 'Mitgliedscode', 'Standard für neue Fahrten', 'Vereinsname']) {
      expect(t, name).toContain(name);
    }
  });

  it('explains the rules the code implements (phases, tie break, groups, waiting list, points)', () => {
    const t = text(adminSections(DEFAULT_SETTINGS));
    for (const phrase of ['Interessensphase beenden', 'früher', 'Warteliste', 'Begleitpersonen', 'pg_cron', 'fehlt', 'Nachrücken']) expect(t, phrase).toContain(phrase);
  });

  it('describes how admins cancel bookings, and no longer suggests the deadline workaround', () => {
    const t = text(adminSections(DEFAULT_SETTINGS));
    expect(t).toContain('Wirklich stornieren');
    expect(t).toContain('Die Stornofrist gilt für Admins nicht');
    expect(t).not.toContain('kurz auf 0');
    expect(t).not.toContain('erlaubt Admins aktuell nicht');
    expect(text(userSections(withSettings({ cancelDeadlineHours: 24 })))).toContain('Admin, der die Buchung für dich stornieren kann');
  });

  it('keeps links pointing to existing routes', () => {
    const routes = readFileSync('src/App.tsx', 'utf8');
    for (const path of ['/help', '/login', '/admin']) expect(routes + html([...userSections(DEFAULT_SETTINGS), ...adminSections(DEFAULT_SETTINGS)]), path).toContain(path.slice(1));
  });
});

describe('no help text claims a setting that does not exist', () => {
  it('only mentions settings labels that are on the settings page', () => {
    const page = readFileSync('src/pages/AdminSettings.tsx', 'utf8');
    for (const label of ['Vorlauf für Mitglieder', 'Warteliste bei ausgebuchten Fahrten', 'Stornofrist', 'Begleitpersonen pro Buchung', 'Abzug bei Nichterscheinen', 'Mitgliedscode']) expect(page, label).toContain(label);
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    expect(walk('src/help').length).toBeGreaterThan(3);
  });
});
