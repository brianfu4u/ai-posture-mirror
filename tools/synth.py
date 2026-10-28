#!/usr/bin/env python3
"""
tools/synth.py
Generates 14 pure mathematical original synthesized sounds (CC0 Public Domain).
Uses Python standard library (wave, struct, math) - zero external dependencies.
"""
import os
import wave
import struct
import math

SOUNDS_DIR = os.path.join(os.path.dirname(__file__), '..', 'packages', 'audio-assets', 'sounds')
os.makedirs(SOUNDS_DIR, exist_ok=True)

SAMPLE_RATE = 22050

def write_wav(filename, samples):
    filepath = os.path.join(SOUNDS_DIR, filename)
    with wave.open(filepath, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2) # 16-bit
        wf.setframerate(SAMPLE_RATE)
        # Prevent clipping with soft limiting
        raw = bytearray()
        for s in samples:
            val = max(-1.0, min(1.0, s))
            int_val = int(val * 32767 * 0.85) # headroom to avoid clipping
            raw.extend(struct.pack('<h', int_val))
        wf.writeframes(raw)
    print(f"Generated {filename}: {len(samples)} samples ({len(raw)} bytes)")

# 1. System: device_locked (Click/alignment snap)
def synth_device_locked():
    duration = 0.08
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 350 * math.exp(-35 * t)
        env = math.exp(-45 * t)
        s = math.sin(2 * math.pi * freq * t) * env
        samples.append(s)
    write_wav('device_locked.wav', samples)

# 2. System: camera_focus (0.5s Camera beep beep)
def synth_camera_focus():
    duration = 0.22
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 880 if t < 0.08 else 1760
        env = math.exp(-12 * (t % 0.1))
        s = math.sin(2 * math.pi * freq * t) * env * 0.7
        samples.append(s)
    write_wav('camera_focus.wav', samples)

# 3. Cartoon: Boing
def synth_cartoon_boing():
    duration = 0.4
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 160 + 350 * math.sin(18 * math.pi * t)
        env = math.exp(-7 * t)
        s = (2 * (t * freq - math.floor(t * freq + 0.5))) * env * 0.6
        samples.append(s)
    write_wav('cartoon_boing.wav', samples)

# 4. Cartoon: Laugh
def synth_cartoon_laugh():
    duration = 0.5
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        chirp = 400 + 200 * math.sin(30 * math.pi * t)
        env = math.sin(math.pi * t / duration) * (0.8 + 0.2 * math.sin(40 * math.pi * t))
        s = math.sin(2 * math.pi * chirp * t) * env * 0.7
        samples.append(s)
    write_wav('cartoon_laugh.wav', samples)

# 5. Cartoon: Whistle
def synth_cartoon_whistle():
    duration = 0.35
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 600 + 400 * t
        env = math.sin(math.pi * t / duration)
        s = math.sin(2 * math.pi * freq * t) * env * 0.7
        samples.append(s)
    write_wav('cartoon_whistle.wav', samples)

# 6. Cartoon: Coin
def synth_cartoon_coin():
    duration = 0.45
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 987.77 if t < 0.08 else 1318.51
        env = math.exp(-8 * t)
        s = math.sin(2 * math.pi * freq * t) * env * 0.8
        samples.append(s)
    write_wav('cartoon_coin.wav', samples)

# 7. Forest: Marimba
def synth_forest_marimba():
    duration = 0.5
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 523.25 if t < 0.15 else 440.0
        env = math.exp(-9 * (t % 0.15))
        s = math.sin(2 * math.pi * freq * t) * env * 0.8
        samples.append(s)
    write_wav('forest_marimba.wav', samples)

# 8. Forest: Windchime
def synth_forest_windchime():
    duration = 0.6
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        s = (math.sin(2 * math.pi * 1046.5 * t) + math.sin(2 * math.pi * 1318.5 * t) + math.sin(2 * math.pi * 1567.9 * t)) / 3
        env = math.exp(-5 * t)
        samples.append(s * env * 0.7)
    write_wav('forest_windchime.wav', samples)

# 9. Forest: Woodblock
def synth_forest_woodblock():
    duration = 0.15
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 800
        env = math.exp(-35 * t)
        s = math.sin(2 * math.pi * freq * t) * env * 0.9
        samples.append(s)
    write_wav('forest_woodblock.wav', samples)

# 10. Forest: Cello
def synth_forest_cello():
    duration = 0.6
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 196.0
        s = math.sin(2 * math.pi * freq * t) + 0.5 * math.sin(4 * math.pi * freq * t)
        env = math.sin(math.pi * t / duration) * math.exp(-2 * t)
        samples.append(s * env * 0.5)
    write_wav('forest_cello.wav', samples)

# 11. Pixel: Oops (with anti-clipping headroom)
def synth_pixel_oops():
    duration = 0.3
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 440 if t < 0.08 else (330 if t < 0.16 else 220)
        env = math.exp(-8 * t)
        s = 0.5 if math.sin(2 * math.pi * freq * t) > 0 else -0.5
        samples.append(s * env * 0.6) # headroom to fix clipping
    write_wav('pixel_oops.wav', samples)

# 12. Pixel: Bloop
def synth_pixel_bloop():
    duration = 0.25
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 300 + 400 * math.exp(-15 * t)
        env = math.exp(-10 * t)
        s = math.sin(2 * math.pi * freq * t) * env * 0.7
        samples.append(s)
    write_wav('pixel_bloop.wav', samples)

# 13. Pixel: Rewind
def synth_pixel_rewind():
    duration = 0.3
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = 150 + 800 * (t / duration)
        env = math.exp(-4 * (1 - t / duration))
        s = 0.4 if math.sin(2 * math.pi * freq * t) > 0 else -0.4
        samples.append(s * env)
    write_wav('pixel_rewind.wav', samples)

# 14. Pixel: Level Up
def synth_pixel_levelup():
    duration = 0.5
    n = int(SAMPLE_RATE * duration)
    samples = []
    notes = [330, 392, 659, 523, 587, 784]
    for i in range(n):
        t = i / SAMPLE_RATE
        idx = min(len(notes) - 1, int(t / 0.08))
        freq = notes[idx]
        env = math.exp(-4 * (t % 0.08))
        s = 0.4 if math.sin(2 * math.pi * freq * t) > 0 else -0.4
        samples.append(s * env)
    write_wav('pixel_levelup.wav', samples)

if __name__ == '__main__':
    synth_device_locked()
    synth_camera_focus()
    synth_cartoon_boing()
    synth_cartoon_laugh()
    synth_cartoon_whistle()
    synth_cartoon_coin()
    synth_forest_marimba()
    synth_forest_windchime()
    synth_forest_woodblock()
    synth_forest_cello()
    synth_pixel_oops()
    synth_pixel_bloop()
    synth_pixel_rewind()
    synth_pixel_levelup()
    print("All 14 CC0 mathematical original sounds successfully generated!")
