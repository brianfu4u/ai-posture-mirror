import {
  DEFAULT_POSTURE_THRESHOLDS,
  LM,
  type Landmark,
  type PoseLandmarks,
  type PostureBaseline,
  type PostureIssue,
  type PostureResult,
  type PostureThresholds,
} from './types.js';

export interface EvalOptions {
  /** Frame width / height. Normalized landmarks are anisotropic, so x is scaled by this. Default 1 (pass pixel-space or square coords). */
  aspectRatio?: number;
  /** Landmarks below this visibility are ignored for the dimensions that need them. Default 0.5 */
  minVisibility?: number;
}

const RAD2DEG = 180 / Math.PI;

interface P {
  x: number;
  y: number;
  z: number;
}

function pt(l: Landmark | undefined, aspect: number): P | null {
  if (!l) return null;
  return { x: l.x * aspect, y: l.y, z: l.z * aspect };
}

function visible(l: Landmark | undefined, min: number): boolean {
  return !!l && (l.visibility === undefined || l.visibility >= min);
}

/** Angle of line a->b relative to horizontal, folded into (-90, 90] so left/right ordering (mirrored video) is irrelevant. */
function lineAngleDeg(a: P, b: P): number {
  let deg = Math.atan2(b.y - a.y, b.x - a.x) * RAD2DEG;
  if (deg > 90) deg -= 180;
  else if (deg <= -90) deg += 180;
  return deg;
}

function dist3(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Perpendicular distance (2D) from p to the infinite line a-b. */
function distToLine(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

interface Core {
  ratio: number;
  shoulderWidth: number;
}

function core(lm: PoseLandmarks, aspect: number, minVis: number): Core | null {
  const nose = lm[LM.NOSE];
  const ls = lm[LM.LEFT_SHOULDER];
  const rs = lm[LM.RIGHT_SHOULDER];
  if (!visible(nose, minVis) || !visible(ls, minVis) || !visible(rs, minVis)) return null;
  const n = pt(nose, aspect)!;
  const a = pt(ls, aspect)!;
  const b = pt(rs, aspect)!;
  const w = Math.hypot(a.x - b.x, a.y - b.y);
  if (w < 1e-6) return null;
  return { ratio: distToLine(n, a, b) / w, shoulderWidth: w };
}

function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Build the opening baseline (R0, W0) from several frames (median, robust to outliers).
 * Throws if no frame has usable nose + shoulders.
 */
export function createBaseline(frames: readonly PoseLandmarks[], opts: EvalOptions = {}): PostureBaseline {
  const aspect = opts.aspectRatio ?? 1;
  const minVis = opts.minVisibility ?? 0.5;
  const cs = frames.map((f) => core(f, aspect, minVis)).filter((c): c is Core => c !== null);
  if (cs.length === 0) throw new Error('createBaseline: no frame with visible nose and both shoulders');
  return { ratio: median(cs.map((c) => c.ratio)), shoulderWidth: median(cs.map((c) => c.shoulderWidth)) };
}

/**
 * Evaluate one frame of 33 MediaPipe pose landmarks against the baseline.
 * Pure and allocation-light; no DOM dependency.
 * Dimensions whose landmarks are not visible are skipped (never flagged).
 */
export function evaluatePosture(
  lm: PoseLandmarks,
  baseline: PostureBaseline,
  th: PostureThresholds = DEFAULT_POSTURE_THRESHOLDS,
  opts: EvalOptions = {},
): PostureResult {
  const aspect = opts.aspectRatio ?? 1;
  const minVis = opts.minVisibility ?? 0.5;
  const issues: PostureIssue[] = [];

  const c = core(lm, aspect, minVis);
  const ratio = c?.ratio ?? NaN;
  const shoulderWidth = c?.shoulderWidth ?? NaN;
  if (c) {
    if (c.ratio < th.headDownRatio * baseline.ratio) issues.push('HEAD_DOWN');
    if (c.shoulderWidth > th.tooCloseRatio * baseline.shoulderWidth) issues.push('TOO_CLOSE');
  }

  let eyeAngleDeg = NaN;
  const le = lm[LM.LEFT_EYE];
  const re = lm[LM.RIGHT_EYE];
  if (visible(le, minVis) && visible(re, minVis)) {
    eyeAngleDeg = lineAngleDeg(pt(le, aspect)!, pt(re, aspect)!);
    if (Math.abs(eyeAngleDeg) > th.headTiltDeg) issues.push('HEAD_TILT');
  }

  let shoulderAngleDeg = NaN;
  const ls = lm[LM.LEFT_SHOULDER];
  const rs = lm[LM.RIGHT_SHOULDER];
  if (visible(ls, minVis) && visible(rs, minVis)) {
    shoulderAngleDeg = lineAngleDeg(pt(ls, aspect)!, pt(rs, aspect)!);
    if (Math.abs(shoulderAngleDeg) > th.shoulderTiltDeg) issues.push('SHOULDER_TILT');
  }

  const isInterference = detectInterference(lm, th, aspect, minVis);

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

/**
 * Hand-near-face filter. Face center = midpoint of nose and mouth-center
 * (MediaPipe Pose has no chin landmark). Radius = factor * inter-eye distance.
 */
export function detectInterference(
  lm: PoseLandmarks,
  th: PostureThresholds = DEFAULT_POSTURE_THRESHOLDS,
  aspect = 1,
  minVis = 0.5,
): boolean {
  const nose = lm[LM.NOSE];
  const ml = lm[LM.MOUTH_LEFT];
  const mr = lm[LM.MOUTH_RIGHT];
  const le = lm[LM.LEFT_EYE];
  const re = lm[LM.RIGHT_EYE];
  if (!visible(nose, minVis) || !visible(ml, minVis) || !visible(mr, minVis) || !visible(le, minVis) || !visible(re, minVis)) {
    return false;
  }
  const n = pt(nose, aspect)!;
  const a = pt(ml, aspect)!;
  const b = pt(mr, aspect)!;
  const mouth: P = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  const face: P = { x: (n.x + mouth.x) / 2, y: (n.y + mouth.y) / 2, z: (n.z + mouth.z) / 2 };
  const radius = th.interferenceFactor * dist3(pt(le, aspect)!, pt(re, aspect)!);
  for (const idx of [LM.LEFT_WRIST, LM.RIGHT_WRIST]) {
    const w = lm[idx];
    if (visible(w, minVis) && dist3(pt(w, aspect)!, face) < radius) return true;
  }
  return false;
}
