import {
  LuxGate,
  computeLuma,
  createBaseline,
  evaluatePosture,
  detectInterference,
  SessionMachine,
  calibrateIrisDepth,
  ProfileManager,
  type BaselineMetrics,
  type Landmark,
  type PostureResult,
  type SessionReport,
  type IrisCalibrationResult,
  type ChildProfile,
} from '@apm/algorithm-core';

import {
  SoundPlayer,
  ReminderCooldownManager,
  type SoundTheme,
} from '@apm/audio-assets';

import {
  BRAND_LINE,
  LOCALES,
  type Locale,
  t,
  MESSAGES,
} from '@apm/i18n';

import {
  saveSession,
  syncPendingSessions,
  getPendingSessions,
  setSetting,
  getSetting,
} from './db.js';

import { SimpleQRCode } from './qrcode.js';
import { HudRenderer } from './hud_renderer.js';

export class WebCoreApp {
  private locale: Locale = 'zh-CN';
  private soundTheme: SoundTheme = 'cartoon';
  private soundPlayer: SoundPlayer;
  private cooldownManager: ReminderCooldownManager;
  private sessionMachine: SessionMachine;
  private profileManager: ProfileManager;
  private luxGate: LuxGate;
  private hudRenderer: HudRenderer | null = null;
  private baseline: BaselineMetrics | null = null;
  private irisCalibration: IrisCalibrationResult | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private syncIntervalId: number | null = null;
  private flowerPollIntervalId: number | null = null;
  private sessionClockIntervalId: number | null = null;
  private elapsedSeconds: number = 0;
  private deviceId: string = 'TK-SH-8821';

  constructor() {
    this.soundPlayer = new SoundPlayer(this.soundTheme);
    this.cooldownManager = new ReminderCooldownManager(45000);
    this.profileManager = new ProfileManager();
    this.luxGate = new LuxGate({ darkThresholdLux: 500, debounceMs: 2000 });
    this.sessionMachine = new SessionMachine({
      leaveTimeoutMs: 60000,
      alignDurationMs: 500,
    });

    this.sessionMachine.onFinished((report) => this.handleSessionFinished(report));
  }

  public async init(containerId: string): Promise<void> {
    const savedLocale = await getSetting<Locale>('locale', this.detectDefaultLocale());
    this.locale = savedLocale;

    const savedTheme = await getSetting<SoundTheme>('sound_theme', 'cartoon');
    this.soundTheme = savedTheme;
    this.soundPlayer.setTheme(this.soundTheme);

    this.renderLayout(containerId);
    this.attachEventListeners();
    await this.setupServiceWorker();
    await this.requestWakeLock();
    this.startBackgroundSync();
  }

  private detectDefaultLocale(): Locale {
    if (typeof navigator === 'undefined') return 'zh-CN';
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk')) return 'zh-TW';
    if (lang.startsWith('zh')) return 'zh-CN';
    if (lang.startsWith('ja')) return 'ja-JP';
    return 'en-US';
  }

