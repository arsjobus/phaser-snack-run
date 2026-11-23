#!/usr/bin/env python3
"""
Renders the game's one-shot sound effects to public/audio/*.mp3.

These files are the *starting point*: the game just plays whatever mp3 is in public/audio under
the names listed in src/audio/sfx.ts. Swap any file for your own sound (keep the file name, or
change it in sfx.ts) and nothing else needs to change. This script is only here so the originals
can be regenerated; you never need to run it.

Needs: python3, numpy, scipy and ffmpeg (with libmp3lame).
    python3 scripts/make-sfx.py            # writes public/audio/*.mp3
    python3 scripts/make-sfx.py --peaks    # also prints each file's original peak level
"""
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy.signal import lfilter, resample_poly

SR = 44100
OVER = 4  # oscillators are generated at 4x and decimated, to keep square/saw waves from aliasing
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "audio"
rng = np.random.default_rng(1234)


def midi_to_hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def env(n, attack, dur, peak):
    """Quick linear attack, then an exponential decay to silence at `dur` (like the old Web Audio env)."""
    t = np.arange(n) / SR
    e = np.zeros(n)
    a = t < attack
    e[a] = peak * t[a] / max(attack, 1e-6)
    d = (t >= attack) & (t < dur)
    e[d] = peak * (0.0001 / peak) ** ((t[d] - attack) / max(dur - attack, 1e-6))
    return e


def osc(kind, f0, f1, dur, vol, attack=0.005, sweep=None):
    """One tone: `kind` wave gliding f0 -> f1 (exponentially) over `sweep` s (default: no glide)."""
    n = int((dur + 0.03) * SR)
    t = np.arange(n * OVER) / (SR * OVER)
    if f1 is None or f1 == f0:
        f = np.full_like(t, f0)
    else:
        s = sweep if sweep else dur
        f = f0 * (f1 / f0) ** np.minimum(t / s, 1.0)
    ph = np.cumsum(f) / (SR * OVER)
    frac = ph % 1.0
    if kind == "sine":
        w = np.sin(2 * np.pi * ph)
    elif kind == "square":
        w = np.where(frac < 0.5, 1.0, -1.0)
    elif kind == "sawtooth":
        w = 2 * frac - 1
    else:  # triangle
        w = 4 * np.abs(frac - 0.5) - 1
    w = resample_poly(w, 1, OVER)[:n]
    return w * env(n, attack, dur, vol)


