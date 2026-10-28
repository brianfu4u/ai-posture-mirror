import { describe, expect, it } from 'vitest';
import { SessionMachine, formatSessionId, type FrameInput } from '../src/session_state.js';
import type { LuxReading, PostureResult, SessionReport } from '../src/types.js';

const T0 = new Date(2026, 9, 28, 5, 55, 1).getTime(); // local 2026-10-28 05:55:01

const posture = (over: Partial<PostureResult> = {}): PostureResult => ({
  ratio: 0.6, shoulderWidth: 0.3, eyeAngleDeg: 0, shoulderAngleDeg: 0,
  issues: [], isInterference: false, isUpright: true, ...over,
});
const bad = (): PostureResult => posture({ issues: ['HEAD_DOWN'], isUpright: false });
const hands = (): PostureResult => posture({ isInterference: true });
const lux = (status: LuxReading['status']): LuxReading => ({ luma: 100, estimatedLux: 800, status, timestampMs: 0 });

const here = (p: PostureResult | undefined = posture(), l?: LuxReading): FrameInput => ({ personPresent: true, posture: p, lux: l });
const gone: FrameInput = { personPresent: false };

function harness() {
  const m = new SessionMachine();
  const reports: SessionReport[] = [];
  m.onFinished((r) => reports.push(r));
  let t = T0;
  /** feed `seconds` of frames at `fps` and return the last state */
  const feed = (input: FrameInput, seconds: number, fps = 10) => {
    const n = Math.round(seconds * fps);
    let s = m.state;
    for (let i = 0; i < n; i++) {
      s = m.onFrame(input, t);
      t += 1000 / fps;
    }
    return s;
  };
  return { m, reports, feed, now: () => t };
}

describe('state flow', () => {
  it('STANDBY -> ALIGNING -> ACTIVE_STUDY with FPS targets', () => {
    const { m, feed } = harness();
    expect(m.state).toBe('STANDBY');
    expect(m.targetFps).toBe(1);
    m.onFrame(here(), T0);
    expect(m.state).toBe('ALIGNING');
    expect(m.targetFps).toBe(10);
    m.onFrame(here(), T0 + 499);
    expect(m.state).toBe('ALIGNING');
    m.onFrame(here(), T0 + 500);
    expect(m.state).toBe('ACTIVE_STUDY');
    expect(feed(gone, 0)).toBe('ACTIVE_STUDY');
  });

  it('person leaving during ALIGNING cancels without a session', () => {
    const { m, reports } = harness();
    m.onFrame(here(), T0);
    m.onFrame(gone, T0 + 200);
    expect(m.state).toBe('STANDBY');
    expect(reports).toHaveLength(0);
  });

  it('emits transition events', () => {
    const { m } = harness();
    const ev: string[] = [];
    m.onTransition((e) => ev.push(`${e.from}>${e.to}`));
    m.onFrame(here(), T0);
    m.onFrame(here(), T0 + 600);
    expect(ev).toEqual(['STANDBY>ALIGNING', 'ALIGNING>ACTIVE_STUDY']);
  });

  it('out of order timestamps never move time backwards', () => {
    const { m } = harness();
    m.onFrame(here(), T0 + 1000);
    m.onFrame(here(), T0); // clamped
    expect(m.state).toBe('ALIGNING');
  });
});

