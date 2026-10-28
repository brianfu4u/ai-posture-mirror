import { describe, expect, it } from 'vitest';
import { CooldownManager } from '../src/cooldown.js';

describe('CooldownManager (45 s)', () => {
  it('refuses a second reminder until 45 s after the first one ENDED', () => {
    let now = 0;
    const c = new CooldownManager(() => now);
    expect(c.tryAcquire()).toBe(true);
    now = 800;
    expect(c.tryAcquire()).toBe(false); // still sounding
    c.release(); // ended at t=800
    now = 800 + 44_999;
    expect(c.tryAcquire()).toBe(false);
    expect(c.remainingMs).toBe(1);
    now = 800 + 45_000;
    expect(c.tryAcquire()).toBe(true);
  });
  it('cancel() does not charge a cooldown', () => {
    const c = new CooldownManager(() => 0);
    c.tryAcquire();
    c.cancel();
    expect(c.tryAcquire()).toBe(true);
  });
  it('cooldown is configurable and resettable', () => {
    let now = 0;
    const c = new CooldownManager(() => now, 10_000);
    c.tryAcquire();
    c.release();
    now = 9_999;
    expect(c.isLocked).toBe(true);
    c.reset();
    expect(c.isLocked).toBe(false);
  });
});
