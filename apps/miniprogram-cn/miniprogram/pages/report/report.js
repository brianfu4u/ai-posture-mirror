// pages/report/report.js
Page({
  data: {
    sessionId: '',
    report: {
      sessionId: '',
      durationMinutes: 45,
      uprightPercentage: 96,
      reminderCount: 0,
      isZeroReminderMaster: true,
      luxQualified: true,
      dateFormatted: '2026-10-28 18:30',
    },
    flowerSent: false,
  },

  onLoad(options) {
    if (options.sessionId) {
      this.setData({ sessionId: options.sessionId });
      this.loadReport(options.sessionId);
    }
  },

  async loadReport(sessionId) {
    if (!wx.cloud) return;
    try {
      const db = wx.cloud.database();
      const res = await db.collection('session_reports').where({ 'report.sessionId': sessionId }).get();
      if (res.data && res.data.length > 0) {
        const doc = res.data[0];
        const r = doc.report;
        this.setData({
          report: {
            sessionId: r.sessionId,
            durationMinutes: Math.round(r.durationSeconds / 60),
            uprightPercentage: r.uprightPercentage,
            reminderCount: r.reminderCount,
            isZeroReminderMaster: r.isZeroReminderMaster,
            luxQualified: r.luxQualified,
            dateFormatted: new Date(doc.createdAt).toLocaleString(),
          },
        });
      }
    } catch (e) {
      console.warn('Failed to fetch session detail:', e);
    }
  },

  handleSendFlower() {
    if (this.data.flowerSent) return;

    wx.showLoading({ title: '送出中…' });
    wx.cloud
      .callFunction({
        name: 'sendFlower',
        data: { sessionId: this.data.sessionId },
      })
      .then((res) => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.vibrateShort({ type: 'medium' });
          this.setData({ flowerSent: true });
          wx.showToast({
            title: '小红花已送达书桌！',
            icon: 'success',
          });
        } else {
          wx.showToast({ title: '发送失败', icon: 'none' });
        }
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
      });
  },

  handleSubscribe() {
    // WeChat One-Time Subscription Message template ID
    const TEMPLATE_ID = 'tmpl_posture_session_finish';
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success(res) {
        if (res[TEMPLATE_ID] === 'accept') {
          wx.showToast({ title: '订阅成功', icon: 'success' });
        } else {
          wx.showToast({ title: '已取消订阅', icon: 'none' });
        }
      },
      fail() {
        wx.showToast({ title: '订阅调用失败', icon: 'none' });
      },
    });
  },
});