describe('leave timeout (60 s)', () => {
  it('out of frame 10 s then back: no finish, duration is continuous', () => {
    const { m, reports, feed } = harness();
    feed(here(), 30); // 0.5 s aligning + 29.5 s active
    expect(feed(gone, 10)).toBe('ACTIVE_STUDY');
    expect(m.isAbsent).toBe(true);
    expect(feed(here(), 20)).toBe('ACTIVE_STUDY');
    expect(m.isAbsent).toBe(false);
    feed(gone, 61);
    expect(reports).toHaveLength(1);
    // active from t=0.5 s until last seen frame at 59.9 s
    expect(reports[0]!.durationSeconds).toBe(59);
  });

  it('out of frame 65 s: finishes at 60 s, trailing 60 s NOT counted', () => {
    const { m, reports, feed } = harness();
    feed(here(), 100); // active 0.5 s .. 99.9 s
    const trail: string[] = [];
    m.onTransition((e) => trail.push(`${e.from}>${e.to}@${Math.round((e.atMs - T0) / 100) / 10}`));
    expect(feed(gone, 59.9)).toBe('ACTIVE_STUDY');
    expect(reports).toHaveLength(0);
    feed(gone, 5.1); // finishes on the frame at 60.0 s of absence; the next frame returns to STANDBY
    expect(reports).toHaveLength(1);
    expect(trail[0]).toMatch(/^ACTIVE_STUDY>SESSION_FINISHED/);
    expect(trail[1]).toMatch(/^SESSION_FINISHED>STANDBY/);
    const r = reports[0]!;
    expect(r.durationSeconds).toBe(99); // 99.4 s of study, not 159 s
    expect(r.sessionId).toBe('20261028_055501');
  });

  it('exactly 60 s of absence finishes; 59.9 s does not', () => {
    const { m, reports } = harness();
    m.onFrame(here(), T0);
    m.onFrame(here(), T0 + 500);
    m.onFrame(here(), T0 + 10_000);
    m.onFrame(gone, T0 + 10_100);
    m.onFrame(gone, T0 + 10_100 + 59_999);
    expect(m.state).toBe('ACTIVE_STUDY');
    m.onFrame(gone, T0 + 10_100 + 60_000);
    expect(m.state).toBe('SESSION_FINISHED');
    expect(reports[0]!.durationSeconds).toBe(9); // 0.5 s align, last seen at 10.0 s => 9.5 s
  });

  it('after finishing, the next frame returns to STANDBY, and a sitting person starts a fresh session', () => {
    const { m, reports, feed, now } = harness();
    feed(here(), 5);
    feed(gone, 60.1);
    expect(reports).toHaveLength(1);
    expect(m.state).toBe('SESSION_FINISHED'); // visible for exactly one frame
    m.onFrame(gone, now());
    expect(m.state).toBe('STANDBY');
    m.onFrame(here(), now() + 1000);
    expect(m.state).toBe('ALIGNING');
    expect(m.reminderCount).toBe(0);
    expect(reports).toHaveLength(1);
  });

  it('SessionReport has exactly the contracted JSON shape', () => {
    const { reports, feed } = harness();
    feed(here(), 3);
    feed(gone, 61);
    expect(Object.keys(reports[0]!).sort()).toEqual(
      ['durationSeconds', 'isZeroReminderMaster', 'luxQualified', 'reminderCount', 'sessionId', 'uprightPercentage'],
    );
    expect(reports[0]!.sessionId).toMatch(/^\d{8}_\d{6}$/);
  });
});

describe('uprightPercentage', () => {
  it('upright / valid frames', () => {
    const { reports, feed } = harness();
    feed(here(), 0.5); // align
    feed(here(posture()), 3); // 30 upright (first active frame included)
    feed(here(bad()), 1); // 10 bad
    feed(gone, 61);
    expect(reports[0]!.uprightPercentage).toBe(75);
  });

  it('hand-interference frames are excluded from the denominator (and numerator)', () => {
    const { reports, feed } = harness();
    feed(here(), 0.5);
    feed(here(posture()), 3); // 30 good
    feed(here(hands()), 50); // 500 interference frames: must not dilute anything
    feed(here(bad()), 1); // 10 bad
    feed(gone, 61);
    expect(reports[0]!.uprightPercentage).toBe(75);
  });

  it('frames without posture are ignored; no valid frames at all reports 100', () => {
    const { reports, feed } = harness();
    feed(here(undefined), 5);
    feed(gone, 61);
    expect(reports[0]!.uprightPercentage).toBe(100);
  });
});

describe('reminders and zero-reminder gold badge', () => {
  it('10 min study with 0 reminders -> master', () => {
    const { reports, feed } = harness();
    feed(here(), 10 * 60 + 1);
    feed(gone, 61);
    expect(reports[0]!.isZeroReminderMaster).toBe(true);
    expect(reports[0]!.reminderCount).toBe(0);
    expect(reports[0]!.durationSeconds).toBeGreaterThanOrEqual(600);
  });

  it('9 min 59 s with 0 reminders -> no badge (needs full 10 min)', () => {
    const { reports, feed } = harness();
    feed(here(), 0.5 + 599);
    feed(gone, 61);
    expect(reports[0]!.durationSeconds).toBeLessThan(600);
    expect(reports[0]!.isZeroReminderMaster).toBe(false);
  });

  it('exactly 10 min of study -> badge', () => {
    const { m, reports } = harness();
    m.onFrame(here(), T0);
    m.onFrame(here(), T0 + 500);
    m.onFrame(here(), T0 + 500 + 600_000);
    m.onFrame(gone, T0 + 500 + 600_100);
    m.onFrame(gone, T0 + 500 + 600_100 + 60_000);
    expect(reports[0]!.isZeroReminderMaster).toBe(true);
  });

  it('one reminder -> count 1 and no badge even after a long study', () => {
    const { m, reports, feed } = harness();
    feed(here(), 15 * 60);
    m.onReminderPlayed();
    feed(here(), 5);
    feed(gone, 61);
    expect(reports[0]!.reminderCount).toBe(1);
    expect(reports[0]!.isZeroReminderMaster).toBe(false);
  });

  it('onReminderPlayed outside ACTIVE_STUDY is ignored', () => {
    const { m, reports, feed } = harness();
    m.onReminderPlayed(); // STANDBY
    feed(here(), 2);
    feed(gone, 61);
    expect(reports[0]!.reminderCount).toBe(0);
  });

  it('reminder count resets for the next session', () => {
    const { m, reports, feed, now } = harness();
    feed(here(), 3);
    m.onReminderPlayed();
    feed(gone, 61);
    expect(m.state).toBe('STANDBY');
    feed(here(), 3);
    feed(gone, 61);
    expect(reports.map((r) => r.reminderCount)).toEqual([1, 0]);
  });
});

