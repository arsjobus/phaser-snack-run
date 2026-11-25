/**
 * Localization (pure TypeScript, no Phaser). A locale is a flat key -> text mapping; the game looks
 * every on-screen string up with `t(key, vars)`.
 *
 * Adding a language: drop a JSON file named after its code (`src/i18n/locales/it.json`) next to the
 * others. It must contain `"meta.name"` (the language's own name, shown in the settings); every other
 * key is optional, and a missing one falls back to English, then to the key itself. Only languages that
 * have such a file can be chosen (`isLocaleAvailable`), so a code without a mapping is never offered.
 */

export type Catalog = Readonly<Record<string, string>>;

export const DEFAULT_LOCALE = 'en';
/** The key that holds a locale's own name. */
export const NAME_KEY = 'meta.name';

const catalogs = new Map<string, Catalog>();
let current = DEFAULT_LOCALE;

/** Registers (or replaces) a locale's mapping. Non-string values are ignored; a mapping without `meta.name` is refused. */
export function registerLocale(code: string, raw: unknown): boolean {
  if (!code || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  if (!out[NAME_KEY]) return false;
  catalogs.set(code, out);
  return true;
}

/** Codes of every registered language, the default first and the rest alphabetical. */
export function availableLocales(): string[] {
  return [...catalogs.keys()].sort((a, b) => (a === DEFAULT_LOCALE ? -1 : b === DEFAULT_LOCALE ? 1 : a.localeCompare(b)));
}

export const isLocaleAvailable = (code: unknown): code is string => typeof code === 'string' && catalogs.has(code);

/** A language's own name ("Español"), or its code when it is not registered. */
export const localeName = (code: string): string => catalogs.get(code)?.[NAME_KEY] ?? code;

/** Switches language. Returns false (and changes nothing) when there is no mapping for `code`. */
export function setLocale(code: string): boolean {
  if (!isLocaleAvailable(code)) return false;
  current = code;
  return true;
}

export const getLocale = (): string => current;

/** `{name}` placeholders are replaced from `vars`; an unknown placeholder is left as written. */
export function format(text: string, vars?: Readonly<Record<string, string | number>>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Looks a string up in the current language, then English, then returns the key. */
export function t(key: string, vars?: Readonly<Record<string, string | number>>): string {
  const text = catalogs.get(current)?.[key] ?? catalogs.get(DEFAULT_LOCALE)?.[key] ?? key;
  return format(text, vars);
}

/** True when `key` has a translation in `code` itself (no fallback). */
export const hasKey = (code: string, key: string): boolean => catalogs.get(code)?.[key] !== undefined;

/** The keys of the default language that `code` has not translated yet. */
export function missingKeys(code: string): string[] {
  const base = catalogs.get(DEFAULT_LOCALE);
  if (!base) return [];
  return Object.keys(base).filter((k) => !hasKey(code, k));
}
