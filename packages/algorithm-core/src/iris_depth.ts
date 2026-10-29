/**
 * 0.5s Iris Depth Estimation & Metric Scale Extractor
 * Based on MediaPipe Iris tracking principles:
 * Human iris diameter is a biological constant (11.7 ± 0.5 mm)
 * across children and adolescents, enabling metric depth calibration without LiDAR.
 * Supports both Portrait (竖放) and Landscape (横放) orientations seamlessly.
 */

export interface IrisLandmarks {
  // Left eye iris points (center, left, right, top, bottom)
  leftIris: Array<{ x: number; y: number; z?: number }>;
  // Right eye iris points (center, left, right, top, bottom)
  rightIris: Array<{ x: number; y: number; z?: number }>;
}

export interface IrisCalibrationResult {
  distanceCm: number;
  irisDiameterPixels: number;
  mmPerPixel: number;
  baselineShoulderWidthPixels: number;
  baselineShoulderWidthMm: number;
  baselineNoseShoulderHeightPixels: number;
  baselineNoseShoulderHeightMm: number;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  isCalibrated: boolean;
  confidence: number;
  timestampMs: number;
}

export interface CameraIntrinsics {
  width: number;
  height: number;
  horizontalFovDeg?: number; // Long-side FOV ~65° (Portrait H-FOV ~48°, Landscape H-FOV ~65°)
}

// Biological average iris diameter in millimeters
export const REAL_IRIS_DIAMETER_MM = 11.7;

/**
 * Calculates orientation-invariant iris diameter in pixels from landmark coordinates.
 * Works whether the phone is placed vertically (Portrait) or horizontally (Landscape).
 */
export function calculateIrisDiameterPixels(
  irisPoints: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number
): number {
  if (!irisPoints || irisPoints.length < 2) return 0;

  // Convert normalized coordinates to true pixel coordinates and find max pairwise span
  let maxSpanPx = 0;
  for (let i = 0; i < irisPoints.length; i++) {
    for (let j = i + 1; j < irisPoints.length; j++) {
      const dx = (irisPoints[i].x - irisPoints[j].x) * imageWidth;
      const dy = (irisPoints[i].y - irisPoints[j].y) * imageHeight;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxSpanPx) {
        maxSpanPx = dist;
      }
    }
  }

  return maxSpanPx;
}

/**
 * Estimates focal length in pixels from camera sensor dimensions.
 * Uses the sensor's long side (max(width, height)) so focal length in pixels
 * remains physically invariant between Portrait (480x640) and Landscape (640x480).
 */
export function estimateFocalLengthPixels(camera: CameraIntrinsics): number {
  const longSideFovDeg = camera.horizontalFovDeg ?? 65;
  const fovRad = (longSideFovDeg * Math.PI) / 180;
  const longSidePx = Math.max(camera.width, camera.height);
  return longSidePx / (2 * Math.tan(fovRad / 2));
}

/**
 * Estimates physical distance in centimeters from iris diameter in pixels.
 */
export function estimateDistanceCm(
  irisDiameterPixels: number,
  camera: CameraIntrinsics
): number {
  if (irisDiameterPixels <= 0) return 0;
  const focalLengthPx = estimateFocalLengthPixels(camera);
  // Z = (f * RealDiameter) / PixelDiameter
  const distanceMm = (focalLengthPx * REAL_IRIS_DIAMETER_MM) / irisDiameterPixels;
  return Math.round((distanceMm / 10) * 10) / 10;
}

/**
 * Calibrates 0.5s glance upon sitting down, producing true metric scale and baselines.
 * Automatically adapts to both Portrait (竖放) and Landscape (横放) phone placements.
 */
export function calibrateIrisDepth(
  leftIris: Array<{ x: number; y: number }>,
  rightIris: Array<{ x: number; y: number }>,
  leftShoulder: { x: number; y: number },
  rightShoulder: { x: number; y: number },
  noseTip: { x: number; y: number },
  camera: CameraIntrinsics,
  nowMs: number = Date.now()
): IrisCalibrationResult {
  const leftPx = calculateIrisDiameterPixels(leftIris, camera.width, camera.height);
  const rightPx = calculateIrisDiameterPixels(rightIris, camera.width, camera.height);

  let avgIrisPx = 0;
  if (leftPx > 0 && rightPx > 0) {
    avgIrisPx = (leftPx + rightPx) / 2;
  } else if (leftPx > 0) {
    avgIrisPx = leftPx;
  } else if (rightPx > 0) {
    avgIrisPx = rightPx;
  }

  // Plausible iris pixel range for 30cm - 70cm desk range on smartphone cameras: 8px - 60px
  const isPlausible = avgIrisPx >= 8 && avgIrisPx <= 60;
  const distanceCm = isPlausible ? estimateDistanceCm(avgIrisPx, camera) : 45.0;
  const mmPerPixel = isPlausible ? REAL_IRIS_DIAMETER_MM / avgIrisPx : 0.65;

  // Shoulder width in pixels (2D Euclidean distance, orientation-invariant)
  const shoulderDx = (rightShoulder.x - leftShoulder.x) * camera.width;
  const shoulderDy = (rightShoulder.y - leftShoulder.y) * camera.height;
  const shoulderWidthPx = Math.sqrt(shoulderDx * shoulderDx + shoulderDy * shoulderDy);

  // Nose to shoulder midpoint distance in pixels (2D Euclidean distance, orientation-invariant)
  const shoulderMidX = ((leftShoulder.x + rightShoulder.x) / 2) * camera.width;
  const shoulderMidY = ((leftShoulder.y + rightShoulder.y) / 2) * camera.height;
  const noseX = noseTip.x * camera.width;
  const noseY = noseTip.y * camera.height;
  const noseShoulderHeightPx = Math.max(
    1,
    Math.sqrt(Math.pow(shoulderMidX - noseX, 2) + Math.pow(shoulderMidY - noseY, 2))
  );

  const baselineShoulderMm = Math.round(shoulderWidthPx * mmPerPixel * 10) / 10;
  const baselineNoseShoulderMm = Math.round(noseShoulderHeightPx * mmPerPixel * 10) / 10;
  const orientation = camera.width >= camera.height ? 'LANDSCAPE' : 'PORTRAIT';

  return {
    distanceCm,
    irisDiameterPixels: Math.round(avgIrisPx * 10) / 10,
    mmPerPixel: Math.round(mmPerPixel * 1000) / 1000,
    baselineShoulderWidthPixels: Math.round(shoulderWidthPx * 10) / 10,
    baselineShoulderWidthMm: baselineShoulderMm,
    baselineNoseShoulderHeightPixels: Math.round(noseShoulderHeightPx * 10) / 10,
    baselineNoseShoulderHeightMm: baselineNoseShoulderMm,
    orientation,
    isCalibrated: isPlausible,
    confidence: isPlausible ? 0.95 : 0.4,
    timestampMs: nowMs,
  };
}
