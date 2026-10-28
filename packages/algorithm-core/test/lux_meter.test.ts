import { describe, it, expect } from 'vitest';
import { computeLuma, estimateLuxFromLuma, LuxGate } from '../src/lux_meter.js';

describe('WO-2: Lux Meter & Gatekeeper Module', () => {
  it('computes luma correctly from RGBA pixel buffers', () => {
    // 2x2 image of pure white pixels (255, 255, 255, 255)
    const whitePixels = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    const whiteLuma = computeLuma(whitePixels, 2, 2);
    expect(Math.round(whiteLuma)).toBe(255);

    // 2x2 image of pure black pixels
    const blackPixels = new Uint8ClampedArray(2 * 2 * 4).fill(0);
    const blackLuma = computeLuma(blackPixels, 2, 2);
    expect(blackLuma).toBe(0);
  });

  it('estimates lux monotonically increasing with luma', () => {
    const luxLow = estimateLuxFromLuma(50);
    const luxStandard = estimateLuxFromLuma(100);
    const luxBright = estimateLuxFromLuma(160);

    expect(luxLow).toBeLessThan(luxStandard);
    expect(luxStandard).toBeLessThan(luxBright);
    expect(luxStandard).toBeGreaterThanOrEqual(450);
    expect(luxStandard).toBeLessThanOrEqual(550);
  });

  it('executes 2-second two-way hysteresis debounce correctly', () => {
    const gate = new LuxGate({ debounceMs: 2000, darkThresholdLux: 500 });
    let t = 1000;

    // Start with bright light (>500 lux)
    let r = gate.push(150, t); // ~750 Lux
    expect(r.status).toBe('LUX_QUALIFIED');

    // Sudden shadow at t=2000 (luma=30 -> ~110 lux)
    t += 1000; // t = 2000
    r = gate.push(30, t);
    // Transient shadow < 2s must NOT flip status yet!
    expect(r.status).toBe('LUX_QUALIFIED');

    // Shadow continues at t=3500 (elapsed 1.5s) -> still not flipped
    t += 1500; // t = 3500
    r = gate.push(30, t);
    expect(r.status).toBe('LUX_QUALIFIED');

    // Shadow confirmed past 2s at t=4100 (elapsed 2.1s) -> flips to TOO_DARK!
    t += 600; // t = 4100
    r = gate.push(30, t);
    expect(r.status).toBe('TOO_DARK');

    // Turning light back on at t=5000 -> requires 2s to recover
    t += 900; // t = 5000
    r = gate.push(160, t);
    expect(r.status).toBe('TOO_DARK'); // Still debouncing

    t += 2100; // t = 7100 (>2s recovery confirmed)
    r = gate.push(160, t);
    expect(r.status).toBe('LUX_QUALIFIED');
  });
});
