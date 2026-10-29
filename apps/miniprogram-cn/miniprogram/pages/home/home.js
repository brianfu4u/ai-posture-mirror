// miniprogram/pages/home/home.js
Page({
  data: {},
  onLoad() {},

  navToPlayer() {
    wx.navigateTo({
      url: '/pages/player/player',
      fail: () => wx.showToast({ title: '测试引导加载中', icon: 'none' }),
    });
  },

  navToScoring() {
    wx.navigateTo({
      url: '/pages/scoring/scoring',
      fail: () => wx.showToast({ title: '在线打分加载中', icon: 'none' }),
    });
  },

  navToReport() {
    wx.navigateTo({
      url: '/pages/report/report',
      fail: () => wx.showToast({ title: '分析报告加载中', icon: 'none' }),
    });
  },

  // 彻底修复之前“使用说明打不开”的 BUG
  navToGuide() {
    wx.navigateTo({
      url: '/pages/guide/guide',
      fail: (err) => {
        console.error('navToGuide error:', err);
        wx.showToast({ title: '无法打开使用指南', icon: 'none' });
      },
    });
  },

  navToMall() {
    wx.navigateTo({
      url: '/pages/mall/mall',
      fail: () => wx.showToast({ title: '官方商城加载中', icon: 'none' }),
    });
  },

  // 彻底修复之前“项目介绍打不开”的 BUG
  navToIntro() {
    wx.navigateTo({
      url: '/pages/intro/intro',
      fail: (err) => {
        console.error('navToIntro error:', err);
        wx.showToast({ title: '无法打开项目介绍', icon: 'none' });
      },
    });
  },

  navToProfile() {
    wx.navigateTo({
      url: '/pages/profile/profile',
      fail: () => wx.showToast({ title: '个人中心加载中', icon: 'none' }),
    });
  },

  navToBooking() {
    wx.showModal({
      title: '预约专家视频解读',
      content: '专家一对一视频分析服务就绪，可随时联系客服助手进行排期预约。',
      showCancel: false,
      confirmText: '我知道了',
    });
  },
});
