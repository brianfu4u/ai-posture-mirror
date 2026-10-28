import type { LuxReading, LuxStatus } from './types.js';

/**
 * Desk-lighting gate.
 *
 * IMPORTANT: a phone camera is NOT a calibrated lux meter. Auto-exposure normalizes brightness,
 * so every value produced here is a heuristic ESTIMATE. Never present it as precise measurement.
 * Pure TypeScript, no DOM: the web app extracts 160x120 RGBA frames once per second and passes them in.
 */

export interface Rect {
  /** All values are fractions of the frame (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Central work area (notebook) by default: middle 60% x 60%. */
export const DEFAULT_ROI: Rect = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };

/**
 * Mean perceived luma (0..255) of the ROI, Y = 0.299R + 0.587G + 0.114B,
 * with a center-weighted falloff (weight 1 at ROI center -> 0.5 at ROI edge).
 */
export function computeLuma(rgba: Uint8ClampedArray, width: number, height: number, roi: Rect = DEFAULT_ROI): number {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    throw new Error('computeLuma: buffer smaller than width*height*4');
  }
  const x0 = Math.max(0, Math.floor(roi.x * width));
  const y0 = Math.max(0, Math.floor(roi.y * height));
  const x1 = Math.min(width, Math.ceil((roi.x + roi.w) * width));
  const y1 = Math.min(height, Math.ceil((roi.y + roi.h) * height));
  if (x1 <= x0 || y1 <= y0) throw new Error('computeLuma: empty ROI');
  const cx = (x0 + x1 - 1) / 2;
  const cy = (y0 + y1 - 1) / 2;
  const hx = Math.max((x1 - x0) / 2, 1);
  const hy = Math.max((y1 - y0) / 2, 1);
  let sum = 0;
  let wsum = 0;
  for (let y = y0; y < y1; y++) {
    const wy = 1 - 0.5 * Math.min(1, Math.abs(y - cy) / hy);
    for (let x = x0; x < x1; x++) {
      const w = wy * (1 - 0.5 * Math.min(1, Math.abs(x - cx) / hx));
      const i = (y * width + x) * 4;
      const Y = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
      sum += Y * w;
      wsum += w;
    }
  }
  return sum / wsum;
}

/** Camera exposure metadata from MediaStreamTrack.getSettings(), when the browser exposes it. */
export interface ExposureHint {
  /** Seconds (note: MediaStreamTrack reports exposureTime in 100 µs units on some browsers; convert before passing). */
  exposureTimeSec?: number;
  iso?: number;
}

export interface LuxCalibration {
  /** Lux estimate for a linear-luma of 1.0 when no exposure hint exists. Default 1500 (≈ bright desk lamp). */
  maxLuxNoHint: number;
  /** Device constant for the exposure-based path: lux = k * linearLuma / (exposureTimeSec * iso). Default 6. Calibrate per phone model at the factory. */
  exposureK: number;
  /** sRGB-ish gamma used to linearize luma. Default 2.2 */
  gamma: number;
}

export const DEFAULT_LUX_CALIBRATION: LuxCalibration = {
  maxLuxNoHint: 1500,
  exposureK: 6,
  gamma: 2.2,
};

/**
 * Estimate desk illuminance (lux).
 * - With exposure hint: brightness-vs-exposure (auto-exposure aware) -> lux = k * Lin / (t * ISO).
 * - Without: lux = maxLuxNoHint * Lin  (very rough; auto-exposure compresses the range).
 * Returned value is an ESTIMATE only.
 */
export function estimateLux(luma: number, hint?: ExposureHint, cal: LuxCalibration = DEFAULT_LUX_CALIBRATION): number {
  const lin = Math.pow(Math.min(Math.max(luma, 0), 255) / 255, cal.gamma);
  if (hint?.exposureTimeSec && hint.exposureTimeSec > 0 && hint.iso && hint.iso > 0) {
    return (cal.exposureK * lin) / (hint.exposureTimeSec * hint.iso);
  }
  return cal.maxLuxNoHint * lin;
}

export interface LuxGateOptions {
  /** Below this estimate the desk is too dark. Default 500 */
  minLux?: number;
  /** A new status must hold this long before it is committed (both directions). Default 2000 ms */
  debounceMs?: number;
  calibration?: LuxCalibration;
}

/**
 * Lux gatekeeper with symmetric 2 s debounce.
 *  - Starts as UNKNOWN; the first status is committed after it has held for debounceMs.
 *  - TOO_DARK -> LUX_QUALIFIED and the reverse both require debounceMs of consistent readings.
 *  - Any contrary reading resets the pending change, so brief shadows never flip the state.
 */
export class LuxGate {
  private readonly minLux: number;
  private readonly debounceMs: number;
  private readonly cal: LuxCalibration;
  private committed: LuxStatus = 'UNKNOWN';
  private pending: LuxStatus | null = null;
  private pendingSince = 0;

  constructor(opts: LuxGateOptions = {}) {
    this.minLux = opts.minLux ?? 500;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.cal = opts.calibration ?? DEFAULT_LUX_CALIBRATION;
  }

  get status(): LuxStatus {
    return this.committed;
  }

  /** Feed one ~1 Hz reading. */
  push(luma: number, nowMs: number, hint?: ExposureHint): LuxReading {
    const estimatedLux = estimateLux(luma, hint, this.cal);
    const raw: LuxStatus = estimatedLux < this.minLux ? 'TOO_DARK' : 'LUX_QUALIFIED';

    if (raw === this.committed) {
      this.pending = null;
    } else if (this.pending !== raw) {
      this.pending = raw;
      this.pendingSince = nowMs;
    }
    if (this.pending !== null && nowMs - this.pendingSince >= this.debounceMs) {
      this.committed = this.pending;
      this.pending = null;
    }
    return { luma, estimatedLux, status: this.committed, timestampMs: nowMs };
  }

  reset(): void {
    this.committed = 'UNKNOWN';
    this.pending = null;
  }
}
