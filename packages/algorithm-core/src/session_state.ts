import type { LuxReading, PostureIssue, PostureResult, SessionReport, SessionStateName } from './types.js';

/**
 * "Starts when someone sits, ends when they leave" session state machine.
 * Pure TS, no timers: all time comes from the `nowMs` (epoch ms) passed to onFrame(),
 * so tests use a fake clock and never wait. The caller must keep feeding frames
 * (1 FPS in STANDBY, 10 FPS otherwise, see `targetFps`) — including "no person" frames.
 *
 *   STANDBY --person sits (and desk is bright enough)--> ALIGNING --0.5 s steady--> ACTIVE_STUDY
 *   ACTIVE_STUDY --absent >= 60 s--> SESSION_FINISHED --next frame--> STANDBY / ALIGNING
 *   ALIGNING --person leaves--> STANDBY (no session)
 */

export interface FrameInput {
  personPresent: boolean;
  /** Result of evaluatePosture() for this frame (WO-1). Omit when no pose was computed. */
  posture?: PostureResult | undefined;
  /** Latest LuxGate reading (WO-2). */
  lux?: LuxReading | undefined;
}

export interface SessionMachineOptions {
  /** Absence that ends a session. Default 60 000 */
  leaveTimeoutMs?: number;
  /** Steady presence needed before study starts (camera-focus beep time). Default 500 */
  alignMs?: number;
  /** Study time with zero reminders needed for the gold badge. Default 600 000 (10 min) */
  zeroReminderMinMs?: number;
  /** Refuse to start a session while the committed lux status is TOO_DARK. Default true */
  refuseWhenDark?: boolean;
}

