import { CooldownManager } from './cooldown.js';
import { ALL_SOUND_FILES, SYSTEM_SOUNDS, THEMES, type SoundDef, type SystemSoundId, type ThemeId } from './manifest.js';

/** Minimal Web Audio surface we use; lets tests inject a fake and keeps this package DOM-free. */
export interface AudioSourceLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  connect(dest: unknown): void;
  start(when?: number): void;
}
export interface AudioBufferLike {
  duration: number;
}
export interface AudioContextLike {
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  createBufferSource(): AudioSourceLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
}

export interface SoundPlayerOptions {
  /** URL prefix where the mp3 files are served (cached offline by the service worker). Default '/sounds/' */
  baseUrl?: string;
  theme?: ThemeId;
  createContext?: () => AudioContextLike;
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  clock?: () => number;
  cooldownMs?: number;
  random?: () => number;
}

export class SoundPlayer {
  readonly cooldown: CooldownManager;
  private ctx: AudioContextLike | null = null;
  private readonly buffers = new Map<string, AudioBufferLike>();
  private theme: ThemeId;
  private lastReminderId: string | null = null;
  private readonly o: Required<Omit<SoundPlayerOptions, 'theme' | 'cooldownMs'>>;

  constructor(opts: SoundPlayerOptions = {}) {
    this.theme = opts.theme ?? 'cartoon';
    this.o = {
      baseUrl: opts.baseUrl ?? '/sounds/',
      createContext:
        opts.createContext ??
        (() => {
          const C = (globalThis as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike });
          const Ctor = C.AudioContext ?? C.webkitAudioContext;
          if (!Ctor) throw new Error('Web Audio API is not available');
          return new Ctor();
        }),
      fetchImpl: opts.fetchImpl ?? ((u) => fetch(u)),
      clock: opts.clock ?? (() => Date.now()),
      random: opts.random ?? Math.random,
    };
    this.cooldown = new CooldownManager(this.o.clock, opts.cooldownMs ?? 45_000);
  }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
  }

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /**
   * MUST be called from a user gesture (tap/click). Creates/resumes the AudioContext and plays a
   * 1-sample silent buffer, which unlocks audio on iOS Safari.
   */
  async unlock(): Promise<void> {
    this.ctx ??= this.o.createContext();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.ctx.createBuffer(1, 1, 22050);
    src.connect(this.ctx.destination);
    src.start(0);
  }

  /** Fetch + decode every sound into memory (hits the SW cache when offline). Failed files are reported, not thrown. */
  async preload(files: readonly string[] = ALL_SOUND_FILES): Promise<{ loaded: string[]; failed: string[] }> {
    this.ctx ??= this.o.createContext();
    const ctx = this.ctx;
    const loaded: string[] = [];
    const failed: string[] = [];
    await Promise.all(
      files.map(async (file) => {
        try {
          const res = await this.o.fetchImpl(this.o.baseUrl + file);
          if (!res.ok) throw new Error(String(res.status));
          this.buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
          loaded.push(file);
        } catch {
          failed.push(file);
        }
      }),
    );
    return { loaded, failed };
  }

  /** Posture reminder: picks a random sound from the current theme (never the same twice in a row). Returns false if refused. */
  playReminder(): boolean {
    const pool = THEMES[this.theme];
    const choices = pool.length > 1 ? pool.filter((s) => s.id !== this.lastReminderId) : pool;
    const def = choices[Math.floor(this.o.random() * choices.length)] as SoundDef;
    if (!this.cooldown.tryAcquire()) return false;
    const ok = this.start(def, () => this.cooldown.release());
    if (!ok) {
      this.cooldown.cancel();
      return false;
    }
    this.lastReminderId = def.id;
    return true;
  }

  /** System feedback (lock click, camera focus). Not limited by cooldown. */
  playSystem(id: SystemSoundId): boolean {
    return this.start(SYSTEM_SOUNDS[id]);
  }

  /** Reward sound for the parent's "little red flower"; bypasses cooldown. Uses the theme's last (celebratory) sound. */
  playReward(): boolean {
    const pool = THEMES[this.theme];
    return this.start(pool[pool.length - 1] as SoundDef);
  }

  private start(def: SoundDef, onEnded?: () => void): boolean {
    const ctx = this.ctx;
    const buf = this.buffers.get(def.file);
    if (!ctx || !buf || ctx.state !== 'running') return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (onEnded) src.onended = onEnded;
    src.start(0);
    return true;
  }
}