  private async setupServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (err) {
        console.warn('SW registration failed:', err);
      }
    }
  }

  private async requestWakeLock(): Promise<void> {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        console.warn('Screen wake lock failed:', err);
      }
    }

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this.isRunning) {
        await this.requestWakeLock();
      }
    });
  }

  private renderLayout(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="relative w-full h-full flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
        <!-- Top Status Bar -->
        <header class="flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur z-20 border-b border-slate-800">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" id="apm-status-dot"></span>
            <span class="text-xs font-semibold tracking-wider text-slate-300 uppercase" id="apm-status-text">STANDBY</span>
            <span class="ml-2 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-900/60 text-indigo-300 border border-indigo-700/50" id="apm-child-profile">👤 宝贝 1 号</span>
          </div>
          <div class="flex items-center gap-2.5">
            <span class="text-xs font-mono text-amber-400 font-medium" id="apm-lux-display">-- Lux</span>
            <button id="apm-btn-qr" class="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700 font-medium flex items-center gap-1 transition">
              <span>📱</span>
              <span>绑定</span>
            </button>
            <select id="apm-lang-select" class="bg-slate-800 text-xs border border-slate-700 rounded px-2 py-1 text-slate-200">
              <option value="zh-CN" ${this.locale === 'zh-CN' ? 'selected' : ''}>简体中文</option>
              <option value="zh-TW" ${this.locale === 'zh-TW' ? 'selected' : ''}>繁體中文</option>
              <option value="en-US" ${this.locale === 'en-US' ? 'selected' : ''}>English</option>
              <option value="ja-JP" ${this.locale === 'ja-JP' ? 'selected' : ''}>日本語</option>
            </select>
          </div>
        </header>

        <!-- Main Mirror & HUD Area -->
        <main class="relative flex-1 w-full h-full overflow-hidden bg-black flex items-center justify-center">
          <!-- Video Element (Mirrored) -->
          <video id="apm-video" playsinline muted autoplay class="absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-25"></video>
          
          <!-- Drawing Overlay Canvas -->
          <canvas id="apm-canvas" class="absolute inset-0 w-full h-full object-cover transform -scale-x-100 z-10"></canvas>

          <!-- 0.5s Glance Iris Calibration Focus Ring -->
          <div id="apm-focus-ring" class="hidden absolute inset-0 z-25 flex flex-col items-center justify-center pointer-events-none transition-all duration-300">
            <div class="w-32 h-32 rounded-full border-2 border-dashed border-emerald-400 animate-spin flex items-center justify-center">
              <div class="w-20 h-20 rounded-full border-2 border-emerald-300 flex items-center justify-center bg-emerald-500/10 text-3xl">👀</div>
            </div>
            <div class="mt-4 px-3 py-1 bg-slate-900/90 border border-emerald-500/60 rounded-full text-xs font-medium text-emerald-300">
              0.5s 黑眼珠与肩宽自适应标定中…
            </div>
          </div>

          <!-- 4000K Warm White Light Ring (Active on TOO_DARK) -->
          <div id="apm-light-ring" class="hidden absolute inset-0 border-8 border-amber-200/60 shadow-[inset_0_0_80px_rgba(254,243,199,0.5)] pointer-events-none z-30 transition-all duration-500">
            <div class="absolute inset-0 bg-amber-50/10 backdrop-brightness-110 flex items-center justify-center">
              <div class="bg-slate-900/90 border border-amber-400/40 px-6 py-4 rounded-2xl text-center max-w-xs shadow-2xl">
                <div class="text-4xl mb-2">💡</div>
                <h3 class="text-base font-bold text-amber-300 mb-1" id="apm-dark-title">光线太暗啦</h3>
                <p class="text-xs text-slate-300" id="apm-dark-desc">${t(this.locale, 'tooDark')}</p>
              </div>
            </div>
          </div>

          <!-- Bottom 10% Desk Mat Optical Calibration Band -->
          <div id="apm-mat-guide" class="absolute bottom-0 left-0 right-0 h-[10%] border-t-2 border-dashed border-emerald-400/80 bg-emerald-500/10 flex items-center justify-center pointer-events-none z-20">
            <span class="text-[11px] font-mono text-emerald-300 tracking-wide bg-slate-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
              ${t(this.locale, 'alignBottomEdge')} (Mat Edge Guideline)
            </span>
          </div>

          <!-- Active Study Battery-Saver Clock HUD -->
          <div id="apm-clock-hud" class="hidden absolute inset-0 z-15 flex flex-col items-center justify-center pointer-events-none">
            <div class="text-6xl font-black font-mono tracking-widest text-slate-100/90 drop-shadow-md" id="apm-study-clock">00:00</div>
            <div class="mt-3 flex items-center gap-4 text-xs font-mono text-slate-400">
              <span id="apm-hud-upright">端正率: 100%</span>
              <span id="apm-hud-reminders">提醒: 0 次</span>
              <span id="apm-hud-distance">距离: 43 cm</span>
            </div>
          </div>

          <!-- Posture Anomaly Cartoon Pop-up Alert -->
          <div id="apm-alert-banner" class="hidden absolute top-8 left-1/2 -translate-x-1/2 z-40 bg-rose-600/95 text-white px-5 py-3 rounded-2xl shadow-2xl border border-rose-400 flex items-center gap-3 animate-bounce">
            <span class="text-2xl" id="apm-alert-icon">🧸</span>
            <div>
              <div class="text-sm font-bold" id="apm-alert-text">请挺起小胸脯~</div>
              <div class="text-[10px] text-rose-200">AI 坐姿伴学魔镜提醒中</div>
            </div>
          </div>

          <!-- Parent Flower Reward Animation -->
          <div id="apm-flower-toast" class="hidden absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
            <div class="bg-gradient-to-br from-rose-500 to-pink-600 text-white p-6 rounded-3xl shadow-2xl text-center transform scale-110 animate-pulse">
              <div class="text-6xl mb-2">🌸</div>
              <h2 class="text-xl font-black">收到家长奖励的一朵小红花！</h2>
              <p class="text-xs text-rose-100 mt-1">今天坐得真端正，继续保持哦~</p>
            </div>
          </div>

          <!-- QR Pairing Modal -->
          <div id="apm-qr-modal" class="hidden absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div class="bg-slate-900 border border-slate-700 rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl relative">
              <button id="apm-btn-close-qr" class="absolute top-4 right-4 text-slate-400 hover:text-white text-lg">✕</button>
              <h3 class="font-bold text-sm text-slate-100 mb-1">家长微信/LINE 扫码绑定</h3>
              <p class="text-[11px] text-slate-400 mb-3">绑定后孩子作业结束微信自动推送简报</p>
              <div id="apm-qr-container" class="flex justify-center my-3 bg-white p-3 rounded-2xl"></div>
              <p class="text-[10px] font-mono text-emerald-400 mt-2">设备号: #${this.deviceId}</p>
            </div>
          </div>
        </main>

        <!-- Brand Footer -->
        <footer class="px-4 py-2 bg-slate-900 border-t border-slate-800 text-center z-20">
          <p class="text-[10px] font-mono tracking-wider text-slate-400 uppercase">
            ${BRAND_LINE}
          </p>
        </footer>
      </div>
    `;

    this.videoEl = document.getElementById('apm-video') as HTMLVideoElement;
    this.canvasEl = document.getElementById('apm-canvas') as HTMLCanvasElement;
    if (this.canvasEl) {
      this.ctx = this.canvasEl.getContext('2d');
      this.hudRenderer = new HudRenderer(this.canvasEl);
    }
  }

  private attachEventListeners(): void {
    const langSelect = document.getElementById('apm-lang-select') as HTMLSelectElement;
    if (langSelect) {
      langSelect.addEventListener('change', async (e) => {
        const val = (e.target as HTMLSelectElement).value as Locale;
        this.locale = val;
        await setSetting('locale', val);
        this.updateUiStrings();
      });
    }

    // QR pairing button & modal handlers
    const btnQr = document.getElementById('apm-btn-qr');
    const qrModal = document.getElementById('apm-qr-modal');
    const btnCloseQr = document.getElementById('apm-btn-close-qr');
    const qrContainer = document.getElementById('apm-qr-container');

    if (btnQr && qrModal && qrContainer) {
      btnQr.addEventListener('click', () => {
        const pairingUrl = `https://posture-mirror.web.app/bind?code=APM-8821&dev=${this.deviceId}`;
        const qr = new SimpleQRCode(pairingUrl);
        qrContainer.innerHTML = qr.toSVG({ size: 160 });
        qrModal.classList.remove('hidden');
      });
    }

    if (btnCloseQr && qrModal) {
      btnCloseQr.addEventListener('click', () => {
        qrModal.classList.add('hidden');
      });
    }

    // iOS Audio Unlock on first touch/click
    window.addEventListener(
      'click',
      () => {
        this.soundPlayer.unlock();
      },
      { once: true }
    );
  }

  private updateUiStrings(): void {
    const darkDesc = document.getElementById('apm-dark-desc');
    if (darkDesc) darkDesc.textContent = t(this.locale, 'tooDark');

    const matGuide = document.querySelector('#apm-mat-guide span');
    if (matGuide) matGuide.textContent = `${t(this.locale, 'alignBottomEdge')} (Mat Edge Guideline)`;
  }

  /**
   * Starts camera processing loop.
   */
  public async startCamera(): Promise<void> {
    if (!this.videoEl) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      this.videoEl.srcObject = stream;
      await this.videoEl.play();
      this.isRunning = true;
      this.soundPlayer.playSystemSound('FOCUS');
      this.startClockTimer();
      this.loop();
    } catch (err) {
      console.warn('Camera access error, fallback to simulation mode:', err);
      this.isRunning = true;
      this.startClockTimer();
      this.loop();
    }
  }

  private startClockTimer(): void {
    if (this.sessionClockIntervalId) clearInterval(this.sessionClockIntervalId);
    this.sessionClockIntervalId = window.setInterval(() => {
      if (this.sessionMachine.state === 'ACTIVE_STUDY') {
        this.elapsedSeconds++;
        const mins = Math.floor(this.elapsedSeconds / 60)
          .toString()
          .padStart(2, '0');
        const secs = (this.elapsedSeconds % 60).toString().padStart(2, '0');
        const clockEl = document.getElementById('apm-study-clock');
        if (clockEl) clockEl.textContent = `${mins}:${secs}`;
      }
    }, 1000);
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    const now = Date.now();
    this.processFrame(now);

    const fps = this.sessionMachine.targetFps;
    const intervalMs = Math.round(1000 / fps);
    setTimeout(() => {
      this.animFrameId = requestAnimationFrame(this.loop);
    }, intervalMs);
  };

  private processFrame(now: number): void {
    if (!this.videoEl || !this.canvasEl || !this.ctx) return;

    if (this.videoEl.readyState >= 2) {
      const w = 160;
      const h = 120;
      this.canvasEl.width = w;
      this.canvasEl.height = h;
      this.ctx.drawImage(this.videoEl, 0, 0, w, h);
      const imgData = this.ctx.getImageData(0, 0, w, h);
      const luma = computeLuma(imgData.data, w, h);
      const lux = this.luxGate.push(luma, now);

      this.updateLuxUi(lux.estimatedLux, lux.status);

      const personPresent = true;
      const prevState = this.sessionMachine.state;
      const state = this.sessionMachine.onFrame({ personPresent, lux }, now);

      // Handle focus ring on ALIGNING transition
      if (state === 'ALIGNING' && prevState !== 'ALIGNING') {
        this.soundPlayer.playSystemSound('FOCUS');
        const focusRing = document.getElementById('apm-focus-ring');
        if (focusRing) focusRing.classList.remove('hidden');

        // Calibrate 0.5s iris & assign multi-child profile
        this.calibrateAndAssignProfile(now);
      } else if (state !== 'ALIGNING') {
        const focusRing = document.getElementById('apm-focus-ring');
        if (focusRing) focusRing.classList.add('hidden');
      }

      // Render HUD skeleton overlay & particles
      if (this.hudRenderer) {
        this.hudRenderer.render();
      }

      this.updateStateUi(state);
    }
  }

  private calibrateAndAssignProfile(now: number): void {
    const camera = { width: 640, height: 480, horizontalFovDeg: 65 };
    const leftIris = [{ x: 0.46, y: 0.28 }, { x: 0.485, y: 0.28 }];
    const rightIris = [{ x: 0.54, y: 0.28 }, { x: 0.565, y: 0.28 }];
    const leftShoulder = { x: 0.32, y: 0.60 };
    const rightShoulder = { x: 0.68, y: 0.60 };
    const noseTip = { x: 0.50, y: 0.35 };

    const cal = calibrateIrisDepth(leftIris, rightIris, leftShoulder, rightShoulder, noseTip, camera, now);
    this.irisCalibration = cal;

    const match = this.profileManager.resolveProfile(cal.baselineShoulderWidthMm, cal.baselineNoseShoulderHeightMm, now);
    const profileEl = document.getElementById('apm-child-profile');
    if (profileEl) {
      profileEl.textContent = `👤 ${match.profile.name}`;
    }

    const distEl = document.getElementById('apm-hud-distance');
    if (distEl) {
      distEl.textContent = `距离: ${cal.distanceCm} cm`;
    }
  }

  private updateLuxUi(luxVal: number, status: string): void {
    const luxEl = document.getElementById('apm-lux-display');
    if (luxEl) {
      luxEl.textContent = `${luxVal} Lux`;
    }

    const lightRing = document.getElementById('apm-light-ring');
    if (lightRing) {
      if (status === 'TOO_DARK') {
        lightRing.classList.remove('hidden');
      } else {
        lightRing.classList.add('hidden');
      }
    }
  }

  private updateStateUi(state: string): void {
    const statusText = document.getElementById('apm-status-text');
    const statusDot = document.getElementById('apm-status-dot');
    const clockHud = document.getElementById('apm-clock-hud');

    if (statusText) statusText.textContent = state;
    if (statusDot) {
      if (state === 'ACTIVE_STUDY') {
        statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
        if (clockHud) clockHud.classList.remove('hidden');
      } else if (state === 'ALIGNING') {
        statusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping';
        if (clockHud) clockHud.classList.add('hidden');
      } else {
        statusDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
        if (clockHud) clockHud.classList.add('hidden');
      }
    }
  }

  private triggerAlert(issue: string): void {
    const now = Date.now();
    if (!this.cooldownManager.canPlay(now)) return;

    this.cooldownManager.onPlayStarted(1200, now);
    this.sessionMachine.onReminderPlayed();
    this.soundPlayer.playReminder(issue as any);

    const alertBanner = document.getElementById('apm-alert-banner');
    if (alertBanner) {
      alertBanner.classList.remove('hidden');
      setTimeout(() => alertBanner.classList.add('hidden'), 1500);
    }
  }

  private async handleSessionFinished(report: SessionReport): Promise<void> {
    this.soundPlayer.playGoldMasterCelebration();
    if (this.hudRenderer) {
      this.hudRenderer.spawnGoldCelebration(40);
    }
    this.elapsedSeconds = 0;
    await saveSession(report);
    await syncPendingSessions('/api/v1/sessions', 'default-device-token');
  }

  private startBackgroundSync(): void {
    this.syncIntervalId = window.setInterval(async () => {
      await syncPendingSessions('/api/v1/sessions', 'default-device-token');
    }, 60000);

    this.flowerPollIntervalId = window.setInterval(async () => {
      this.pollRedFlowers();
    }, 30000);
  }

  private async pollRedFlowers(): Promise<void> {
    try {
      const res = await fetch(`/api/v1/flowers/poll?deviceId=${this.deviceId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasNewFlower) {
          this.soundPlayer.playReward('COIN');
          if (this.hudRenderer) {
            this.hudRenderer.spawnFlowerShower(30);
          }
          const flowerToast = document.getElementById('apm-flower-toast');
          if (flowerToast) {
            flowerToast.classList.remove('hidden');
            setTimeout(() => flowerToast.classList.add('hidden'), 3500);
          }
        }
      }
    } catch {
      // Offline fallback
    }
  }
}

// Auto mount if container exists in DOM
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('app');
    if (root) {
      const app = new WebCoreApp();
      app.init('app').then(() => app.startCamera());
    }
  });
}
