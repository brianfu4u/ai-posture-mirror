// miniprogram/pages/report/report.js
Page({
  data: {
    activeChildId: 'child_1',
    todayDateFormatted: '今日写作业 · 10月28日',
    todayFocusMinutes: 45,
    todayUprightRate: 96,
    todayReminders: 2,
    isZeroReminderMaster: true,
    flowerSent: false,
    sessions: [
      {
        sessionId: 'session_20261028_1830',
        childId: 'child_1',
        timeFormatted: '18:30 - 19:15',
        durationMinutes: 45,
        uprightPercentage: 96,
        reminderCount: 2,
        isZeroReminderMaster: false,
      },
      {
        sessionId: 'session_20261028_1600',
        childId: 'child_1',
        timeFormatted: '16:00 - 16:25',
        durationMinutes: 25,
        uprightPercentage: 98,
        reminderCount: 0,
        isZeroReminderMaster: true,
      },
    ],
  },

  onLoad() {
    const cachedChild = wx.getStorageSync('apm_active_child') || 'child_1';
    this.switchChildInternal(cachedChild);
    this.loadCachedSessions();
  },

  onShow() {
    this.loadCachedSessions();
  },

  loadCachedSessions() {
    const cached = wx.getStorageSync('apm_cached_sessions') || [];
    if (cached.length > 0) {
      const currentList = this.data.sessions || [];
      const newItems = cached.filter((c) => !currentList.some((s) => s.sessionId === c.sessionId));
      if (newItems.length > 0) {
        const merged = [...newItems, ...currentList];
        let totalMins = 0;
        let totalRem = 0;
        let uprightW = 0;

        merged.forEach((item) => {
          totalMins += item.durationMinutes;
          totalRem += item.reminderCount;
          uprightW += item.uprightPercentage * item.durationMinutes;
        });

        const avgUpright = totalMins > 0 ? Math.round(uprightW / totalMins) : 100;

        this.setData({
          sessions: merged,
          todayFocusMinutes: totalMins,
          todayReminders: totalRem,
          todayUprightRate: avgUpright,
        });
      }
    }
  },

  switchChild(e) {
    const childId = e.currentTarget.dataset.id;
    this.switchChildInternal(childId);
  },

  switchChildInternal(childId) {
    this.setData({ activeChildId: childId });
    wx.setStorageSync('apm_active_child', childId);

    if (childId === 'child_2') {
      this.setData({
        todayFocusMinutes: 30,
        todayUprightRate: 94,
        todayReminders: 3,
        isZeroReminderMaster: false,
        sessions: [
          {
            sessionId: 'session_child2_01',
            childId: 'child_2',
            timeFormatted: '15:10 - 15:40',
            durationMinutes: 30,
            uprightPercentage: 94,
            reminderCount: 3,
            isZeroReminderMaster: false,
          },
        ],
      });
    } else {
      this.setData({
        todayFocusMinutes: 45,
        todayUprightRate: 96,
        todayReminders: 2,
        isZeroReminderMaster: true,
        sessions: [
          {
            sessionId: 'session_20261028_1830',
            childId: 'child_1',
            timeFormatted: '18:30 - 19:15',
            durationMinutes: 45,
            uprightPercentage: 96,
            reminderCount: 2,
            isZeroReminderMaster: false,
          },
          {
            sessionId: 'session_20261028_1600',
            childId: 'child_1',
            timeFormatted: '16:00 - 16:25',
            durationMinutes: 25,
            uprightPercentage: 98,
            reminderCount: 0,
            isZeroReminderMaster: true,
          },
        ],
      });
    }
    this.loadCachedSessions();
  },

  handleSendFlower() {
    if (this.data.flowerSent) return;
    this.setData({ flowerSent: true });

    try {
      const audio = wx.createInnerAudioContext();
      audio.src = '/sounds/cartoon_coin.wav';
      audio.play();
      wx.vibrateShort({ type: 'medium' });
    } catch (_) {}

    wx.showToast({
      title: '鼓励已送达书桌屏幕！',
      icon: 'success',
      duration: 1500,
    });
  },

  handleSubscribe() {
    wx.showToast({
      title: '已订阅离座微信服务通知',
      icon: 'success',
    });
  },
});
