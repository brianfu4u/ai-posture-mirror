import {
  type SessionStateName,
  type SessionReport,
  type PostureResult,
  type LuxReading,
} from './types.js';

export interface SessionMachineOptions {
  clock?: () => number;
  leaveTimeoutMs?: number;      // Default 60000 (60s)
  alignDurationMs?: number;     // Default 500 (0.5s focus)
  goldMasterMinSeconds?: number;// Default 600 (10 mins)
}

function formatSessionId(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}${m}${day}_${hh}${mm}${ss}`;
}

export class SessionMachine {
  private _state: SessionStateName = 'STANDBY';
  private clock: () => number;
  private leaveTimeoutMs: number;
  private alignDurationMs: number;
  private goldMasterMinSeconds: number;

  private finishedCallbacks: ((r: SessionReport) => void)[] = [];

  // Session Tracking Variables
  private sessionStartDate: Date | null = null;
  private sessionActiveStartMs: number = 0;
  private lastPersonSeenMs: number = 0;
  private absenceSinceMs: number = 0;
  private alignStartMs: number = 0;

  private reminderCount: number = 0;
  private validFrames: number = 0;
  private uprightFrames: number = 0;
  private luxEverDisqualified: boolean = false;

  // Continuous abnormal duration tracking (ms)
  private abnormalStartMs: number = 0;
  private continuousAbnormalMs: number = 0;

  constructor(opts: SessionMachineOptions = {}) {
    this.clock = opts.clock ?? (() => Date.now());
    this.leaveTimeoutMs = opts.leaveTimeoutMs ?? 60000;
    this.alignDurationMs = opts.alignDurationMs ?? 500;
    this.goldMasterMinSeconds = opts.goldMasterMinSeconds ?? 600;
  }

  get state(): SessionStateName {
    return this._state;
  }

  get targetFps(): 1 | 10 {
    return this._state === 'STANDBY' ? 1 : 10;
  }

  get continuousAbnormalDurationMs(): number {
    return this.continuousAbnormalMs;
  }

  onFinished(cb: (r: SessionReport) => void): void {
    this.finishedCallbacks.push(cb);
  }

  onReminderPlayed(): void {
    if (this._state === 'ACTIVE_STUDY') {
      this.reminderCount++;
      // Reset abnormal duration after alert played
      this.abnormalStartMs = 0;
      this.continuousAbnormalMs = 0;
    }
  }

  onFrame(
    input: { personPresent: boolean; posture?: PostureResult; lux?: LuxReading },
    nowMs?: number
  ): SessionStateName {
    const now = nowMs ?? this.clock();

    // Track lighting quality
    if (input.lux && input.lux.status === 'TOO_DARK') {
      this.luxEverDisqualified = true;
    }

    switch (this._state) {
      case 'STANDBY': {
        if (input.personPresent) {
          // If lighting is too dark, refuse to start session
          if (input.lux && input.lux.status === 'TOO_DARK') {
            return 'STANDBY';
          }
          // Person sat down -> start ALIGNING
          this._state = 'ALIGNING';
          this.sessionStartDate = new Date(now);
          this.alignStartMs = now;
          this.lastPersonSeenMs = now;
          this.absenceSinceMs = 0;
          this.reminderCount = 0;
          this.validFrames = 0;
          this.uprightFrames = 0;
          this.luxEverDisqualified = false;
          this.abnormalStartMs = 0;
          this.continuousAbnormalMs = 0;
        }
        break;
      }

      case 'ALIGNING': {
        if (!input.personPresent) {
          // Left during aligning -> abort to STANDBY
          this._state = 'STANDBY';
          break;
        }
        this.lastPersonSeenMs = now;

        // Check if 0.5s focus period elapsed
        if (now - this.alignStartMs >= this.alignDurationMs) {
          this._state = 'ACTIVE_STUDY';
          this.sessionActiveStartMs = now;
          this.lastPersonSeenMs = now;
        }
        break;
      }

      case 'ACTIVE_STUDY': {
        if (input.personPresent) {
          this.lastPersonSeenMs = now;
          this.absenceSinceMs = 0; // Cancel any pending absence timer

          // If too dark mid-session, pause posture evaluation
          const isDark = input.lux && input.lux.status === 'TOO_DARK';
          if (!isDark && input.posture) {
            const p = input.posture;
            // Frame posture accounting (exclude interference frames from both numerator and denominator)
            if (!p.isInterference) {
              this.validFrames++;
              if (p.isUpright) {
                this.uprightFrames++;
                // Reset continuous abnormal timer when sitting upright
                this.abnormalStartMs = 0;
                this.continuousAbnormalMs = 0;
              } else {
                // Anomaly detected
                if (this.abnormalStartMs === 0) {
                  this.abnormalStartMs = now;
                }
                this.continuousAbnormalMs = now - this.abnormalStartMs;
              }
            } else {
              // Hand near face (interference): pause/freeze abnormal timer (do not increase, do not reset)
              if (this.abnormalStartMs !== 0) {
                this.abnormalStartMs = now - this.continuousAbnormalMs;
              }
            }
          }
        } else {
          // Person not detected
          if (this.absenceSinceMs === 0) {
            this.absenceSinceMs = this.lastPersonSeenMs > 0 ? this.lastPersonSeenMs : now;
          }

          // Check if absence exceeded 60s leave timeout
          if (now - this.absenceSinceMs >= this.leaveTimeoutMs) {
            this.finishSession(now);
          }
        }
        break;
      }

      case 'SESSION_FINISHED': {
        // Transitional state, returns back to STANDBY
        this._state = 'STANDBY';
        break;
      }
    }

    return this._state;
  }

  private finishSession(finishNowMs: number): void {
    this._state = 'SESSION_FINISHED';

    // Duration is counted strictly up to the last moment person was seen (excluding the trailing 60s)
    const effectiveEndMs = Math.max(this.sessionActiveStartMs, this.lastPersonSeenMs);
    const durationSeconds = Math.max(
      0,
      Math.round((effectiveEndMs - this.sessionActiveStartMs) / 1000)
    );

    // Upright percentage
    const uprightPercentage =
      this.validFrames === 0
        ? 100
        : Math.min(100, Math.max(0, Math.round((this.uprightFrames / this.validFrames) * 100)));

    // Gold Master Zero-Reminder badge: 0 reminders and at least 10 minutes (600s)
    const isZeroReminderMaster =
      this.reminderCount === 0 && durationSeconds >= this.goldMasterMinSeconds;

    const report: SessionReport = {
      sessionId: formatSessionId(this.sessionStartDate ?? new Date(this.sessionActiveStartMs)),
      durationSeconds,
      reminderCount: this.reminderCount,
      uprightPercentage,
      isZeroReminderMaster,
      luxQualified: !this.luxEverDisqualified,
    };

    // Emit reports
    for (const cb of this.finishedCallbacks) {
      try {
        cb(report);
      } catch (err) {
        console.error('Session finished callback error:', err);
      }
    }

    // Auto transition to STANDBY
    this._state = 'STANDBY';
  }
}
