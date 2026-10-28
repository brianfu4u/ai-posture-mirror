import { describe, it, expect } from 'vitest';
import { ReminderCooldownManager } from '../src/cooldown.js';

describe('WO-4: Audio Assets Cooldown Manager', () => {
  it('allows first playback then enforces 45-second silence period', () => {
    let now = 1000;
    const cd = new ReminderCooldownManager({ cooldownMs: 45000, clock: () => now });

    expect(cd.canPlay(now)).toBe(true);

    // Play a 1000ms sound at t = 1000 -> sound finishes at 2000 -> cooldown until 47000!
    cd.onPlayStarted(1000, now);

    // During sound playback (t = 1500): cannot play
    now += 500;
    expect(cd.canPlay(now)).toBe(false);

    // 20 seconds later (t = 21000): still in cooldown
    now = 21000;
    expect(cd.canPlay(now)).toBe(false);
    expect(cd.isCoolingDown(now)).toBe(true);
    expect(cd.remainingMs(now)).toBe(26000);

    // 44.9 seconds after sound ends (t = 46900): still cannot play
    now = 46900;
    expect(cd.canPlay(now)).toBe(false);

    // 45.1 seconds after sound ends (t = 47100): permitted!
    now = 47100;
    expect(cd.canPlay(now)).toBe(true);
    expect(cd.isCoolingDown(now)).toBe(false);
    expect(cd.remainingMs(now)).toBe(0);
  });
});
