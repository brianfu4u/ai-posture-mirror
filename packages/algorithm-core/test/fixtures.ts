import { type Landmark, type PoseLandmarks } from '../src/types.js';

export interface Overrides {
  [idx: number]: Partial<Landmark>;
}

/**
 * Synthetic upright pose in square image coords (y grows downward).
 * Shoulders at y=0.60, x=0.35/0.65 (W=0.30). Nose 0.18 above shoulder line (R0=0.60).
 * Eyes 0.06 apart horizontally (x=0.47/0.53), y=0.38.
 */
export function uprightPose(over: Overrides = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const set = (i: number, x: number, y: number, z = 0) => {
    lm[i] = { x, y, z, visibility: 1 };
  };
  set(0, 0.5, 0.42); // nose
  set(2, 0.47, 0.38); // left eye
  set(5, 0.53, 0.38); // right eye
  set(9, 0.48, 0.46); // mouth L
  set(10, 0.52, 0.46); // mouth R
  set(11, 0.35, 0.6); // left shoulder
  set(12, 0.65, 0.6); // right shoulder
  set(15, 0.3, 0.9); // left wrist (resting on desk)
  set(16, 0.7, 0.9); // right wrist
  for (const [k, v] of Object.entries(over)) lm[Number(k)] = { ...lm[Number(k)]!, ...v };
  return lm;
}

export const asPose = (l: Landmark[]): PoseLandmarks => l;

/** Rotate point p around c by deg (y-down image coords, positive = clockwise on screen). */
export function rot(p: { x: number; y: number }, c: { x: number; y: number }, deg: number) {
  const r = (deg * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) };
}
