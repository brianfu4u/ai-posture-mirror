import { describe, it, expect } from 'vitest';
import {
  evaluatePosture,
  createBaseline,
  detectInterference,
  getFaceCenter,
} from '../src/posture_eval.js';
import {
  LM,
  type PoseLandmarks,
  type Landmark,
  type PostureBaseline,
  DEFAULT_POSTURE_THRESHOLDS,
} from '../src/types.js';

function makeMockLandmarks(overrides: Partial<Record<number, Partial<Landmark>>> = {}): PoseLandmarks {
  const points: Landmark[] = [];
  for (let i = 0; i < 33; i++) {
    points.push({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 });
  }

  // Set default upright posture landmarks
  // Face
  points[LM.NOSE] = { x: 0.5, y: 0.30, z: 0, visibility: 0.99 };
  points[LM.LEFT_EYE] = { x: 0.46, y: 0.28, z: 0, visibility: 0.99 };
  points[LM.RIGHT_EYE] = { x: 0.54, y: 0.28, z: 0, visibility: 0.99 };
  points[LM.MOUTH_LEFT] = { x: 0.47, y: 0.35, z: 0, visibility: 0.99 };
  points[LM.MOUTH_RIGHT] = { x: 0.53, y: 0.35, z: 0, visibility: 0.99 };

  // Shoulders: width = 0.30, midY = 0.50 -> H = 0.20 -> R = 0.20 / 0.30 = 0.6667
  points[LM.LEFT_SHOULDER] = { x: 0.35, y: 0.50, z: 0, visibility: 0.99 };
  points[LM.RIGHT_SHOULDER] = { x: 0.65, y: 0.50, z: 0, visibility: 0.99 };

  // Wrists placed comfortably on desk away from face
  points[LM.LEFT_WRIST] = { x: 0.30, y: 0.85, z: 0, visibility: 0.99 };
  points[LM.RIGHT_WRIST] = { x: 0.70, y: 0.85, z: 0, visibility: 0.99 };

  for (const [idxStr, ov] of Object.entries(overrides)) {
    const idx = Number(idxStr);
    points[idx] = { ...points[idx], ...ov };
  }

  return points;
}

const defaultBaseline: PostureBaseline = {
  ratio: 0.6667,
  shoulderWidth: 0.30,
};

describe('WO-1: Posture Evaluation Module', () => {
  it('identifies upright posture correctly', () => {
    const lm = makeMockLandmarks();
    const res = evaluatePosture(lm, defaultBaseline);
    expect(res.isUpright).toBe(true);
    expect(res.issues).toHaveLength(0);
    expect(res.isInterference).toBe(false);
  });

  it('detects head down / slouching', () => {
    // Nose drops vertically to 0.43 -> H = 0.07 -> R = 0.07 / 0.30 = 0.233 (< 0.68 * 0.6667)
    const lm = makeMockLandmarks({
      [LM.NOSE]: { y: 0.43 },
    });
    const res = evaluatePosture(lm, defaultBaseline);
    expect(res.issues).toContain('HEAD_DOWN');
    expect(res.isUpright).toBe(false);
  });

  it('detects too close / forward lean', () => {
    // Shoulder width increases to 0.40 (> 1.25 * 0.30 = 0.375)
    const lm = makeMockLandmarks({
      [LM.LEFT_SHOULDER]: { x: 0.30 },
      [LM.RIGHT_SHOULDER]: { x: 0.70 },
    });
    const res = evaluatePosture(lm, defaultBaseline);
    expect(res.issues).toContain('TOO_CLOSE');
    expect(res.isUpright).toBe(false);
  });

  it('detects head tilt > 15 degrees', () => {
    // Eye tilt angle > 15 deg
    const lm = makeMockLandmarks({
      [LM.LEFT_EYE]: { x: 0.46, y: 0.25 },
      [LM.RIGHT_EYE]: { x: 0.54, y: 0.30 },
    });
    const res = evaluatePosture(lm, defaultBaseline);
    expect(res.issues).toContain('HEAD_TILT');
    expect(res.isUpright).toBe(false);
  });

  it('detects shoulder tilt > 12 degrees', () => {
    // Shoulder tilt angle > 12 deg
    const lm = makeMockLandmarks({
      [LM.LEFT_SHOULDER]: { x: 0.35, y: 0.45 },
      [LM.RIGHT_SHOULDER]: { x: 0.65, y: 0.55 },
    });
    const res = evaluatePosture(lm, defaultBaseline);
    expect(res.issues).toContain('SHOULDER_TILT');
    expect(res.isUpright).toBe(false);
  });

  it('detects hand near face (chin rest) and marks interference', () => {
    const faceCenter = getFaceCenter(makeMockLandmarks());
    // Move left wrist close to chin/face center
    const lm = makeMockLandmarks({
      [LM.LEFT_WRIST]: { x: faceCenter.x + 0.02, y: faceCenter.y + 0.02, z: 0 },
    });
    expect(detectInterference(lm)).toBe(true);
    const res = evaluatePosture(lm, defaultBaseline);
    expect(res.isInterference).toBe(true);
  });

  it('skips evaluation when landmark visibility < 0.5 to prevent false positives', () => {
    // Left eye invisible
    const lm = makeMockLandmarks({
      [LM.LEFT_EYE]: { visibility: 0.2 },
    });
    const res = evaluatePosture(lm, defaultBaseline);
    // Should skip head tilt without crashing or false alerting
    expect(res.issues).not.toContain('HEAD_TILT');
  });

  it('benchmarks single frame evaluation < 0.2ms', () => {
    const lm = makeMockLandmarks();
    const start = performance.now();
    const iterations = 500;
    for (let i = 0; i < iterations; i++) {
      evaluatePosture(lm, defaultBaseline);
    }
    const elapsed = performance.now() - start;
    const perFrameMs = elapsed / iterations;
    expect(perFrameMs).toBeLessThan(0.2);
  });
});
