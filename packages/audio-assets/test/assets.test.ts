import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SOUND_FILES, THEMES } from '../src/manifest.js';

const dir = join(__dirname, '..', 'sounds');

describe('bundled audio assets', () => {
  it('every manifest file exists and is < 50 KB', () => {
    for (const f of ALL_SOUND_FILES) {
      const size = statSync(join(dir, f)).size;
      expect(size, f).toBeGreaterThan(500);
      expect(size, f).toBeLessThan(50 * 1024);
    }
  });
  it('no unexpected mp3 files outside the manifest', () => {
    const mp3 = readdirSync(dir).filter((f) => f.endsWith('.mp3'));
    expect(mp3.sort()).toEqual([...ALL_SOUND_FILES].sort());
  });
  it('each theme has 4 sounds', () => {
    for (const t of Object.values(THEMES)) expect(t).toHaveLength(4);
  });
  it('every file is registered in LICENSES.md', () => {
    const lic = readFileSync(join(__dirname, '..', 'LICENSES.md'), 'utf8');
    for (const f of ALL_SOUND_FILES) expect(lic, f).toContain(f);
  });
});
