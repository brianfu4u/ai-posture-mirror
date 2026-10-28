import { describe, expect, it } from 'vitest';
import { SoundPlayer, type AudioContextLike, type AudioSourceLike } from '../src/sound_player.js';
import { ALL_SOUND_FILES, THEMES } from '../src/manifest.js';

class FakeCtx implements AudioContextLike {
  state = 'suspended';
  destination = {};
  started: AudioSourceLike[] = [];
  resumed = 0;
  async resume() {
    this.resumed++;
    this.state = 'running';
  }
  async decodeAudioData() {
    return { duration: 0.5 };
  }
  createBuffer() {
    return { duration: 0 };
  }
  createBufferSource(): AudioSourceLike {
    const s: AudioSourceLike = {
      buffer: null,
      onended: null,
      connect() {},
      start: () => {
        this.started.push(s);
      },
    };
    return s;
  }
}

function setup(online = true) {
  const ctx = new FakeCtx();
  let now = 0;
  const player = new SoundPlayer({
    createContext: () => ctx,
    clock: () => now,
    random: () => 0,
    fetchImpl: async () => {
      if (!online) throw new TypeError('offline');
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  return { ctx, player, tick: (ms: number) => (now += ms) };
}

describe('SoundPlayer', () => {
  it('does not play before the user gesture unlock', async () => {
    const { player } = setup();
    await player.preload();
    expect(player.unlocked).toBe(false);
    expect(player.playReminder()).toBe(false);
    expect(player.cooldown.isLocked).toBe(false); // failed start charged nothing
  });

  it('unlock() resumes the context (iOS-style) and plays a silent buffer', async () => {
    const { player, ctx } = setup();
    await player.unlock();
    expect(player.unlocked).toBe(true);
    expect(ctx.resumed).toBe(1);
    expect(ctx.started).toHaveLength(1);
  });

  it('preloads every manifest file; failures are reported, not thrown', async () => {
    const ok = setup();
    const r = await ok.player.preload();
    expect(r.loaded.sort()).toEqual([...ALL_SOUND_FILES].sort());
    const bad = await setup(false).player.preload();
    expect(bad.failed).toHaveLength(ALL_SOUND_FILES.length);
  });

  it('reminder -> 45 s silence after it ends -> allowed again', async () => {
    const { player, ctx, tick } = setup();
    await player.preload();
    await player.unlock();
    const base = ctx.started.length;
    expect(player.playReminder()).toBe(true);
    expect(player.playReminder()).toBe(false); // still sounding
    tick(500);
    ctx.started[base]!.onended!();
    tick(30_000);
    expect(player.playReminder()).toBe(false); // persistent bad posture, still silent
    tick(15_000);
    expect(player.playReminder()).toBe(true);
  });

  it('system sounds ignore the cooldown', async () => {
    const { player, ctx } = setup();
    await player.preload();
    await player.unlock();
    player.playReminder();
    const n = ctx.started.length;
    expect(player.playSystem('device_locked')).toBe(true);
    expect(player.playSystem('camera_focus')).toBe(true);
    expect(ctx.started.length).toBe(n + 2);
  });

  it('never repeats the same reminder sound twice in a row', async () => {
    const { player, ctx, tick } = setup();
    await player.preload();
    await player.unlock();
    const ids: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      const before = ctx.started.length;
      expect(player.playReminder()).toBe(true);
      ids.push(ctx.started[before]!.buffer);
      ctx.started[before]!.onended!();
      tick(45_000);
    }
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    expect(THEMES.cartoon.length).toBeGreaterThan(1);
  });
});
