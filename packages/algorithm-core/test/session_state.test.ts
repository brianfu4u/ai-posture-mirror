import { describe, it, expect } from 'vitest';
import { SessionMachine } from '../src/session_state.js';
import { type PostureResult, type SessionReport } from '../src/types.js';

const mockGoodPosture: PostureResult = {
  ratio: 0.65,
  shoulderWidth: 0.3,
  eyeAngleDeg: 1,
  shoulderAngleDeg: 2,
  issues: [],
  isInterference: false,
  isUpright: true,
};

const mockSlouchPosture: PostureResult = {
  ratio: 0.25,
  shoulderWidth: 0.3,
  eyeAngleDeg: 1,
  shoulderAngleDeg: 2,
  issues: ['HEAD_DOWN'],
  isInterference: false,
  isUpright: false,
};

const mockInterferencePosture: PostureResult = {
  ratio: 0.65,
  shoulderWidth: 0.3,
  eyeAngleDeg: 1,
  shoulderAngleDeg: 2,
  issues: [],
  isInterference: true,
  isUpright: true,
};

describe('WO-3: Session State Machine Module', () => {
  it('manages lifecycle: STANDBY -> ALIGNING -> ACTIVE_STUDY -> SESSION_FINISHED', () => {
    let now = 100000;
    const sm = new SessionMachine({ clock: () => now, leaveTimeoutMs: 60000, alignDurationMs: 500 });

    expect(sm.state).toBe('STANDBY');
    expect(sm.targetFps).toBe(1);

    // Person sits down
    let s = sm.onFrame({ personPresent: true }, now);
    expect(s).toBe('ALIGNING');
    expect(sm.targetFps).toBe(10);

    // 0.5s focus period
    now += 550;
    s = sm.onFrame({ personPresent: true, posture: mockGoodPosture }, now);
    expect(s).toBe('ACTIVE_STUDY');

    let reportCaptured: SessionReport | null = null;
    sm.onFinished((r) => {
      reportCaptured = r;
    });

    // Active study for 100 seconds
    now += 100000;
    sm.onFrame({ personPresent: true, posture: mockGoodPosture }, now);

    // Person leaves desk at t = 200550
    const leaveTime = now;
    now += 10000; // 10s absence -> still in ACTIVE_STUDY (leave buffer)
    s = sm.onFrame({ personPresent: false }, now);
    expect(s).toBe('ACTIVE_STUDY');

    // 65s absence (> 60s timeout) -> triggers finish!
    now = leaveTime + 65000;
    s = sm.onFrame({ personPresent: false }, now);

    expect(reportCaptured).not.toBeNull();
    // Duration should exclude the trailing 65s absence!
    // Active start: 100550, last seen: 200550 -> duration = 100 seconds
    expect(reportCaptured!.durationSeconds).toBe(100);
    expect(reportCaptured!.isZeroReminderMaster).toBe(false); // < 10 mins (600s)
  });

  it('rewards zero-reminder gold master when duration >= 600s and reminders === 0', () => {
    let now = 0;
    const sm = new SessionMachine({ clock: () => now, leaveTimeoutMs: 60000 });
    sm.onFrame({ personPresent: true }, now); // ALIGNING
    now += 550;
    sm.onFrame({ personPresent: true, posture: mockGoodPosture }, now); // ACTIVE_STUDY

    let report: SessionReport | null = null;
    sm.onFinished((r) => {
      report = r;
    });

    // Study for 610 seconds (10 mins 10 secs) with 0 reminders
    now += 610000;
    sm.onFrame({ personPresent: true, posture: mockGoodPosture }, now);

    // Leave desk
    now += 65000;
    sm.onFrame({ personPresent: false }, now);

    expect(report).not.toBeNull();
    expect(report!.durationSeconds).toBe(610);
    expect(report!.reminderCount).toBe(0);
    expect(report!.isZeroReminderMaster).toBe(true);
  });

  it('excludes hand interference frames from upright percentage calculation', () => {
    let now = 0;
    const sm = new SessionMachine({ clock: () => now, leaveTimeoutMs: 60000 });
    sm.onFrame({ personPresent: true }, now);
    now += 550;
    sm.onFrame({ personPresent: true, posture: mockGoodPosture }, now);

    let report: SessionReport | null = null;
    sm.onFinished((r) => {
      report = r;
    });

    // 10 good frames
    for (let i = 0; i < 10; i++) {
      now += 1000;
      sm.onFrame({ personPresent: true, posture: mockGoodPosture }, now);
    }

    // 5 hand interference frames (chin rest) - must NOT reduce upright percentage!
    for (let i = 0; i < 5; i++) {
      now += 1000;
      sm.onFrame({ personPresent: true, posture: mockInterferencePosture }, now);
    }

    // Finish
    now += 65000;
    sm.onFrame({ personPresent: false }, now);

    expect(report).not.toBeNull();
    expect(report!.uprightPercentage).toBe(100);
  });
});
