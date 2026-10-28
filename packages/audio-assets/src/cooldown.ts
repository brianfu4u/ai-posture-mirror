export interface CooldownOptions {
  cooldownMs?: number; // Default 45000 (45s)
  clock?: () => number;
}

export class ReminderCooldownManager {
  private cooldownMs: number;
  private clock: () => number;

  private activeUntilMs: number = 0; // When current sound finishes playing
  private cooldownUntilMs: number = 0; // When 45s cooldown period ends

  constructor(opts: CooldownOptions = {}) {
    this.cooldownMs = opts.cooldownMs ?? 45000;
    this.clock = opts.clock ?? (() => Date.now());
  }

  canPlay(nowMs?: number): boolean {
    const now = nowMs ?? this.clock();
    return now >= this.cooldownUntilMs && now >= this.activeUntilMs;
  }

  onPlayStarted(soundDurationMs: number, nowMs?: number): void {
    const now = nowMs ?? this.clock();
    this.activeUntilMs = now + soundDurationMs;
    // 45-second cooldown begins STRICTLY AFTER the sound finishes playing!
    this.cooldownUntilMs = this.activeUntilMs + this.cooldownMs;
  }

  isCoolingDown(nowMs?: number): boolean {
    const now = nowMs ?? this.clock();
    return now < this.cooldownUntilMs;
  }

  remainingMs(nowMs?: number): number {
    const now = nowMs ?? this.clock();
    return Math.max(0, this.cooldownUntilMs - now);
  }

  reset(): void {
    this.activeUntilMs = 0;
    this.cooldownUntilMs = 0;
  }
}
