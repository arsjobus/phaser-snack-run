import { describe, expect, it } from 'vitest';
import { PIXEL_FONT, pixelTextWidth } from '../src/art/pixelFont';
import { SFX, SFX_KEYS, sfxCacheKey, sfxUrl } from '../src/audio/sfx';

/** File names of every mp3 in public/assets/audio (only the keys are used; nothing is imported). */
const FILES = Object.keys(import.meta.glob('../public/assets/audio/*.mp3')).map((p) => p.split('/').pop() as string);

describe('pixel font', () => {
  it('has a glyph for every letter of BOOST (the sign used to read OOST)', () => {
    for (const ch of 'BOOST') expect(PIXEL_FONT[ch], `glyph ${ch}`).toBeDefined();
    expect(pixelTextWidth('BOOST', 4)).toBe(5 * 4 * 4 - 4);
  });

  it('has 3x5 glyphs, and B differs from D and 8', () => {
    for (const [ch, rows] of Object.entries(PIXEL_FONT)) {
      expect(rows, ch).toHaveLength(5);
      for (const row of rows) expect(row, ch).toMatch(/^[01]{3}$/);
    }
    expect(PIXEL_FONT.B).not.toEqual(PIXEL_FONT.D);
    expect(PIXEL_FONT.B).not.toEqual(PIXEL_FONT['8']);
  });
});

describe('sound effect files', () => {
  it('every effect points at an mp3 that exists in public/assets/audio', () => {
    for (const key of SFX_KEYS) {
      const file = SFX[key].file;
      expect(file, key).toMatch(/\.mp3$/);
      expect(FILES, `${file} is missing from public/assets/audio`).toContain(file);
    }
  });

  it('uses unique files, cache keys and URLs under audio/', () => {
    expect(new Set(SFX_KEYS.map((k) => SFX[k].file)).size).toBe(SFX_KEYS.length);
    expect(new Set(SFX_KEYS.map(sfxCacheKey)).size).toBe(SFX_KEYS.length);
    for (const key of SFX_KEYS) expect(sfxUrl(key)).toBe(`audio/${SFX[key].file}`);
  });

  it('has sane playback volumes', () => {
    for (const key of SFX_KEYS) {
      expect(SFX[key].volume, key).toBeGreaterThan(0);
      expect(SFX[key].volume, key).toBeLessThanOrEqual(1.5);
    }
  });

  it('leaves no unlisted sound effect mp3s lying around (besides the music)', () => {
    const listed = new Set<string>(SFX_KEYS.map((k) => SFX[k].file));
    const stray = FILES.filter((f) => f !== 'bgm.mp3' && !listed.has(f));
    expect(stray).toEqual([]);
  });
});
