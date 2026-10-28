import { ReminderCooldownManager } from './cooldown.js';

export type AudioTheme = 'cartoon' | 'forest' | 'pixel';

export class SoundPlayer {
  private ctx: AudioContext | null = null;
  private cooldown: ReminderCooldownManager;
  private currentTheme: AudioTheme = 'cartoon';

  constructor(cooldownMs: number = 45000) {
    this.cooldown = new ReminderCooldownManager({ cooldownMs });
  }

  /**
   * Unlocks AudioContext on user touch/click gesture (essential for iOS Safari).
   */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setTheme(theme: AudioTheme): void {
    this.currentTheme = theme;
  }

  getTheme(): AudioTheme {
    return this.currentTheme;
  }

  /**
   * System Sound: Device Locked (stand alignment click) - NOT constrained by cooldown.
   */
  playDeviceLocked(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.05);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /**
   * System Sound: Camera Focus Beep (0.5s eye glance focus) - NOT constrained by cooldown.
   */
  playCameraFocus(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1760, t + 0.08);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.23);
  }

  /**
   * Positive Reward Chime (Coin / Flower reward).
   */
  playRewardChime(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(987.77, t);
    osc1.frequency.setValueAtTime(1318.51, t + 0.08);
    osc2.frequency.setValueAtTime(1318.51, t + 0.08);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);
    osc1.start(t);
    osc2.start(t + 0.08);
    osc1.stop(t + 0.5);
    osc2.stop(t + 0.5);
  }

  /**
   * Posture Anomaly Reminder Sound (strictly constrained by 45-second cooldown).
   * Returns true if sound was actually played, false if rejected by cooldown.
   */
  playPostureReminder(): boolean {
    if (!this.cooldown.canPlay()) {
      return false;
    }
    if (!this.ctx) return false;

    const t = this.ctx.currentTime;
    let durationSeconds = 0.45;

    if (this.currentTheme === 'cartoon') {
      // Original synthesized Cartoon Spring "Boing" + gentle downward chirp (no copyrighted Minions)
      durationSeconds = 0.45;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.35);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + durationSeconds);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + durationSeconds);
    } else if (this.currentTheme === 'forest') {
      // Synthesized Marimba Chime chords
      durationSeconds = 0.65;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.1);
        gain.gain.setValueAtTime(0.06, t + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.1 + 0.55);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t + idx * 0.1);
        osc.stop(t + idx * 0.1 + 0.55);
      });
    } else {
      // Synthesized 8-bit Retro Arcade "Oops"
      durationSeconds = 0.35;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.setValueAtTime(330, t + 0.08);
      osc.frequency.setValueAtTime(220, t + 0.16);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + durationSeconds);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + durationSeconds);
    }

    // Trigger cooldown starting immediately when sound ends
    this.cooldown.onPlayStarted(Math.round(durationSeconds * 1000));
    return true;
  }

  isCoolingDown(): boolean {
    return this.cooldown.isCoolingDown();
  }

  getCooldownRemainingMs(): number {
    return this.cooldown.remainingMs();
  }
}
