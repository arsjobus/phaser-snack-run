import Phaser from 'phaser';
import { firstPad } from './Gamepad';

/**
 * Gets the game window ready to take keys and make sound when the player starts with a gamepad.
 * Browsers only give keyboard focus to a page the player clicked, and keep audio locked until a click
 * or key press; embedded on itch.io the game sits in an iframe, so a pad-only start used to play
 * silently until you also clicked the window. Pressing any pad button now focuses the frame and the
 * canvas and asks the audio context to resume. Some browsers still refuse that without a real click
 * or key press, so a small hint appears until sound is on.
 */

function audioContext(game: Phaser.Game): AudioContext | null {
  const sound = game.sound;
  return sound instanceof Phaser.Sound.WebAudioSoundManager ? sound.context : null;
}

/** Focus the window and canvas, and try to start the audio. Safe to call at any time. */
export function focusGame(game: Phaser.Game): void {
  try {
    window.focus();
    const canvas = game.canvas;
    if (canvas) {
      if (canvas.tabIndex < 0) canvas.tabIndex = 0;
      canvas.style.outline = 'none';
      canvas.focus({ preventScroll: true });
    }
  } catch {
    // focus can be refused (a hidden frame); nothing else to do
  }
  const ctx = audioContext(game);
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => undefined);
}

let hint: HTMLDivElement | null = null;

function showSoundHint(): void {
  if (hint || typeof document === 'undefined') return;
  hint = document.createElement('div');
  hint.textContent = 'CLICK OR PRESS A KEY FOR SOUND';
  hint.setAttribute('role', 'status');
  Object.assign(hint.style, {
    position: 'fixed',
    left: '50%',
    bottom: '14px',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    border: '3px solid #0a0a10',
    borderRadius: '8px',
    background: '#f2c200',
    color: '#14224a',
    font: '400 14px "Russo One", "Arial Black", Impact, sans-serif',
    letterSpacing: '0.08em',
    pointerEvents: 'none',
    zIndex: '5',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(hint);
}

function hideSoundHint(): void {
  hint?.remove();
  hint = null;
}

/** Watches the first connected pad (and the pad-connected event) and focuses the game on a button press. */
export function installPadFocus(game: Phaser.Game): void {
  let held = false;
  let timer: number | undefined;

  const check = (): void => {
    const ctx = audioContext(game);
    if (ctx && ctx.state !== 'running') showSoundHint();
    else hideSoundHint();
  };
  const press = (): void => {
    focusGame(game);
    window.clearTimeout(timer);
    // Give a resume() a moment to take effect before deciding the hint is needed.
    timer = window.setTimeout(check, 250);
  };

  window.addEventListener('gamepadconnected', press);
  // Real clicks and keys unlock the audio themselves (Phaser listens for them): drop the hint then.
  const clear = (): void => {
    window.setTimeout(check, 100);
  };
  window.addEventListener('pointerdown', clear);
  window.addEventListener('keydown', clear);

  window.setInterval(() => {
    const pad = firstPad();
    const down = !!pad && (pad.buttons.some((b) => b.pressed) || pad.axes.some((a) => Math.abs(a) > 0.6));
    if (down && !held) press();
    held = down;
  }, 80);
}
