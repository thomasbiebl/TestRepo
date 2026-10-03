import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scrollToTop } from '../src/lib/scroll';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

describe('React effects', () => {
  it('never return a value by accident (React would call it as cleanup and crash)', () => {
    // Matches useEffect(() => something(...)) and useEffect(fn, ...) without a block body.
    const bad = files('src')
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => /use(Layout)?Effect\(\s*(\(\)\s*=>\s*[^{\s]|[A-Za-z_]\w*\s*,)/.test(line)),
      );
    expect(bad.map((b) => `${b.f}:${b.i}: ${b.line.trim()}`)).toEqual([]);
  });

  it('scrollToTop returns nothing even when the browser returns a Promise from scrollTo', () => {
    vi.stubGlobal('window', { scrollTo: () => Promise.resolve() });
    expect(scrollToTop()).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
