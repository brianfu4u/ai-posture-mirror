// miniprogram/pages/scoring/scoring.js
Page({
  data: {
    totalScore: 100,
    q1Score: 5,
    q2Score: 5,
  },

  onLoad() {
    this.recalcTotal();
  },

  selectScore(e) {
    const q = e.currentTarget.dataset.q;
    const val = parseInt(e.currentTarget.dataset.val, 10);

    if (q === 'q1') {
      this.setData({ q1Score: val }, () => this.recalcTotal());
    } else if (q === 'q2') {
      this.setData({ q2Score: val }, () => this.recalcTotal());
    }
  },

  recalcTotal() {
    // 基础分 90 + Q1 + Q2 (满分 100)
    const base = 90;
    const total = base + (this.data.q1Score) + (this.data.q2Score);
    this.setData({ totalScore: Math.min(100, total) });
  },

  showRuleTip(e) {
    const q = e.currentTarget.dataset.q;
    wx.showModal({
      title: q === 'q1' ? '直线路径评分标准' : '曲线路径评分标准',
      content: '5分：平滑居中无触碰边界线；\n4分：整体在框内但略有抖动；\n2分：部分触碰边界线；\n0分：明显画出界外或断线。',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  saveAndGenerateReport() {
    wx.showLoading({ title: '正在生成分析报告…' });
    setTimeout(() => {
      wx.hideLoading();
      wx.navigateTo({
        url: '/pages/report/report',
      });
    }, 500);
  },
});
