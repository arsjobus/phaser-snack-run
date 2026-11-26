import { DEFAULT_LOCALE, isLocaleAvailable } from '../i18n';
import type { KeyValueStore } from '../progress/Storage';

/** Player settings (Phase 8): volumes, comfort options, quality, touch and remappable keys. */

export const SETTINGS_KEY = 'snack-run:settings';

/** The rebindable in-run actions. Menu keys (Space/Enter, G, D, O, Esc) are fixed. */
export const ACTIONS = ['gas', 'brake', 'far', 'near', 'mute', 'music', 'debug'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  gas: 'Gas',
  brake: 'Brake / reverse',
  far: 'Drift lanes (change upper)',
  near: 'Drift lanes (change lower)',
  mute: 'Mute all',
  music: 'Music on/off',
  debug: 'Debug overlay',
};

/** Key codes (`KeyboardEvent.code`) per action; the first is the primary key shown in menus. */
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Readonly<Bindings> = {
  gas: ['ArrowRight', 'KeyD'],
  brake: ['ArrowLeft', 'KeyA'],
  far: ['ArrowUp', 'KeyW'],
  near: ['ArrowDown', 'KeyS'],
  mute: ['KeyM'],
  music: ['KeyN'],
  debug: ['KeyH'],
};

/** Keys that cannot be bound (they run the menus). */
export const RESERVED_KEYS: readonly string[] = ['Escape', 'Enter', 'NumpadEnter'];

export type EffectsLevel = 'auto' | 'full' | 'reduced';
export type TouchMode = 'auto' | 'on' | 'off';

export interface Settings {
  /** 0..1 volumes. */
  master: number;
  music: number;
  sfx: number;
  /** 0..1 strength of screen shake. */
  shake: number;
  /** Calms everything that moves for its own sake: no shake, no bobbing, no drifting clouds, fewer particles. */
  reducedMotion: boolean;
  effects: EffectsLevel;
  touch: TouchMode;
  /** Code of a language that has a locale file (`src/i18n/locales`). */
  language: string;
  bindings: Bindings;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  master: 1,
  music: 1,
  sfx: 1,
  shake: 1,
  reducedMotion: false,
  effects: 'auto',
  touch: 'auto',
  language: DEFAULT_LOCALE,
  bindings: DEFAULT_BINDINGS,
};

export const cloneBindings = (b: Readonly<Bindings>): Bindings => {
  const out = {} as Bindings;
  for (const a of ACTIONS) out[a] = [...b[a]];
  return out;
};

export const defaultSettings = (): Settings => ({ ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) });

const unit = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, Math.round(v * 100) / 100)) : fallback;
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const pick = <T extends string>(v: unknown, all: readonly T[], fallback: T): T =>
  all.includes(v as T) ? (v as T) : fallback;

/** Turns whatever was in storage into valid settings (bad values fall back to defaults). */
export function sanitizeSettings(raw: unknown): Settings {
  const s = defaultSettings();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  s.master = unit(r.master, s.master);
  s.music = unit(r.music, s.music);
  s.sfx = unit(r.sfx, s.sfx);
  s.shake = unit(r.shake, s.shake);
  s.reducedMotion = flag(r.reducedMotion, s.reducedMotion);
  s.effects = pick(r.effects, ['auto', 'full', 'reduced'] as const, s.effects);
  s.touch = pick(r.touch, ['auto', 'on', 'off'] as const, s.touch);
  s.language = isLocaleAvailable(r.language) ? r.language : s.language;
  const rb = r.bindings && typeof r.bindings === 'object' ? (r.bindings as Record<string, unknown>) : {};
  // Every action keeps at least one key and no key runs two actions: the first claim on a key wins,
  // and an action left without keys gets its defaults that are still free.
  const taken = new Set<string>();
  for (const a of ACTIONS) {
    const list = Array.isArray(rb[a]) ? (rb[a] as unknown[]) : [];
    const keys: string[] = [];
    for (const k of list) {
      if (typeof k !== 'string' || !k || RESERVED_KEYS.includes(k) || taken.has(k) || keys.includes(k)) continue;
      if (keys.length < 3) keys.push(k);
    }
    keys.forEach((k) => taken.add(k));
    s.bindings[a] = keys;
  }
  for (const a of ACTIONS) {
    if (s.bindings[a].length) continue;
    const free = DEFAULT_BINDINGS[a].filter((k) => !taken.has(k));
    s.bindings[a] = free.length ? free : [DEFAULT_BINDINGS[a][0]];
    s.bindings[a].forEach((k) => taken.add(k));
  }
  return s;
}

export function loadSettings(store: KeyValueStore): Settings {
  try {
    const text = store.getItem(SETTINGS_KEY);
    return sanitizeSettings(text ? JSON.parse(text) : null);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(store: KeyValueStore, s: Settings): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked: the settings last for this session only
  }
}

/**
 * Makes `code` the primary key of `action`. If another action had it, that action loses it; an
 * action left with no key swaps in the key `action` gave up, so nothing becomes unbindable.
 * Returns a new object (reserved keys are refused: the same bindings come back).
 */
export function setBinding(b: Readonly<Bindings>, action: Action, code: string): Bindings {
  if (RESERVED_KEYS.includes(code)) return cloneBindings(b);
  const out = cloneBindings(b);
  const old = out[action][0];
  for (const a of ACTIONS) {
    if (a === action || !out[a].includes(code)) continue;
    out[a] = out[a].filter((k) => k !== code);
    if (out[a].length === 0 && old && old !== code) out[a] = [old];
  }
  const claimed = new Set<string>();
  for (const a of ACTIONS) if (a !== action) out[a].forEach((k) => claimed.add(k));
  out[action] = [code, ...out[action].filter((k) => k !== code && !claimed.has(k))].slice(0, 3);
  return out;
}

/** Short on-screen name of a key code. */
export function keyLabel(code: string): string {
  if (code.startsWith('Arrow')) return { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[code] ?? code;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

/** The keys of an action as a label, e.g. "→ / D". */
export const bindingText = (b: Readonly<Bindings>, a: Action): string => b[a].map(keyLabel).join(' / ');

// ---- what the settings do ---------------------------------------------------------------------

export const musicLevel = (s: Settings): number => s.master * s.music;
export const sfxLevel = (s: Settings): number => s.master * s.sfx;

/** Screen shake strength multiplier (0 when reduced motion is on). */
export const shakeScale = (s: Settings): number => (s.reducedMotion ? 0 : s.shake);

/** Particle count multiplier. */
export const particleScale = (s: Settings, quality: number): number => Math.min(quality, s.reducedMotion ? 0.35 : 1);
