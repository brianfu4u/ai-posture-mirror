import { describe, it, expect } from 'vitest';
import {
  REAL_IRIS_DIAMETER_MM,
  calculateIrisDiameterPixels,
  estimateFocalLengthPixels,
  estimateDistanceCm,
  calibrateIrisDepth,
} from '../src/iris_depth.js';

describe('Iris Depth Estimation & Metric Calibration', () => {
  const camera = { width: 640, height: 480, horizontalFovDeg: 65 };

  it('calculates focal length in pixels correctly for 65 deg FOV', () => {
    const fx = estimateFocalLengthPixels(camera);
    // fx = 640 / (2 * tan(32.5 deg)) = 640 / (2 * 0.637) ~= 502 pixels
    expect(fx).toBeGreaterThan(490);
    expect(fx).toBeLessThan(515);
  });

  it('measures iris diameter in pixels from normalized coordinates', () => {
    // 20 pixels wide on 640px image -> normalized dx = 20 / 640 = 0.03125
    const irisPoints = [
      { x: 0.500, y: 0.300 },
      { x: 0.53125, y: 0.300 },
    ];
    const px = calculateIrisDiameterPixels(irisPoints, camera.width, camera.height);
    expect(Math.round(px)).toBe(20);
  });

  it('estimates distance accurately using 11.7mm iris standard', () => {
    const fx = estimateFocalLengthPixels(camera);
    // At distance 450 mm (45 cm):
    // pixel diameter = (fx * 11.7) / 450 ~= (502 * 11.7) / 450 ~= 13.05 pixels
    const irisPx = (fx * REAL_IRIS_DIAMETER_MM) / 450;
    const estimatedDistance = estimateDistanceCm(irisPx, camera);
    expect(estimatedDistance).toBeCloseTo(45.0, 0);
  });

  it('completes 0.5s glance calibration producing physical millimeter metrics', () => {
    const leftIris = [{ x: 0.45, y: 0.25 }, { x: 0.475, y: 0.25 }]; // 16px wide
    const rightIris = [{ x: 0.55, y: 0.25 }, { x: 0.575, y: 0.25 }]; // 16px wide
    const leftShoulder = { x: 0.30, y: 0.55 };
    const rightShoulder = { x: 0.70, y: 0.55 };
    const noseTip = { x: 0.50, y: 0.30 };

    const result = calibrateIrisDepth(
      leftIris,
      rightIris,
      leftShoulder,
      rightShoulder,
      noseTip,
      camera
    );

    expect(result.isCalibrated).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.distanceCm).toBeGreaterThan(30);
    expect(result.distanceCm).toBeLessThan(65);
    expect(result.baselineShoulderWidthMm).toBeGreaterThan(150); // Real child shoulder > 15cm
    expect(result.baselineNoseShoulderHeightMm).toBeGreaterThan(80);
  });
});