export interface TransitionEvent {
  from: SessionStateName;
  to: SessionStateName;
  atMs: number;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** YYYYMMDD_HHmmss in the device's local time. */
export function formatSessionId(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export class SessionMachine {
  private readonly leaveTimeoutMs: number;
  private readonly alignMs: number;
  private readonly zeroReminderMinMs: number;
  private readonly refuseWhenDark: boolean;

  private _state: SessionStateName = 'STANDBY';
  private lastNow = 0;

  private alignStart = 0;
  private sessionStart = 0; // moment the person sat down (ALIGNING entry) -> sessionId
  private activeStart = 0; // ACTIVE_STUDY entry -> duration origin
  private lastPresentMs = 0;
  private absentSince: number | null = null;

  private reminders = 0;
  private validFrames = 0;
  private uprightFrames = 0;
  private sawDark = false;

  // continuous-abnormal tracker (for the caller's "remind after N seconds" policy)
  private abnormalAccumMs = 0;
  private abnormalLastTick: number | null = null;
  private abnormalIssuesNow: PostureIssue[] = [];

  private finishedCbs: Array<(r: SessionReport) => void> = [];
  private transitionCbs: Array<(e: TransitionEvent) => void> = [];
  private _darkRefused = false;

  constructor(opts: SessionMachineOptions = {}) {
    this.leaveTimeoutMs = opts.leaveTimeoutMs ?? 60_000;
    this.alignMs = opts.alignMs ?? 500;
    this.zeroReminderMinMs = opts.zeroReminderMinMs ?? 600_000;
    this.refuseWhenDark = opts.refuseWhenDark ?? true;
  }

  get state(): SessionStateName {
    return this._state;
  }

  /** STANDBY runs at 1 FPS to save power; everything else at 10 FPS. */
  get targetFps(): 1 | 10 {
    return this._state === 'STANDBY' ? 1 : 10;
  }

  /** True while someone is at the desk but the session is held back because the desk is too dark (UI: show "turn on the lamp"). */
  get darkRefused(): boolean {
    return this._darkRefused;
  }

  /** True during ACTIVE_STUDY while the person is out of frame but the 60 s timer has not expired. */
  get isAbsent(): boolean {
    return this._state === 'ACTIVE_STUDY' && this.absentSince !== null;
  }

  /** Reminders played so far in the current session. */
  get reminderCount(): number {
    return this.reminders;
  }

  /**
   * How long posture has been continuously abnormal. Hand-interference frames PAUSE this timer
   * (neither advance nor reset); upright frames, absence or a new session reset it.
   * The app compares it with its own threshold, then calls SoundPlayer.playReminder().
   */
  get abnormalForMs(): number {
    return this.abnormalAccumMs;
  }

  get abnormalIssues(): readonly PostureIssue[] {
    return this.abnormalIssuesNow;
  }

  onFinished(cb: (r: SessionReport) => void): () => void {
    this.finishedCbs.push(cb);
    return () => {
      this.finishedCbs = this.finishedCbs.filter((c) => c !== cb);
    };
  }

  onTransition(cb: (e: TransitionEvent) => void): () => void {
    this.transitionCbs.push(cb);
    return () => {
      this.transitionCbs = this.transitionCbs.filter((c) => c !== cb);
    };
  }

  /**
   * Call after SoundPlayer.playReminder() returned true (i.e. a reminder actually sounded —
   * refused/cooldown-suppressed reminders must NOT be counted). Ignored outside ACTIVE_STUDY.
   */
  onReminderPlayed(): void {
    if (this._state !== 'ACTIVE_STUDY') return;
    this.reminders++;
    this.resetAbnormal();
  }

  /** Drop everything and return to STANDBY without emitting a report. */
  reset(): void {
    this._state = 'STANDBY';
    this.resetSession();
  }

  onFrame(input: FrameInput, nowMs: number): SessionStateName {
    const now = Math.max(nowMs, this.lastNow); // never go back in time
    this.lastNow = now;

    if (this._state === 'SESSION_FINISHED') this.go('STANDBY', now);

    switch (this._state) {
      case 'STANDBY':
        this.stepStandby(input, now);
        break;
      case 'ALIGNING':
        this.stepAligning(input, now);
        break;
      case 'ACTIVE_STUDY':
        this.stepActive(input, now);
        break;
      default:
        break;
    }
    return this._state;
  }

  // ---------------------------------------------------------------- states

  private stepStandby(input: FrameInput, now: number): void {
    if (!input.personPresent) {
      this._darkRefused = false;
      return;
    }
    if (this.refuseWhenDark && input.lux?.status === 'TOO_DARK') {
      this._darkRefused = true;
      return;
    }
    this._darkRefused = false;
    this.resetSession();
    this.sessionStart = now;
    this.alignStart = now;
    this.go('ALIGNING', now);
  }

  private stepAligning(input: FrameInput, now: number): void {
    if (!input.personPresent || (this.refuseWhenDark && input.lux?.status === 'TOO_DARK')) {
      this._darkRefused = input.personPresent;
      this.go('STANDBY', now);
      return;
    }
    if (now - this.alignStart >= this.alignMs) {
      this.activeStart = now;
      this.lastPresentMs = now;
      this.absentSince = null;
      this.go('ACTIVE_STUDY', now);
      this.countFrame(input, now);
    }
  }

  private stepActive(input: FrameInput, now: number): void {
    if (!input.personPresent) {
      this.absentSince ??= now;
      this.resetAbnormal();
      if (now - this.absentSince >= this.leaveTimeoutMs) this.finish(now);
      return;
    }
    // back in frame (e.g. picked up an eraser): the session simply continues
    this.absentSince = null;
    this.lastPresentMs = now;
    this.countFrame(input, now);
  }

  // ---------------------------------------------------------------- stats

  private countFrame(input: FrameInput, now: number): void {
    if (input.lux?.status === 'TOO_DARK') {
      // Pose in the dark is unreliable: mark the session and do not judge posture.
      this.sawDark = true;
      this.resetAbnormal();
      return;
    }
    const p = input.posture;
    if (!p) return;

    if (p.isInterference) {
      // Chin-rest / drinking: excluded from the percentage (numerator AND denominator); abnormal timer is suspended.
      this.abnormalLastTick = null;
      return;
    }

    this.validFrames++;
    if (p.isUpright) {
      this.uprightFrames++;
      this.resetAbnormal();
    } else {
      if (this.abnormalLastTick !== null) this.abnormalAccumMs += Math.max(0, now - this.abnormalLastTick);
      this.abnormalLastTick = now;
      this.abnormalIssuesNow = p.issues;
    }
  }

  private resetAbnormal(): void {
    this.abnormalAccumMs = 0;
    this.abnormalLastTick = null;
    this.abnormalIssuesNow = [];
  }

  private resetSession(): void {
    this.reminders = 0;
    this.validFrames = 0;
    this.uprightFrames = 0;
    this.sawDark = false;
    this.absentSince = null;
    this.resetAbnormal();
  }

  private finish(now: number): void {
    // The trailing absence is NOT study time: the clock stops at the last frame the person was seen.
    const durationMs = Math.max(0, this.lastPresentMs - this.activeStart);
    const report: SessionReport = {
      sessionId: formatSessionId(this.sessionStart),
      durationSeconds: Math.floor(durationMs / 1000),
      reminderCount: this.reminders,
      uprightPercentage: this.validFrames === 0 ? 100 : Math.round((100 * this.uprightFrames) / this.validFrames),
      isZeroReminderMaster: this.reminders === 0 && durationMs >= this.zeroReminderMinMs,
      luxQualified: !this.sawDark,
    };
    this.go('SESSION_FINISHED', now);
    for (const cb of [...this.finishedCbs]) cb(report);
    this.resetSession();
  }

  private go(to: SessionStateName, atMs: number): void {
    const from = this._state;
    if (from === to) return;
    this._state = to;
    for (const cb of [...this.transitionCbs]) cb({ from, to, atMs });
  }
}
