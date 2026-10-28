import { describe, expect, it } from 'vitest';
import { createBaseline, detectInterference, evaluatePosture } from '../src/posture_eval.js';
import { DEFAULT_POSTURE_THRESHOLDS } from '../src/types.js';
import { rot, uprightPose } from './fixtures.js';

const base = createBaseline([uprightPose(), uprightPose(), uprightPose()]);

describe('createBaseline', () => {
  it('computes R0 and W0', () => {
    expect(base.ratio).toBeCloseTo(0.6, 5);
    expect(base.shoulderWidth).toBeCloseTo(0.3, 5);
  });
  it('is robust to an outlier frame (median)', () => {
    const outlier = uprightPose({ 0: { y: 0.55 } });
    const b = createBaseline([uprightPose(), outlier, uprightPose()]);
    expect(b.ratio).toBeCloseTo(0.6, 5);
  });
  it('throws without usable frames', () => {
    expect(() => createBaseline([uprightPose({ 0: { visibility: 0 } })])).toThrow();
  });
});

describe('evaluatePosture', () => {
  it('normal posture has no issues', () => {
    const r = evaluatePosture(uprightPose(), base);
    expect(r.issues).toEqual([]);
    expect(r.isUpright).toBe(true);
    expect(r.isInterference).toBe(false);
    expect(r.ratio).toBeCloseTo(0.6, 5);
  });

  it('head down / lying on desk (nose height 0.10 vs baseline 0.18) -> HEAD_DOWN', () => {
    // R = 0.10/0.30 = 0.333 < 0.68 * 0.6 = 0.408. Pitch-angle -> ratio mapping is validated on real footage in Sprint 3.
    const r = evaluatePosture(uprightPose({ 0: { y: 0.5 }, 2: { y: 0.46 }, 5: { y: 0.46 } }), base);
    expect(r.issues).toContain('HEAD_DOWN');
  });

  it('just above the head-down threshold is not flagged', () => {
    const h = 0.68 * 0.6 * 0.3 + 0.004; // ratio slightly above threshold
    const r = evaluatePosture(uprightPose({ 0: { y: 0.6 - h } }), base);
    expect(r.issues).not.toContain('HEAD_DOWN');
  });

  it('head tilt 20° -> HEAD_TILT, 10° -> ok', () => {
    const c = { x: 0.5, y: 0.38 };
    const mk = (deg: number) => {
      const le = rot({ x: 0.47, y: 0.38 }, c, deg);
      const re = rot({ x: 0.53, y: 0.38 }, c, deg);
      return uprightPose({ 2: le, 5: re });
    };
    const r20 = evaluatePosture(mk(20), base);
    expect(r20.issues).toContain('HEAD_TILT');
    expect(Math.abs(r20.eyeAngleDeg)).toBeCloseTo(20, 1);
    expect(evaluatePosture(mk(10), base).issues).not.toContain('HEAD_TILT');
    expect(evaluatePosture(mk(-20), base).issues).toContain('HEAD_TILT');
  });

  it('shoulder tilt 15° -> SHOULDER_TILT, 8° -> ok', () => {
    const c = { x: 0.5, y: 0.6 };
    const mk = (deg: number) =>
      uprightPose({ 11: rot({ x: 0.35, y: 0.6 }, c, deg), 12: rot({ x: 0.65, y: 0.6 }, c, deg) });
    expect(evaluatePosture(mk(15), base).issues).toContain('SHOULDER_TILT');
    expect(evaluatePosture(mk(8), base).issues).not.toContain('SHOULDER_TILT');
  });

  it('mirrored landmark order does not change tilt result', () => {
    const swapped = uprightPose({ 2: { x: 0.53, y: 0.38 }, 5: { x: 0.47, y: 0.38 } });
    expect(evaluatePosture(swapped, base).eyeAngleDeg).toBeCloseTo(0, 5);
  });

  it('shoulder width 1.3x baseline -> TOO_CLOSE, 1.2x -> ok', () => {
    const wide = (k: number) => uprightPose({ 11: { x: 0.5 - 0.15 * k }, 12: { x: 0.5 + 0.15 * k } });
    expect(evaluatePosture(wide(1.3), base).issues).toContain('TOO_CLOSE');
    expect(evaluatePosture(wide(1.2), base).issues).not.toContain('TOO_CLOSE');
  });

  it('skips dimensions with low visibility instead of flagging', () => {
    const r = evaluatePosture(uprightPose({ 2: { visibility: 0.1 }, 5: { y: 0.1 } }), base);
    expect(r.issues).not.toContain('HEAD_TILT');
    expect(Number.isNaN(r.eyeAngleDeg)).toBe(true);
  });

  it('honors aspectRatio for angle math', () => {
    // On a 16:9 frame normalized x spans 1.78x more pixels than y: same normalized dy over dx is a steeper real angle.
    const lm = uprightPose({ 2: { x: 0.47, y: 0.38 }, 5: { x: 0.53, y: 0.4 } });
    const sq = evaluatePosture(lm, base, DEFAULT_POSTURE_THRESHOLDS, { aspectRatio: 1 });
    const wide = evaluatePosture(lm, base, DEFAULT_POSTURE_THRESHOLDS, { aspectRatio: 16 / 9 });
    expect(Math.abs(wide.eyeAngleDeg)).toBeLessThan(Math.abs(sq.eyeAngleDeg));
  });

  it('custom thresholds are respected', () => {
    const r = evaluatePosture(uprightPose({ 0: { y: 0.47 } }), base, { ...DEFAULT_POSTURE_THRESHOLDS, headDownRatio: 0.95 });
    expect(r.issues).toContain('HEAD_DOWN');
  });
});

describe('hand interference filter', () => {
  it('chin-rest: wrist next to face -> isInterference', () => {
    const lm = uprightPose({ 15: { x: 0.47, y: 0.45, z: 0 } });
    expect(detectInterference(lm)).toBe(true);
    expect(evaluatePosture(lm, base).isInterference).toBe(true);
  });

  it('drinking / touching face with right hand -> isInterference', () => {
    expect(detectInterference(uprightPose({ 16: { x: 0.52, y: 0.44 } }))).toBe(true);
  });

  it('wrists resting on desk -> no interference', () => {
    expect(detectInterference(uprightPose())).toBe(false);
  });

  it('wrist at the same x,y but far in z is not interference (3D distance)', () => {
    expect(detectInterference(uprightPose({ 15: { x: 0.5, y: 0.44, z: 0.5 } }))).toBe(false);
  });

  it('boundary: inside 1.2x eye distance true, outside false', () => {
    const r = 1.2 * 0.06; // 0.072
    const face = { x: 0.5, y: 0.44 };
    expect(detectInterference(uprightPose({ 15: { x: face.x + r - 0.005, y: face.y } }))).toBe(true);
    expect(detectInterference(uprightPose({ 15: { x: face.x + r + 0.005, y: face.y } }))).toBe(false);
  });

  it('hidden wrist is ignored', () => {
    expect(detectInterference(uprightPose({ 15: { x: 0.47, y: 0.45, visibility: 0.1 } }))).toBe(false);
  });
});

describe('performance', () => {
  it('single-frame evaluation p95 well under 0.2 ms in Node', () => {
    const lm = uprightPose();
    for (let i = 0; i < 2000; i++) evaluatePosture(lm, base); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 5000; i++) {
      const t0 = performance.now();
      evaluatePosture(lm, base);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    expect(p95).toBeLessThan(0.2);
  });
});