describe('abnormal timer (hand-interference suspends it)', () => {
  it('accumulates while bad, pauses on interference, resets when upright or after a reminder', () => {
    const { m, feed } = harness();
    feed(here(), 0.5);
    feed(here(bad()), 2);
    expect(m.abnormalForMs).toBeGreaterThanOrEqual(1800);
    const before = m.abnormalForMs;
    feed(here(hands()), 5); // chin rest: suspended, not reset, not advancing
    expect(m.abnormalForMs).toBe(before);
    feed(here(bad()), 1);
    expect(m.abnormalForMs).toBeGreaterThan(before);
    m.onReminderPlayed();
    expect(m.abnormalForMs).toBe(0);
    feed(here(bad()), 1);
    feed(here(posture()), 0.2);
    expect(m.abnormalForMs).toBe(0);
  });

  it('leaving the frame resets the timer', () => {
    const { m, feed } = harness();
    feed(here(), 0.5);
    feed(here(bad()), 2);
    feed(gone, 1);
    expect(m.abnormalForMs).toBe(0);
  });
});

describe('lux integration', () => {
  it('TOO_DARK refuses to start a session and flags darkRefused', () => {
    const { m, feed } = harness();
    feed(here(posture(), lux('TOO_DARK')), 3);
    expect(m.state).toBe('STANDBY');
    expect(m.darkRefused).toBe(true);
    feed(here(posture(), lux('LUX_QUALIFIED')), 1);
    expect(m.state).toBe('ACTIVE_STUDY');
    expect(m.darkRefused).toBe(false);
  });

  it('UNKNOWN lux (first seconds) does not block starting', () => {
    const { m, feed } = harness();
    feed(here(posture(), lux('UNKNOWN')), 1);
    expect(m.state).toBe('ACTIVE_STUDY');
  });

  it('luxQualified=true when the desk stays bright', () => {
    const { reports, feed } = harness();
    feed(here(posture(), lux('LUX_QUALIFIED')), 5);
    feed(gone, 61);
    expect(reports[0]!.luxQualified).toBe(true);
  });

  it('darkness during a session keeps it running but flags luxQualified=false and skips posture judging', () => {
    const { m, reports, feed } = harness();
    feed(here(posture(), lux('LUX_QUALIFIED')), 3);
    feed(here(bad(), lux('TOO_DARK')), 5); // bad posture frames under TOO_DARK are ignored
    expect(m.state).toBe('ACTIVE_STUDY');
    expect(m.abnormalForMs).toBe(0);
    feed(gone, 61);
    expect(reports[0]!.luxQualified).toBe(false);
    expect(reports[0]!.uprightPercentage).toBe(100);
  });

  it('refuseWhenDark=false lets the session start in the dark', () => {
    const m = new SessionMachine({ refuseWhenDark: false });
    m.onFrame(here(posture(), lux('TOO_DARK')), T0);
    expect(m.state).toBe('ALIGNING');
  });
});

describe('misc', () => {
  it('formatSessionId pads fields', () => {
    expect(formatSessionId(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('20260102_030405');
  });
  it('onFinished unsubscribe works and reset() emits nothing', () => {
    const m = new SessionMachine();
    let n = 0;
    const off = m.onFinished(() => n++);
    off();
    m.onFrame(here(), T0);
    m.onFrame(here(), T0 + 500);
    m.reset();
    expect(m.state).toBe('STANDBY');
    expect(n).toBe(0);
  });
});
