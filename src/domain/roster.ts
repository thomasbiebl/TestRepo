import type { RosterEntry } from './types';

const EMAIL = /^\S+@\S+\.\S+$/;
const clean = (s: string) => s.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim();

/**
 * Reads a pasted member list. One person per line, separated by semicolon, tab or comma, in any
 * order: the cell with an @ is the e-mail address, then come the name and the member number.
 * A header line without an e-mail address is skipped.
 */
export function parseRoster(text: string): { entries: RosterEntry[]; errors: string[] } {
  const found = new Map<string, RosterEntry>();
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
    const cells = line.split(sep).map(clean);
    const email = cells.find((c) => c.includes('@'))?.toLowerCase();
    if (!email) {
      if (found.size > 0 || i > 0) errors.push(`Zeile ${i + 1}: keine E-Mail-Adresse gefunden`);
      return;
    }
    if (!EMAIL.test(email)) return void errors.push(`Zeile ${i + 1}: „${email}“ ist keine gültige E-Mail-Adresse`);
    const rest = cells.filter((c) => c && c.toLowerCase() !== email);
    found.set(email, { email, name: rest[0] ?? '', memberNumber: rest[1] ?? '' });
  });
  return { entries: [...found.values()], errors };
}
