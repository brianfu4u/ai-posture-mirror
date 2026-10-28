/**
 * Silent-period manager. After a posture reminder FINISHES playing, all further reminders
 * are refused for `cooldownMs` (default 45 s) no matter how bad the posture stays.
 * Clock is injected so tests never wait.
 */
export class CooldownManager {
  private lockedUntil = 0;
  private active = false; // a reminder is currently sounding

  constructor(
    private readonly clock: () => number,
    readonly cooldownMs = 45_000,
  ) {}

  /** Reserve the right to play a reminder. Returns false while playing or locked. */
  tryAcquire(): boolean {
    if (this.active || this.clock() < this.lockedUntil) return false;
    this.active = true;
    return true;
  }

  /** Call when the reminder sound has ended (starts the 45 s silence). */
  release(): void {
    this.active = false;
    this.lockedUntil = this.clock() + this.cooldownMs;
  }

  /** Call if playback failed to start, so no cooldown is charged. */
  cancel(): void {
    this.active = false;
  }

  get remainingMs(): number {
    return this.active ? this.cooldownMs : Math.max(0, this.lockedUntil - this.clock());
  }

  get isLocked(): boolean {
    return this.active || this.clock() < this.lockedUntil;
  }

  reset(): void {
    this.active = false;
    this.lockedUntil = 0;
  }
}
