/**
 * Shared contracts for @apm/algorithm-core.
 * Pure TypeScript — no DOM / UI dependencies, so it can run in PWA, Mini Program and Node tests.
 * Work orders #1–#3 implement against these types. Change them only via a reviewed PR.
 */

/** One MediaPipe Pose Landmarker point (normalized image coords, z relative to hips). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** 33 landmarks in MediaPipe Pose order. */
export type PoseLandmarks = readonly Landmark[];

/** MediaPipe Pose indices used by this project. */
export const LM = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const;

/** Baseline captured during ALIGNING (opening calibration). */
export interface PostureBaseline {
  /** R0 = H0 / W0 */
  ratio: number;
  /** W0, shoulder width */
  shoulderWidth: number;
}

export interface PostureThresholds {
  /** Head-down when Rt < headDownRatio * R0. Default 0.68 */
  headDownRatio: number;
  /** Too close when Wt > tooCloseRatio * W0. Default 1.25 */
  tooCloseRatio: number;
  /** Head tilt when |eye-line angle| > deg. Default 15 */
  headTiltDeg: number;
  /** Shoulder tilt when |shoulder-line angle| > deg. Default 12 */
  shoulderTiltDeg: number;
  /** Interference radius = factor * inter-eye distance. Default 1.2 */
  interferenceFactor: number;
}

export const DEFAULT_POSTURE_THRESHOLDS: PostureThresholds = {
  headDownRatio: 0.68,
  tooCloseRatio: 1.25,
  headTiltDeg: 15,
  shoulderTiltDeg: 12,
  interferenceFactor: 1.2,
};

export type PostureIssue = 'HEAD_DOWN' | 'TOO_CLOSE' | 'HEAD_TILT' | 'SHOULDER_TILT';

export interface PostureResult {
  /** Rt = Ht / Wt */
  ratio: number;
  shoulderWidth: number;
  eyeAngleDeg: number;
  shoulderAngleDeg: number;
  issues: PostureIssue[];
  /** Hand near face (chin rest / drinking). Abnormal timers must pause. */
  isInterference: boolean;
  /** true when issues.length === 0 */
  isUpright: boolean;
}

// ---------- Lux gate (#2) ----------

export type LuxStatus = 'TOO_DARK' | 'LUX_QUALIFIED' | 'UNKNOWN';

export interface LuxReading {
  /** Mean perceived luma 0–255 of the central work area. */
  luma: number;
  /** Estimated desk illuminance. Heuristic estimate, NOT a calibrated lux meter. */
  estimatedLux: number;
  status: LuxStatus;
  timestampMs: number;
}

// ---------- Session FSM (#3) ----------

export type SessionStateName = 'STANDBY' | 'ALIGNING' | 'ACTIVE_STUDY' | 'SESSION_FINISHED';

export interface SessionReport {
  /** Format: YYYYMMDD_HHmmss (local time of session start) */
  sessionId: string;
  durationSeconds: number;
  reminderCount: number;
  /** 0–100 integer */
  uprightPercentage: number;
  isZeroReminderMaster: boolean;
  luxQualified: boolean;
}
