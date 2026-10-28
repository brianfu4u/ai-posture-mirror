#!/usr/bin/env python3
"""
Procedural synthesis of every sound in @apm/audio-assets.

All waveforms are generated here from math (sine / square / saw / noise + envelopes).
No samples, recordings, or third-party audio are used, and no known copyrighted sound
(e.g. Minion laugh, Mario coin) is imitated: melodies and timbres are original.
Output is dedicated to the public domain (CC0 1.0), see ../LICENSES.md.

Usage:  python3 tools/synth.py        (needs numpy + ffmpeg with libmp3lame)
Deterministic: noise uses a fixed seed, so re-running yields identical WAVs.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "sounds")
rng = np.random.default_rng(20261028)


def t_(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.005, r=0.05, curve=1.0):
    e = np.ones(n)
    na, nr = max(1, int(SR * a)), max(1, int(SR * r))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e


def decay(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def sweep(f0, f1, d, shape="sine", vib=0, vibf=6):
    t = t_(d)
    f = f0 + (f1 - f0) * (t / d)
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * vibf * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == "square":
        return np.sign(np.sin(ph))
    if shape == "saw":
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    return np.sin(ph)


def tone(f, d, shape="sine"):
    return sweep(f, f, d, shape)


def lowpass(x, k):
    out = np.cumsum(x)
    out = (out[k:] - out[:-k]) / k
    return np.concatenate([out, np.zeros(k)])[: len(x)]


def mix(*parts):
    n = max(off + len(p) for off, p in parts)
    y = np.zeros(n)
    for off, p in parts:
        y[off : off + len(p)] += p
    return y


def at(sec):
    return int(SR * sec)


def note(f):
    return 440.0 * 2 ** ((f - 69) / 12)


def save(name, x, gain=0.7):
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    x = np.concatenate([x, np.zeros(at(0.02))])
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, name + ".wav")
        with wave.open(wav, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((x * 32767).astype("<i2").tobytes())
        mp3 = os.path.join(OUT, name + ".mp3")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", str(SR),
             "-codec:a", "libmp3lame", "-b:a", "48k", "-map_metadata", "-1", "-fflags", "+bitexact", mp3],
            check=True,
        )
    print(f"{name}.mp3  {os.path.getsize(mp3)/1024:.1f} KB  {len(x)/SR:.2f}s")


# ---------------- Theme A: cartoon ----------------
def a_giggle():
    parts = []
    for i in range(5):
        f0 = 520 + 40 * (i % 2)
        s = sweep(f0, f0 * 1.5, 0.09, vib=0.04, vibf=30) * env(at(0.09), 0.005, 0.04)
        parts.append((at(0.11 * i), s * (1 - 0.12 * i)))
    return mix(*parts)


def a_spring():
    d = 0.7
    t = t_(d)
    f = 180 + 420 * np.exp(-t * 4) * (1 + 0.9 * np.sin(2 * np.pi * 7 * t))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(len(t), 0.25)
    return s + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR) * decay(len(t), 0.15)


def a_whistle():
    s = sweep(900, 1900, 0.5, vib=0.015, vibf=7) * env(at(0.5), 0.03, 0.12)
    s2 = sweep(1900, 1500, 0.2, vib=0.02, vibf=9) * env(at(0.2), 0.01, 0.1)
    return mix((0, s), (at(0.5), s2))


def a_pickup():
    notes = [76, 81, 85, 88]  # E5 A5 C#6 E6
    return mix(*[(at(0.07 * i), tone(note(n), 0.28) * decay(at(0.28), 0.1) * env(at(0.28), 0.003, 0.05)) for i, n in enumerate(notes)])


# ---------------- Theme B: forest ----------------
def marimba(f, d=0.6):
    t = t_(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 30)
    return s * decay(len(t), 0.18) * env(len(t), 0.002, 0.05)


def b_marimba():
    return mix(*[(at(0.12 * i), marimba(note(n))) for i, n in enumerate([60, 64, 67, 72])])


def b_chime():
    parts = []
    for i, n in enumerate([88, 91, 84, 93, 86]):
        f = note(n)
        t = t_(1.0)
        s = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t)) * decay(len(t), 0.35)
        parts.append((at(0.09 * i), s * env(len(t), 0.002, 0.2)))
    return mix(*parts)


def b_woodblock():
    t = t_(0.18)
    s = (np.sin(2 * np.pi * 820 * t) + 0.5 * np.sin(2 * np.pi * 1230 * t)) * decay(len(t), 0.025)
    return mix((0, s), (at(0.2), s * 0.8))


def b_cello():
    parts = []
    for n in [48, 52, 55]:
        s = sweep(note(n), note(n), 1.1, "saw", vib=0.004, vibf=5)
        s = lowpass(s, 14) * env(len(s), 0.15, 0.4)
        parts.append((0, s))
    return mix(*parts)


# ---------------- Theme C: 8-bit ----------------
def c_fall():
    return lowpass(sweep(1400, 160, 0.45, "square"), 3) * env(at(0.45), 0.002, 0.03)


def c_radar():
    t = t_(0.9)
    s = np.sin(2 * np.pi * 1000 * t) * decay(len(t), 0.18) * env(len(t), 0.002, 0.05)
    return mix((0, s), (at(0.45), s * 0.5))


def c_cartridge():
    parts = []
    for i in range(6):
        click = rng.uniform(-1, 1, at(0.012)) * decay(at(0.012), 0.004)
        parts.append((at(0.05 * i), click))
    parts.append((at(0.32), tone(220, 0.12, "square") * 0.4 * env(at(0.12), 0.002, 0.05)))
    return mix(*parts)


def c_levelup():
    notes = [60, 64, 67, 72, 76, 79, 84]
    return mix(*[(at(0.075 * i), tone(note(n), 0.14, "square") * env(at(0.14), 0.002, 0.04)) for i, n in enumerate(notes)] +
               [(at(0.075 * 7), tone(note(84), 0.35, "square") * env(at(0.35), 0.002, 0.2))])


# ---------------- System ----------------
def sys_locked():
    click = rng.uniform(-1, 1, at(0.02)) * decay(at(0.02), 0.004)
    thunk = tone(140, 0.08) * decay(at(0.08), 0.02)
    return mix((0, click * 0.9), (at(0.005), thunk))


def sys_focus():
    b = tone(1568, 0.07) * env(at(0.07), 0.003, 0.02)
    return mix((0, b), (at(0.1), b * 0.9))


SOUNDS = {
    "a_cartoon_giggle": a_giggle, "a_spring_duang": a_spring, "a_whistle": a_whistle, "a_sparkle_pickup": a_pickup,
    "b_marimba_arpeggio": b_marimba, "b_wind_chime": b_chime, "b_wood_block": b_woodblock, "b_cello_chord": b_cello,
    "c_pixel_fall": c_fall, "c_radar_ping": c_radar, "c_cartridge_insert": c_cartridge, "c_level_up": c_levelup,
    "device_locked": sys_locked, "camera_focus": sys_focus,
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in SOUNDS.items():
        save(name, fn())
