import { describe, expect, it } from 'vitest';
import { LuxGate, computeLuma, estimateLux } from '../src/lux_meter.js';

const W = 160;
const H = 120;
function frame(r: number, g: number, b: number, edge?: [number, number, number]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = x >= 32 && x < 128 && y >= 24 && y < 96;
      const c = !inside && edge ? edge : [r, g, b];
      const i = (y * W + x) * 4;
      buf[i] = c[0]!;
      buf[i + 1] = c[1]!;
      buf[i + 2] = c[2]!;
      buf[i + 3] = 255;
    }
  return buf;
}

describe('computeLuma', () => {
  it('uses Rec.601 weights', () => {
    expect(computeLuma(frame(255, 0, 0), W, H)).toBeCloseTo(0.299 * 255, 3);
    expect(computeLuma(frame(0, 255, 0), W, H)).toBeCloseTo(0.587 * 255, 3);
    expect(computeLuma(frame(0, 0, 255), W, H)).toBeCloseTo(0.114 * 255, 3);
    expect(computeLuma(frame(255, 255, 255), W, H)).toBeCloseTo(255, 3);
  });
  it('ignores pixels outside the central ROI', () => {
    expect(computeLuma(frame(40, 40, 40, [255, 255, 255]), W, H)).toBeCloseTo(40, 3);
  });
  it('throws on short buffers', () => {
    expect(() => computeLuma(new Uint8ClampedArray(10), W, H)).toThrow();
  });
});

describe('estimateLux', () => {
  it('is monotonic in luma', () => {
    expect(estimateLux(60)).toBeLessThan(estimateLux(120));
    expect(estimateLux(120)).toBeLessThan(estimateLux(200));
  });
  it('uses exposure hint when provided (longer exposure => dimmer scene for same luma)', () => {
    const fast = estimateLux(150, { exposureTimeSec: 1 / 120, iso: 100 });
    const slow = estimateLux(150, { exposureTimeSec: 1 / 15, iso: 100 });
    expect(fast).toBeGreaterThan(slow);
  });
  it('ignores incomplete hints', () => {
    expect(estimateLux(150, { iso: 100 })).toBe(estimateLux(150));
  });
});

describe('LuxGate acceptance', () => {
  it('dim image -> TOO_DARK, lamp/bright image -> LUX_QUALIFIED', () => {
    const dim = new LuxGate();
    const bright = new LuxGate();
    const dimLuma = computeLuma(frame(50, 50, 45), W, H);
    const brightLuma = computeLuma(frame(220, 215, 200), W, H);
    let d, b;
    for (let t = 0; t <= 3000; t += 1000) {
      d = dim.push(dimLuma, t);
      b = bright.push(brightLuma, t);
    }
    expect(d!.status).toBe('TOO_DARK');
    expect(b!.status).toBe('LUX_QUALIFIED');
    expect(d!.estimatedLux).toBeLessThan(500);
    expect(b!.estimatedLux).toBeGreaterThanOrEqual(500);
  });

  it('starts UNKNOWN and commits only after 2 s', () => {
    const g = new LuxGate();
    expect(g.push(30, 0).status).toBe('UNKNOWN');
    expect(g.push(30, 1000).status).toBe('UNKNOWN');
    expect(g.push(30, 2000).status).toBe('TOO_DARK');
  });
});

describe('LuxGate debounce (both directions)', () => {
  const BRIGHT = 220;
  const DARK = 40;
  function qualified(): LuxGate {
    const g = new LuxGate();
    for (let t = 0; t <= 2000; t += 1000) g.push(BRIGHT, t);
    expect(g.status).toBe('LUX_QUALIFIED');
    return g;
  }

  it('a 1.5 s shadow does not trigger TOO_DARK', () => {
    const g = qualified();
    g.push(DARK, 3000);
    g.push(DARK, 4000); // 1 s dark
    expect(g.push(DARK, 4500).status).toBe('LUX_QUALIFIED'); // 1.5 s dark
    expect(g.push(BRIGHT, 5000).status).toBe('LUX_QUALIFIED');
    // pending timer was reset by the bright reading: another 1.9 s dark still not enough
    g.push(DARK, 6000);
    expect(g.push(DARK, 7900).status).toBe('LUX_QUALIFIED');
  });

  it('>= 2 s of darkness triggers TOO_DARK', () => {
    const g = qualified();
    g.push(DARK, 3000);
    g.push(DARK, 4000);
    expect(g.push(DARK, 5000).status).toBe('TOO_DARK');
  });

  it('recovery also needs 2 s (no flapping on short flashes)', () => {
    const g = qualified();
    for (let t = 3000; t <= 5000; t += 1000) g.push(DARK, t);
    expect(g.status).toBe('TOO_DARK');
    g.push(BRIGHT, 6000);
    expect(g.push(BRIGHT, 7500).status).toBe('TOO_DARK'); // 1.5 s bright
    g.push(DARK, 8000); // interrupts recovery
    g.push(BRIGHT, 9000);
    expect(g.push(BRIGHT, 10000).status).toBe('TOO_DARK');
    expect(g.push(BRIGHT, 11000).status).toBe('LUX_QUALIFIED');
  });

  it('threshold is configurable and exposure hint is honored', () => {
    const g = new LuxGate({ minLux: 100, debounceMs: 0 });
    expect(g.push(120, 0).status).toBe('LUX_QUALIFIED');
    const h = new LuxGate({ debounceMs: 0 });
    expect(h.push(150, 0, { exposureTimeSec: 1 / 8, iso: 800 }).status).toBe('TOO_DARK');
  });

  it('reset returns to UNKNOWN', () => {
    const g = qualified();
    g.reset();
    expect(g.status).toBe('UNKNOWN');
  });
});
