/**
 * 0.5s Iris Depth Estimation & Metric Scale Extractor
 * Based on MediaPipe Iris tracking principles:
 * Human horizontal iris diameter is a biological constant (11.7 ± 0.5 mm)
 * across children and adolescents, enabling metric depth calibration without LiDAR.
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
  isCalibrated: boolean;
  confidence: number;
  timestampMs: number;
}

export interface CameraIntrinsics {
  width: number;
  height: number;
  horizontalFovDeg?: number; // Standard front camera ~65°
}

// Biological average iris diameter in millimeters
export const REAL_IRIS_DIAMETER_MM = 11.7;

/**
 * Calculates horizontal iris diameter in pixels from landmark coordinates.
 */
export function calculateIrisDiameterPixels(
  irisPoints: Array<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number
): number {
  if (!irisPoints || irisPoints.length < 2) return 0;

  // Find min and max X in normalized coordinates (0..1)
  let minX = Infinity;
  let maxX = -Infinity;

  for (const pt of irisPoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
  }

  const normalizedDiameter = maxX - minX;
  return normalizedDiameter * imageWidth;
}

/**
 * Estimates focal length in pixels from camera sensor dimensions and horizontal FOV.
 */
export function estimateFocalLengthPixels(camera: CameraIntrinsics): number {
  const fovDeg = camera.horizontalFovDeg ?? 65;
  const fovRad = (fovDeg * Math.PI) / 180;
  return camera.width / (2 * Math.tan(fovRad / 2));
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

  // Plausible iris pixel range for 30cm - 70cm desk range on typical smartphone cameras: 10px - 45px
  const isPlausible = avgIrisPx >= 8 && avgIrisPx <= 60;
  const distanceCm = isPlausible ? estimateDistanceCm(avgIrisPx, camera) : 45.0; // Fallback to 45cm nominal desk distance
  const mmPerPixel = isPlausible ? REAL_IRIS_DIAMETER_MM / avgIrisPx : 0.65;

  // Shoulder width in pixels
  const shoulderDx = (rightShoulder.x - leftShoulder.x) * camera.width;
  const shoulderDy = (rightShoulder.y - leftShoulder.y) * camera.height;
  const shoulderWidthPx = Math.sqrt(shoulderDx * shoulderDx + shoulderDy * shoulderDy);

  // Nose to shoulder midpoint vertical distance in pixels
  const shoulderMidY = ((leftShoulder.y + rightShoulder.y) / 2) * camera.height;
  const noseY = noseTip.y * camera.height;
  const noseShoulderHeightPx = Math.max(1, shoulderMidY - noseY);

  const baselineShoulderMm = Math.round(shoulderWidthPx * mmPerPixel * 10) / 10;
  const baselineNoseShoulderMm = Math.round(noseShoulderHeightPx * mmPerPixel * 10) / 10;

  return {
    distanceCm,
    irisDiameterPixels: Math.round(avgIrisPx * 10) / 10,
    mmPerPixel: Math.round(mmPerPixel * 1000) / 1000,
    baselineShoulderWidthPixels: Math.round(shoulderWidthPx * 10) / 10,
    baselineShoulderWidthMm: baselineShoulderMm,
    baselineNoseShoulderHeightPixels: Math.round(noseShoulderHeightPx * 10) / 10,
    baselineNoseShoulderHeightMm: baselineNoseShoulderMm,
    isCalibrated: isPlausible,
    confidence: isPlausible ? 0.95 : 0.4,
    timestampMs: nowMs,
  };
}
