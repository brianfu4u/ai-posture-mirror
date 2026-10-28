import { type LuxReading, type LuxStatus } from './types.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExposureHint {
  exposureTime?: number;
  iso?: number;
  exposureCompensation?: number;
}

export interface LuxGateOptions {
  darkThresholdLux?: number;      // Default 500
  qualifiedThresholdLux?: number; // Default 500
  debounceMs?: number;            // Default 2000 (2 seconds)
  calibrationFactor?: number;     // Factory calibration multiplier, default 1.0
}

/**
 * Computes perceived luminance (luma 0-255) for a given RGBA image array.
 * Uses standard ITU-R BT.601 formula: Y = 0.299 R + 0.587 G + 0.114 B.
 * If roi (Region of Interest) is provided, computes only within that region.
 */
export function computeLuma(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  roi?: Rect
): number {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return 0;
  }

  const startX = roi ? Math.max(0, Math.floor(roi.x)) : 0;
  const startY = roi ? Math.max(0, Math.floor(roi.y)) : 0;
  const endX = roi ? Math.min(width, Math.floor(roi.x + roi.width)) : width;
  const endY = roi ? Math.min(height, Math.floor(roi.y + roi.height)) : height;

  if (startX >= endX || startY >= endY) {
    return 0;
  }

  let totalLuma = 0;
  let pixelCount = 0;

  for (let y = startY; y < endY; y++) {
    const rowOffset = y * width * 4;
    for (let x = startX; x < endX; x++) {
      const idx = rowOffset + x * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuma += luma;
      pixelCount++;
    }
  }

  return pixelCount > 0 ? totalLuma / pixelCount : 0;
}

/**
 * Heuristic mapping from luma and camera exposure hints to estimated lux.
 * Note: Estimated heuristic value for desk lamp gatekeeper, NOT a calibrated medical lux meter.
 */
export function estimateLuxFromLuma(
  luma: number,
  calibrationFactor: number = 1.0,
  exposureHint?: ExposureHint
): number {
  // Base heuristic mapping:
  // Luma 0 -> ~50 Lux
  // Luma 60 -> ~300 Lux (dim)
  // Luma 100 -> ~500 Lux (standard reading threshold)
  // Luma 160 -> ~850 Lux (AA desk lamp center)
  // Luma 220 -> ~1200+ Lux
  let baseLux = Math.pow(luma / 100, 1.45) * 500;

  if (exposureHint?.iso && exposureHint?.exposureTime) {
    // If camera exposure settings exist, adjust estimation
    const ev = Math.log2((exposureHint.iso * 100) / (exposureHint.exposureTime * 1000 + 1));
    if (!isNaN(ev) && isFinite(ev)) {
      baseLux = baseLux * (1 + (ev - 10) * 0.1);
    }
  }

  return Math.max(10, Math.round(baseLux * calibrationFactor));
}

/**
 * LuxGate manages ambient light threshold evaluation with a strict 2-second two-way debounce hysteresis.
 */
export class LuxGate {
  private darkThresholdLux: number;
  private qualifiedThresholdLux: number;
  private debounceMs: number;
  private calibrationFactor: number;

  private currentStatus: LuxStatus = 'UNKNOWN';
  private candidateStatus: LuxStatus | null = null;
  private candidateSinceMs: number = 0;

  constructor(opts: LuxGateOptions = {}) {
    this.darkThresholdLux = opts.darkThresholdLux ?? 500;
    this.qualifiedThresholdLux = opts.qualifiedThresholdLux ?? 500;
    this.debounceMs = opts.debounceMs ?? 2000;
    this.calibrationFactor = opts.calibrationFactor ?? 1.0;
  }

  /**
   * Pushes a new reading and returns debounced LuxReading.
   */
  push(luma: number, nowMs: number, exposureHint?: ExposureHint): LuxReading {
    const estimatedLux = estimateLuxFromLuma(luma, this.calibrationFactor, exposureHint);
    const instantStatus: LuxStatus =
      estimatedLux < this.darkThresholdLux ? 'TOO_DARK' : 'LUX_QUALIFIED';

    if (this.currentStatus === 'UNKNOWN') {
      // First initialization
      this.currentStatus = instantStatus;
      this.candidateStatus = null;
      this.candidateSinceMs = 0;
    } else if (instantStatus !== this.currentStatus) {
      if (this.candidateStatus !== instantStatus) {
        // New candidate status started
        this.candidateStatus = instantStatus;
        this.candidateSinceMs = nowMs;
      } else {
        // Continuous candidate status confirmed over debounce time
        if (nowMs - this.candidateSinceMs >= this.debounceMs) {
          this.currentStatus = instantStatus;
          this.candidateStatus = null;
          this.candidateSinceMs = 0;
        }
      }
    } else {
      // Current reading agrees with currentStatus -> cancel any pending flip candidate
      this.candidateStatus = null;
      this.candidateSinceMs = 0;
    }

    return {
      luma: Math.round(luma * 10) / 10,
      estimatedLux,
      status: this.currentStatus,
      timestampMs: nowMs,
    };
  }

  getStatus(): LuxStatus {
    return this.currentStatus;
  }

  setCalibrationFactor(factor: number): void {
    if (factor > 0) {
      this.calibrationFactor = factor;
    }
  }
}
