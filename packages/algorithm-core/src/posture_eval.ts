import {
  LM,
  type Landmark,
  type PoseLandmarks,
  type PostureBaseline,
  type PostureThresholds,
  type PostureResult,
  type PostureIssue,
  DEFAULT_POSTURE_THRESHOLDS,
} from './types.js';

export interface EvaluateOptions {
  aspectRatio?: number; // width / height, default 1.0 (square normalized coords)
}

/**
 * Calculates Euclidean distance between two 3D landmarks.
 */
function dist3d(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculates angle in degrees of line between two points relative to horizontal axis.
 * Optionally corrects for non-square aspect ratio.
 */
function lineAngleDeg(a: Landmark, b: Landmark, aspectRatio: number = 1.0): number {
  const dx = (b.x - a.x) * aspectRatio;
  const dy = b.y - a.y;
  const rad = Math.atan2(dy, dx);
  let deg = (rad * 180) / Math.PI;
  // Normalize to [-90, 90]
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

/**
 * Checks visibility of all required landmarks. Returns false if any landmark has visibility < 0.5.
 */
function areVisible(lm: PoseLandmarks, indices: number[]): boolean {
  for (const idx of indices) {
    const pt = lm[idx];
    if (!pt || (pt.visibility !== undefined && pt.visibility < 0.5)) {
      return false;
    }
  }
  return true;
}

/**
 * Computes face center as the midpoint between the nose (0) and the midpoint of the mouth corners (9, 10).
 */
export function getFaceCenter(lm: PoseLandmarks): Landmark {
  const nose = lm[LM.NOSE];
  const ml = lm[LM.MOUTH_LEFT];
  const mr = lm[LM.MOUTH_RIGHT];

  const mouthMidX = (ml.x + mr.x) / 2;
  const mouthMidY = (ml.y + mr.y) / 2;
  const mouthMidZ = ((ml.z ?? 0) + (mr.z ?? 0)) / 2;

  return {
    x: (nose.x + mouthMidX) / 2,
    y: (nose.y + mouthMidY) / 2,
    z: ((nose.z ?? 0) + mouthMidZ) / 2,
  };
}

/**
 * Detects if either hand is near the face (chin rest, rubbing eyes, drinking water).
 */
export function detectInterference(lm: PoseLandmarks, th: PostureThresholds = DEFAULT_POSTURE_THRESHOLDS): boolean {
  if (!areVisible(lm, [LM.NOSE, LM.LEFT_EYE, LM.RIGHT_EYE, LM.MOUTH_LEFT, LM.MOUTH_RIGHT])) {
    return false;
  }

  const leftEye = lm[LM.LEFT_EYE];
  const rightEye = lm[LM.RIGHT_EYE];
  const interEyeDist = dist3d(leftEye, rightEye);
  if (interEyeDist <= 0.0001) return false;

  const thresholdDist = th.interferenceFactor * interEyeDist;
  const faceCenter = getFaceCenter(lm);

  // Check left wrist
  if (areVisible(lm, [LM.LEFT_WRIST])) {
    const d = dist3d(lm[LM.LEFT_WRIST], faceCenter);
    if (d < thresholdDist) return true;
  }

  // Check right wrist
  if (areVisible(lm, [LM.RIGHT_WRIST])) {
    const d = dist3d(lm[LM.RIGHT_WRIST], faceCenter);
    if (d < thresholdDist) return true;
  }

  return false;
}

/**
 * Creates a posture baseline from a sequence of stable calibration frames (using medians).
 */
export function createBaseline(frames: PoseLandmarks[]): PostureBaseline {
  if (frames.length === 0) {
    return { ratio: 0.6, shoulderWidth: 0.35 };
  }

  const ratios: number[] = [];
  const widths: number[] = [];

  for (const lm of frames) {
    if (!areVisible(lm, [LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER])) continue;

    const ls = lm[LM.LEFT_SHOULDER];
    const rs = lm[LM.RIGHT_SHOULDER];
    const nose = lm[LM.NOSE];

    const shoulderMidY = (ls.y + rs.y) / 2;
    const verticalHeight = Math.abs(shoulderMidY - nose.y);
    const shoulderWidth = Math.abs(ls.x - rs.x);

    if (shoulderWidth > 0.01) {
      ratios.push(verticalHeight / shoulderWidth);
      widths.push(shoulderWidth);
    }
  }

  if (ratios.length === 0) {
    return { ratio: 0.6, shoulderWidth: 0.35 };
  }

  ratios.sort((a, b) => a - b);
  widths.sort((a, b) => a - b);

  const mid = Math.floor(ratios.length / 2);
  return {
    ratio: ratios[mid],
    shoulderWidth: widths[mid],
  };
}

/**
 * Evaluates human posture against a calibrated baseline.
 */
export function evaluatePosture(
  lm: PoseLandmarks,
  baseline: PostureBaseline,
  th: PostureThresholds = DEFAULT_POSTURE_THRESHOLDS,
  opts: EvaluateOptions = {}
): PostureResult {
  const ar = opts.aspectRatio ?? 1.0;
  const issues: PostureIssue[] = [];

  // 1. Interference check (hands near face)
  const isInterference = detectInterference(lm, th);

  // 2. Measure shoulders and nose
  let ratio = baseline.ratio;
  let shoulderWidth = baseline.shoulderWidth;
  let shoulderAngleDeg = 0;
  let eyeAngleDeg = 0;

  if (areVisible(lm, [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.NOSE])) {
    const ls = lm[LM.LEFT_SHOULDER];
    const rs = lm[LM.RIGHT_SHOULDER];
    const nose = lm[LM.NOSE];

    shoulderWidth = Math.abs(ls.x - rs.x);
    const shoulderMidY = (ls.y + rs.y) / 2;
    const verticalHeight = Math.abs(shoulderMidY - nose.y);

    if (shoulderWidth > 0.01) {
      ratio = verticalHeight / shoulderWidth;
    }

    // Shoulder tilt angle magnitude
    shoulderAngleDeg = Math.abs(lineAngleDeg(ls, rs, ar));

    // Head Down check
    if (ratio < th.headDownRatio * baseline.ratio) {
      issues.push('HEAD_DOWN');
    }

    // Too close (body forward lean)
    if (shoulderWidth > th.tooCloseRatio * baseline.shoulderWidth) {
      issues.push('TOO_CLOSE');
    }

    // Shoulder tilt
    if (shoulderAngleDeg > th.shoulderTiltDeg) {
      issues.push('SHOULDER_TILT');
    }
  }

  // 3. Eye tilt
  if (areVisible(lm, [LM.LEFT_EYE, LM.RIGHT_EYE])) {
    const le = lm[LM.LEFT_EYE];
    const re = lm[LM.RIGHT_EYE];
    eyeAngleDeg = Math.abs(lineAngleDeg(le, re, ar));

    if (eyeAngleDeg > th.headTiltDeg) {
      issues.push('HEAD_TILT');
    }
  }

  return {
    ratio,
    shoulderWidth,
    eyeAngleDeg,
    shoulderAngleDeg,
    issues,
    isInterference,
    isUpright: issues.length === 0,
  };
}