def biquad(kind, f, q):
    w0 = 2 * np.pi * min(f, SR * 0.45) / SR
    alpha = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    if kind == "lowpass":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == "highpass":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else:  # bandpass, constant 0 dB peak
        b = [alpha, 0.0, -alpha]
    a = [1 + alpha, -2 * c, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def noise(kind, f, dur, vol, sweep=None, q=None):
    """Filtered white noise; `sweep=(from, to)` glides the cutoff linearly over `dur`."""
    n = int((dur + 0.03) * SR)
    x = rng.uniform(-1, 1, n)
    q = q if q is not None else (1.0 if kind == "bandpass" else 0.8)
    out = np.zeros(n)
    block = 128
    zi = np.zeros(2)
    for i in range(0, n, block):
        tt = min(1.0, (i / SR) / dur)
        fc = f if sweep is None else sweep[0] + (sweep[1] - sweep[0]) * tt
        b, a = biquad(kind, fc, q)
        y, zi = lfilter(b, a, x[i : i + block], zi=zi)
        out[i : i + block] = y
    return out * env(n, 0.002, dur, vol)


class Mix:
    def __init__(self):
        self.parts = []

    def add(self, sig, at=0.0):
        self.parts.append((int(at * SR), sig))

    def render(self):
        n = max(o + len(s) for o, s in self.parts)
        buf = np.zeros(n)
        for o, s in self.parts:
            buf[o : o + len(s)] += s
        return buf


def blip(m, kind, freq, dur, vol, at=0.0):
    m.add(osc(kind, freq, None, dur, vol), at)


def stinger(m, at=0.0):
    for i, n in enumerate([0, 4, 7, 12, 16]):
        blip(m, "square", midi_to_hz(69 + n), 0.2, 0.1, at + i * 0.07)


# ---- the sounds ---------------------------------------------------------------------------------


def snack():  # G5 chime; the game pitches it up the pentatonic scale with the combo
    m = Mix()
    blip(m, "triangle", midi_to_hz(79), 0.12, 0.16)
    blip(m, "sine", midi_to_hz(79) * 2, 0.08, 0.05)
    return m


def fuel():
    m = Mix()
    m.add(noise("bandpass", 300, 0.35, 0.35, sweep=(300, 1000)))
    blip(m, "triangle", 392, 0.12, 0.14, 0.05)
    blip(m, "triangle", 523, 0.2, 0.14, 0.15)
    return m


def land():  # full-power landing; the game turns it down for short hops
    m = Mix()
    m.add(osc("sine", 130, 45, 0.22, 0.6, attack=0.003, sweep=0.18))
    m.add(noise("lowpass", 900, 0.14, 0.3))
    return m


def thud_soft():
    m = Mix()
    m.add(noise("lowpass", 700, 0.1, 0.25))
    m.add(osc("sine", 110, 70, 0.12, 0.3, attack=0.003, sweep=0.2))
    return m


def thud_hard():
    m = Mix()
    m.add(noise("bandpass", 1800, 0.3, 0.55))
    m.add(osc("sawtooth", 90, 45, 0.25, 0.35, attack=0.003, sweep=0.2))
    return m


def wrench():
    m = Mix()
    blip(m, "triangle", 520, 0.08, 0.13)
    blip(m, "triangle", 780, 0.14, 0.13, 0.08)
    return m


def takedown():
    m = Mix()
    for i, f in enumerate([440, 554, 660, 880]):
        blip(m, "square", f, 0.24 if i == 3 else 0.09, 0.14, i * 0.08)
    return m


def checkpoint():
    m = Mix()
    blip(m, "triangle", 660, 0.12, 0.14)
    blip(m, "triangle", 880, 0.12, 0.14, 0.1)
    blip(m, "triangle", 1320, 0.26, 0.14, 0.2)
    stinger(m)
    return m


def swerve():
    m = Mix()
    m.add(noise("bandpass", 500, 0.16, 0.22, sweep=(500, 1800)))
    return m


def reward():
    m = Mix()
    blip(m, "triangle", 784, 0.1, 0.13)
    blip(m, "triangle", 1175, 0.2, 0.13, 0.09)
    return m


def low_fuel():
    m = Mix()
    blip(m, "square", 880, 0.09, 0.12)
    return m


def empty():
    m = Mix()
    for f, at in zip([110, 96, 80, 62], [0, 0.18, 0.4, 0.75]):
        blip(m, "square", f, 0.12, 0.3, at)
    return m


def boost():  # a mid-stage whoosh; the game shifts the pitch up for each pad of the stage
    m = Mix()
    up = 3
    m.add(noise("bandpass", 700 + up * 260, 0.5, 0.5, sweep=(400, 3200)))
    m.add(osc("sawtooth", 110 + up * 30, 380 + up * 90, 0.4, 0.22, attack=0.01, sweep=0.35))
    return m


def pyro():
    m = Mix()
    m.add(osc("sine", 90, 38, 0.35, 0.7, attack=0.004, sweep=0.3))
    m.add(noise("highpass", 2500, 0.9, 0.35))
    return m


def rocket():
    m = Mix()
    m.add(osc("sine", 600, 2400, 0.6, 0.08, attack=0.02, sweep=0.65))
    return m


def burst():  # loud shell; the game plays it quieter for the finale
    m = Mix()
    m.add(noise("bandpass", 2200, 0.45, 0.55, sweep=(4000, 600)))
    m.add(noise("highpass", 5000, 0.25, 0.2), 0.08)
    return m


def show_landed():
    m = Mix()
    for i, f in enumerate([523, 659, 784, 1047]):
        blip(m, "square", f, 0.4 if i == 3 else 0.1, 0.13, i * 0.09)
    stinger(m)
    return m


def game_over():
    m = Mix()
    for i, midi in enumerate([64, 62, 60, 57]):
        blip(m, "sawtooth", midi_to_hz(midi), 0.7 if i == 3 else 0.28, 0.14, i * 0.3)
    return m


SOUNDS = {
    "snack": snack,
    "fuel": fuel,
    "land": land,
    "thud-soft": thud_soft,
    "thud-hard": thud_hard,
    "wrench": wrench,
    "takedown": takedown,
    "checkpoint": checkpoint,
    "swerve": swerve,
    "reward": reward,
    "low-fuel": low_fuel,
    "empty": empty,
    "boost": boost,
    "pyro": pyro,
    "rocket": rocket,
    "burst": burst,
    "show-landed": show_landed,
    "game-over": game_over,
}

TARGET_PEAK = 0.9


def to_mp3(name, samples):
    peak = float(np.max(np.abs(samples))) or 1.0
    samples = samples / peak * TARGET_PEAK  # every file is normalised; sfx.ts holds the playback volume
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / f"{name}.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        out = OUT_DIR / f"{name}.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "128k", str(out)],
            check=True,
        )
    return peak


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    show = "--peaks" in sys.argv
    for name, build in SOUNDS.items():
        peak = to_mp3(name, build().render())
        print(f"{name}.mp3" + (f"  original peak {peak:.3f}" if show else ""))


if __name__ == "__main__":
    main()
