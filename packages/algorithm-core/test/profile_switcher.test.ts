import { describe, it, expect } from 'vitest';
import { ProfileManager } from '../src/profile_switcher.js';

describe('Multi-child profile auto-switching', () => {
  it('identifies distinct siblings by shoulder width and seated height', () => {
    const manager = new ProfileManager();

    // Sibling 1 (Elder child, 11 y/o: shoulder ~320mm, nose-shoulder ~180mm)
    const res1 = manager.resolveProfile(320, 180);
    expect(res1.isNewProfile).toBe(true);
    expect(res1.profile.name).toBe('宝贝 1 号');
    expect(manager.getActiveProfile()?.id).toBe(res1.profile.id);

    // Sibling 2 (Younger child, 6 y/o: shoulder ~230mm, nose-shoulder ~130mm)
    const res2 = manager.resolveProfile(230, 130);
    expect(res2.isNewProfile).toBe(true);
    expect(res2.profile.name).toBe('宝贝 2 号');
    expect(res2.switched).toBe(true);
    expect(manager.getActiveProfile()?.id).toBe(res2.profile.id);

    // Elder child sits back down with slight variation (322mm, 178mm)
    const resBack1 = manager.resolveProfile(322, 178);
    expect(resBack1.isNewProfile).toBe(false);
    expect(resBack1.profile.id).toBe(res1.profile.id);
    expect(resBack1.switched).toBe(true);
    expect(resBack1.matchConfidence).toBeGreaterThan(0.9);

    // Younger child sits back down (228mm, 132mm)
    const resBack2 = manager.resolveProfile(228, 132);
    expect(resBack2.isNewProfile).toBe(false);
    expect(resBack2.profile.id).toBe(res2.profile.id);
    expect(resBack2.switched).toBe(true);
  });
});
