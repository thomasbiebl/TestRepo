import type { Settings } from '../domain/types';

export const daysText = (n: number) => (n === 1 ? '1 Tag' : `${n} Tage`);
export const hoursText = (n: number) => (n === 1 ? '1 Stunde' : `${n} Stunden`);

/** How long members have priority, in words. */
export const priorityText = (s: Settings) =>
  s.interestDays === 0 ? 'keine Vorrang-Zeit, alle können sofort buchen' : `${daysText(s.interestDays)} Vorrang für Mitglieder`;

export const cancelText = (s: Settings) =>
  s.cancelDeadlineHours === 0 ? 'bis zur Abfahrt' : `bis ${hoursText(s.cancelDeadlineHours)} vor der Abfahrt`;
