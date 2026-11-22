/**
 * The game's two typefaces, both free under the SIL Open Font License (see ASSETS.md and
 * `public/fonts/`), both bundled so nothing is fetched from a third party:
 *  - primary (display): Russo One: chunky, sporty capitals for titles, buttons and big numbers,
 *  - secondary (text): Rajdhani (semi-bold and bold): a squarish, condensed face for labels,
 *    descriptions and tables (its digits line up in columns).
 * To swap a font, change the two stacks and the `FACES` list here: nothing else names a font.
 */
export const FONT_DISPLAY = '"Russo One", "Arial Black", Impact, sans-serif';
export const FONT_BODY = '"Rajdhani", "Arial Narrow", Arial, sans-serif';

interface Face {
  family: string;
  file: string;
  weight: string;
}

const FACES: readonly Face[] = [
  { family: 'Russo One', file: 'fonts/russo-one-latin-400-normal.woff2', weight: '400' },
  { family: 'Rajdhani', file: 'fonts/rajdhani-latin-600-normal.woff2', weight: '600' },
  { family: 'Rajdhani', file: 'fonts/rajdhani-latin-700-normal.woff2', weight: '700' },
];

/**
 * Loads the bundled fonts, so Phaser's canvas text measures the real glyphs. Never rejects: if a
 * font fails (or the browser has no FontFace API) the stacks above fall back to system fonts.
 */
export async function loadFonts(base: string = import.meta.env.BASE_URL): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  await Promise.all(
    FACES.map(async (f) => {
      try {
        const face = new FontFace(f.family, `url(${base}${f.file}) format("woff2")`, { weight: f.weight });
        document.fonts.add(await face.load());
      } catch {
        /* fall back to the system stack */
      }
    }),
  );
}
