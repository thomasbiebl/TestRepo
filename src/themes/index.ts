export interface ThemeInfo {
  id: string;
  label: string;
  description: string;
  /** Color of the browser/status bar (meta theme-color). */
  barColor: string;
  /** Preview swatches: background, surface, accent. */
  swatches: [string, string, string];
}

/**
 * To add a design: create src/themes/<id>.css with a `:root[data-theme='<id>']` block that
 * defines the same tokens as nacht.css, import it in main.tsx and list it here.
 */
export const THEMES: ThemeInfo[] = [
  { id: 'nacht', label: 'Stadion-Nacht', description: 'Dunkel mit roten Highlights', barColor: '#0B1D3A', swatches: ['#0B1D3A', '#13294d', '#DC052D'] },
  { id: 'klassisch', label: 'Klassisch', description: 'Hell mit rotem Header', barColor: '#DC052D', swatches: ['#F2F4F7', '#ffffff', '#DC052D'] },
];

export const DEFAULT_THEME = 'nacht';
