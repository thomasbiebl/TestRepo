/** Where the demo login remembers who is logged in. */
export const SESSION_KEY = 'fanclub.session.v1';

export function sessionUserId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
