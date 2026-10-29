// miniprogram/pages/live/live.js
Page({
  data: {
    hasCamera: true, // 开启真实前置摄像头取景！
    isOffline: true,
    systemMode: 'single', // 'single': 只有一部手机, 'dual': 可以找到闲置手机
    currentStep: 1,
    stage: 'calibrate', // 'calibrate': 姿态标定与对焦 (绿色安全区), 'steps': 配置向导, 'active': 纯黑屏伴学, 'summary': 结算
    calibrating: false,
    countdownSec: 2,
    simulatedDistance: 42,
    autoDemoLoop: true, // 自动声光演示循环开关

    // Companion State
    childName: '大宝',
    timerSeconds: 0,
    timerText: '00:00',
    postureState: 'upright',
    statusDescription: '端正坐姿守护中',
    currentUprightRate: 100,

    // Alert Display
    showAlert: false,
    alertTitle: '请坐端正哦',
    alertSubtitle: '保持脊柱挺拔',

    // Metrics for Session
    reminderCount: 0,
    slouchSeconds: 0,
    isZeroReminder: true,
    sessionMinutes: 15,
  },

  timerInterval: null,
  alertTimeout: null,
  demoLoopInterval: null,
  demoStepIndex: 0,

  onLoad(options) {
    const activeChild = wx.getStorageSync('apm_active_child') || 'child_1';
    const mode = (options && options.mode) || wx.getStorageSync('apm_system_mode') || 'single';

    this.setData({
      hasCamera: true,
      childName: activeChild === 'child_2' ? '二宝' : '大宝',
      systemMode: mode,
      isOffline: options && options.offline === 'true',
    });

    // 保持屏幕常亮防休眠
    try {
      wx.setKeepScreenOn({ keepScreenOn: true });
    } catch (_) {}

    if (options && options.showWizard === 'true') {
      // 进入对应模式的配置向导
      this.setData({
        currentStep: 1,
        stage: 'steps',
      });
    } else {
      // 默认先进入绿色对焦安全区视窗
      this.setData({
        stage: 'calibrate',
      });
    }
  },

  onCameraError(e) {
    console.warn('Real camera error/fallback to virtual:', e);
    this.setData({ hasCamera: false });
  },

  onUnload() {
    this.clearAllTimers();
    try {
      wx.setKeepScreenOn({ keepScreenOn: false });
    } catch (_) {}
  },

  clearAllTimers() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.alertTimeout) {
      clearTimeout(this.alertTimeout);
      this.alertTimeout = null;
    }
    if (this.demoLoopInterval) {
      clearInterval(this.demoLoopInterval);
      this.demoLoopInterval = null;
    }
  },

  // 本地离线音频播放器
  playSound(audioPath) {
    try {
      const audio = wx.createInnerAudioContext();
      audio.src = audioPath;
      audio.play();
      audio.onEnded(() => {
        try { audio.destroy(); } catch (_) {}
      });
      audio.onError((err) => {
        console.log('Play sound error:', err);
        try { audio.destroy(); } catch (_) {}
      });
    } catch (e) {
      console.log('Audio init exception:', e);
    }
  },

  nextStep() {
    const maxSteps = this.data.systemMode === 'single' ? 3 : 5;
    const next = Math.min(maxSteps, this.data.currentStep + 1);
    this.setData({ currentStep: next });
  },

  prevStep() {
    const prev = Math.max(1, this.data.currentStep - 1);
    this.setData({ currentStep: prev });
  },

  scanWorkPhone() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: () => {
        this.playSound('/sounds/camera_focus.wav');
        wx.showToast({ title: '配对成功！', icon: 'success' });
        this.setData({ currentStep: 5 });
      },
      fail: () => {
        this.simulatePairSuccess();
      },
    });
  },

  simulatePairSuccess() {
    this.playSound('/sounds/camera_focus.wav');
    wx.showToast({ title: '双机配对成功！', icon: 'success' });
    this.setData({ currentStep: 5 });
  },

  // 用户点击「点击立即对焦锁定 · 开启伴学」
  startCalibration() {
    // 立即响应手势播放对焦锁定音：滴！滴！
    this.playSound('/sounds/camera_focus.wav');
    try {
      wx.vibrateShort({ type: 'medium' });
    } catch (_) {}

    this.setData({ calibrating: true, countdownSec: 2 });

    const stepCountdown = () => {
      if (this.data.countdownSec > 1) {
        this.setData({ countdownSec: this.data.countdownSec - 1 });
        setTimeout(stepCountdown, 1000);
      } else {
        // 再次发出确认对焦提示音
        this.playSound('/sounds/camera_focus.wav');
        this.setData({
          calibrating: false,
          stage: 'active',
          timerSeconds: 0,
          timerText: '00:00',
          postureState: 'upright',
          statusDescription: '端正坐姿守护中',
        });
        wx.showToast({
          title: '已锁定基准，伴学开始',
          icon: 'none',
          duration: 1200,
        });
        this.startTimer();
        this.startAutoDemoLoop();
      }
    };

    setTimeout(stepCountdown, 1000);
  },

  startTimer() {
    this.clearAllTimers();
    this.timerInterval = setInterval(() => {
      if (this.data.postureState === 'away') {
        return;
      }

      const nextSec = this.data.timerSeconds + 1;
      const mins = Math.floor(nextSec / 60).toString().padStart(2, '0');
      const secs = (nextSec % 60).toString().padStart(2, '0');

      let slouchSec = this.data.slouchSeconds;
      if (this.data.postureState !== 'upright') {
        slouchSec += 1;
      }

      const uprightRate = nextSec > 0
        ? Math.max(70, Math.round(((nextSec - slouchSec) / nextSec) * 100))
        : 100;

      this.setData({
        timerSeconds: nextSec,
        timerText: `${mins}:${secs}`,
        slouchSeconds: slouchSec,
        currentUprightRate: uprightRate,
      });
    }, 1000);
  },

  toggleAutoDemo(e) {
    const val = e.detail.value;
    this.setData({ autoDemoLoop: val });
    if (val) {
      this.startAutoDemoLoop();
      wx.showToast({ title: '已开启自动演示循环', icon: 'none' });
    } else {
      if (this.demoLoopInterval) clearInterval(this.demoLoopInterval);
      this.setData({ postureState: 'upright', statusDescription: '端正坐姿守护中', showAlert: false });
      wx.showToast({ title: '已关闭自动演示，手动测试', icon: 'none' });
    }
  },

  startAutoDemoLoop() {
    if (!this.data.autoDemoLoop) return;
    if (this.demoLoopInterval) clearInterval(this.demoLoopInterval);

    const sequence = ['tilted', 'head_down', 'too_close'];
    this.demoLoopInterval = setInterval(() => {
      if (this.data.stage !== 'active' || !this.data.autoDemoLoop) return;
      const nextType = sequence[this.demoStepIndex % sequence.length];
      this.demoStepIndex++;
      this.triggerPostureInternal(nextType);
    }, 7000);
  },

  triggerPosture(e) {
    const type = e.currentTarget.dataset.type;
    this.triggerPostureInternal(type);
  },

  triggerPostureInternal(type) {
    if (type === 'upright') {
      this.setData({
        postureState: 'upright',
        statusDescription: '端正坐姿守护中',
        showAlert: false,
      });
      return;
    }

    if (type === 'away') {
      this.playSound('/sounds/forest_marimba.wav');
      this.setData({
        postureState: 'away',
        statusDescription: '孩子已离座 · 计时自动挂起',
        showAlert: true,
        alertTitle: '孩子已暂时离开书桌',
        alertSubtitle: '伴学计时已自动挂起，返回时自动恢复',
      });
      return;
    }

    let title = '请坐端正哦';
    let subtitle = '保持背脊挺拔';
    let soundFile = '/sounds/cartoon_boing.wav';

    if (type === 'tilted') {
      // 歪头斜视：播放卡通笑声提醒！
      soundFile = '/sounds/cartoon_laugh.wav';
      title = '头歪了哦，保持双肩平齐';
      subtitle = '脊柱居中不斜视，保护颈椎好体态';
    } else if (type === 'head_down') {
      // 低头趴桌：播放弹簧报警音！
      soundFile = '/sounds/cartoon_boing.wav';
      title = '请抬起头，保持背脊挺直';
      subtitle = '低头已持续超过 2 秒，端正视线更轻松';
    } else if (type === 'too_close') {
      // 距离太近：播放 Oops 预警！
      soundFile = '/sounds/pixel_oops.wav';
      title = '眼睛离桌面太近啦';
      subtitle = '距离小于 30cm，请自然向后靠一拳';
    }

    const newReminderCount = this.data.reminderCount + 1;

    this.setData({
      postureState: type,
      statusDescription: '坐姿异常提醒中...',
      showAlert: true,
      alertTitle: title,
      alertSubtitle: subtitle,
      reminderCount: newReminderCount,
      isZeroReminder: false,
    });

    // 播放声音 + 马达震动
    this.playSound(soundFile);
    try {
      wx.vibrateShort({ type: 'medium' });
    } catch (_) {}

    // 1.8 秒后自动淡回纯黑屏
    if (this.alertTimeout) clearTimeout(this.alertTimeout);
    this.alertTimeout = setTimeout(() => {
      this.setData({
        showAlert: false,
        postureState: 'upright',
        statusDescription: '端正坐姿守护中',
      });
    }, 1800);
  },

  finishSession() {
    this.clearAllTimers();
    this.playSound('/sounds/cartoon_coin.wav');
    const durationMins = Math.max(1, Math.round(this.data.timerSeconds / 60)) || 15;

    this.setData({
      stage: 'summary',
      sessionMinutes: durationMins,
    });
  },

  saveAndGoToReport() {
    const now = new Date();
    const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newSession = {
      sessionId: `session_live_${Date.now()}`,
      childId: wx.getStorageSync('apm_active_child') || 'child_1',
      timeFormatted: `${timeFormatted} (刚完成作业)`,
      durationMinutes: this.data.sessionMinutes,
      uprightPercentage: this.data.currentUprightRate,
      reminderCount: this.data.reminderCount,
      isZeroReminderMaster: this.data.isZeroReminder,
    };

    const existing = wx.getStorageSync('apm_cached_sessions') || [];
    existing.unshift(newSession);
    wx.setStorageSync('apm_cached_sessions', existing);

    wx.redirectTo({
      url: '/pages/report/report',
    });
  },

  saveAndSyncToParent() {
    this.saveAndGoToReport();
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/index/index' });
      },
    });
  },
});
