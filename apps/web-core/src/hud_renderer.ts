/**
 * HUD & Particle Renderer for AI Posture Mirror
 * Handles skeleton visualization, posture alignment lines, and celebration particle physics.
 */

import { type Landmark, type PostureResult } from '@apm/algorithm-core';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
  rotation: number;
  vRot: number;
  type: 'flower' | 'sparkle' | 'coin';
}

export class HudRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to acquire 2D canvas context');
    this.ctx = context;
  }

  /**
   * Spawns celebration particles for parent red flower encouragement.
   */
  public spawnFlowerShower(count: number = 25): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: w * 0.5 + (Math.random() - 0.5) * w * 0.4,
        y: h * 0.6 + (Math.random() - 0.5) * h * 0.2,
        vx: (Math.random() - 0.5) * 4,
        vy: -3 - Math.random() * 5,
        size: 16 + Math.random() * 14,
        alpha: 1.0,
        decay: 0.012 + Math.random() * 0.01,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.1,
        type: 'flower',
      });
    }
  }

  /**
   * Spawns sparkling gold stars for Zero-Reminder Gold Master achievement.
   */
  public spawnGoldCelebration(count: number = 35): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x: w * 0.5,
        y: h * 0.45,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 8 + Math.random() * 10,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.01,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.15,
        type: 'sparkle',
      });
    }
  }

  /**
   * Renders landmarks, posture guidelines, and active particles.
   */
  public render(landmarks?: Landmark[], posture?: PostureResult): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Draw skeletal alignment overlay if landmarks are present
    if (landmarks && landmarks.length >= 17) {
      const nose = landmarks[0]!;
      const leftEye = landmarks[2]!;
      const rightEye = landmarks[5]!;
      const leftShoulder = landmarks[11]!;
      const rightShoulder = landmarks[12]!;

      const isUpright = posture?.isUpright ?? true;
      const isInterference = posture?.isInterference ?? false;

      // Color coding: emerald green (good), sky blue (resting hand), amber (slouch)
      const strokeColor = isInterference ? '#38bdf8' : isUpright ? '#10b981' : '#f59e0b';

      ctx.save();
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;

      // 1. Shoulder line
      ctx.beginPath();
      ctx.moveTo(leftShoulder.x * w, leftShoulder.y * h);
      ctx.lineTo(rightShoulder.x * w, rightShoulder.y * h);
      ctx.stroke();

      // 2. Spine / Neck vertical drop line
      const midShoulderX = ((leftShoulder.x + rightShoulder.x) / 2) * w;
      const midShoulderY = ((leftShoulder.y + rightShoulder.y) / 2) * h;
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(nose.x * w, nose.y * h);
      ctx.lineTo(midShoulderX, midShoulderY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Eye line
      ctx.beginPath();
      ctx.moveTo(leftEye.x * w, leftEye.y * h);
      ctx.lineTo(rightEye.x * w, rightEye.y * h);
      ctx.stroke();

      // 4. Keypoints
      const keypoints = [nose, leftEye, rightEye, leftShoulder, rightShoulder];
      for (const pt of keypoints) {
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }

    // Update and draw floating particles
    if (this.particles.length > 0) {
      ctx.save();
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // Gravity
        p.rotation += p.vRot;
        p.alpha -= p.decay;

        if (p.alpha <= 0 || p.y > h + 50) {
          this.particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.alpha);

        if (p.type === 'flower') {
          ctx.font = `${p.size}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🌸', 0, 0);
        } else if (p.type === 'sparkle') {
          ctx.font = `${p.size}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✨', 0, 0);
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }
}
