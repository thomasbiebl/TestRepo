import type { ReactNode } from 'react';

export interface HelpSection {
  id: string;
  title: string;
  /** Extra words the search should find, besides the title. */
  keywords: string;
  body: ReactNode;
}

/** Links into the help from other pages. The ids exist in UserHelp.tsx and AdminHelp.tsx (checked by a test). */
export const HELP_LINKS = {
  allocation: '/help?open=vergabe',
  cancelling: '/help?open=stornieren',
  adminSettings: '/help?tab=admin&open=einstellungen',
  adminList: '/help?tab=admin&open=liste',
  adminLogic: '/help?tab=admin&open=logik',
  admin: '/help?tab=admin',
  start: '/help',
} as const;
