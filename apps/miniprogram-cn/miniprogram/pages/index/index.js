// pages/index/index.js
Page({
  data: {
    deviceName: '旧手机伴学镜 · 书桌 1 号',
    isOnline: true,
    todayFocusMinutes: 45,
    todayUprightRate: 96,
    todayReminders: 2,
    sessions: [
      {
        sessionId: 'session_20261028_1830',
        timeFormatted: '18:30 - 19:15',
        durationMinutes: 45,
        uprightPercentage: 96,
        reminderCount: 2,
        isZeroReminderMaster: false,
      },
      {
        sessionId: 'session_20261028_1600',
        timeFormatted: '16:00 - 16:25',
        durationMinutes: 25,
        uprightPercentage: 98,
        reminderCount: 0,
        isZeroReminderMaster: true,
      },
    ],
  },

  onLoad() {
    this.fetchDeviceData();
  },

  onPullDownRefresh() {
    this.fetchDeviceData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async fetchDeviceData() {
    if (!wx.cloud) return;
    try {
      const db = wx.cloud.database();
      const res = await db.collection('session_reports').orderBy('createdAt', 'desc').limit(20).get();
      if (res.data && res.data.length > 0) {
        // Update session list and stats
        let totalSecs = 0;
        let totalReminders = 0;
        let uprightWeighted = 0;

        const list = res.data.map((item) => {
          const r = item.report;
          totalSecs += r.durationSeconds;
          totalReminders += r.reminderCount;
          uprightWeighted += r.uprightPercentage * r.durationSeconds;

          return {
            sessionId: r.sessionId,
            timeFormatted: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            durationMinutes: Math.round(r.durationSeconds / 60),
            uprightPercentage: r.uprightPercentage,
            reminderCount: r.reminderCount,
            isZeroReminderMaster: r.isZeroReminderMaster,
          };
        });

        const totalMinutes = Math.round(totalSecs / 60);
        const avgUpright = totalSecs > 0 ? Math.round(uprightWeighted / totalSecs) : 100;

        this.setData({
          sessions: list,
          todayFocusMinutes: totalMinutes,
          todayReminders: totalReminders,
          todayUprightRate: avgUpright,
        });
      }
    } catch (e) {
      console.warn('Load sessions failed:', e);
    }
  },

  handleScanCode() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: (res) => {
        const pairingCode = res.result;
        wx.showLoading({ title: '绑定中…' });
        wx.cloud
          .callFunction({
            name: 'bindDevice',
            data: { pairingCode },
          })
          .then((bindRes) => {
            wx.hideLoading();
            if (bindRes.result && bindRes.result.success) {
              wx.showToast({ title: '绑定成功！', icon: 'success' });
              this.fetchDeviceData();
            } else {
              wx.showToast({ title: bindRes.result?.error || '绑定失败', icon: 'none' });
            }
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '网络异常', icon: 'none' });
          });
      },
    });
  },

  goToReport(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/report/report?sessionId=${id}`,
    });
  },
});
