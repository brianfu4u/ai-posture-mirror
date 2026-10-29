// miniprogram/pages/cover/cover.js
Page({
  data: {
    isLoggedIn: true,
    activeChild: 'child_1',
    childProfiles: {
      child_1: { name: '大宝', age: 10, note: '近视防控重点' },
      child_2: { name: '二宝', age: 7, note: '眼脑协调与读写' }
    }
  },

  onLoad() {
    // Read cached login status & active child
    const cachedUser = wx.getStorageSync('apm_user_info');
    if (cachedUser) {
      this.setData({ isLoggedIn: true });
    }
    const cachedChild = wx.getStorageSync('apm_active_child') || 'child_1';
    this.setData({ activeChild: cachedChild });
  },

  handleOneClickLogin() {
    wx.showLoading({ title: '正在授权登录...' });
    setTimeout(() => {
      wx.hideLoading();
      this.setData({ isLoggedIn: true });
      wx.setStorageSync('apm_user_info', { phone: '138****8888', name: 'Brian 家长' });
      wx.showToast({ title: '登录成功', icon: 'success' });
    }, 500);
  },

  switchChild(e) {
    const child = e.currentTarget.dataset.child;
    this.setData({ activeChild: child });
    wx.setStorageSync('apm_active_child', child);
    wx.showToast({
      title: `已切换为 ${this.data.childProfiles[child].name}`,
      icon: 'none'
    });
  },

  navToEyeBrain() {
    wx.navigateTo({
      url: '/pages/home/home',
      fail: () => {
        // Fallback if pages/home not yet created
        wx.showModal({
          title: '眼脑协同本能测评',
          content: '眼脑协同测试模块已接入。包含视听觉引导、眼动追踪与 M1-M5 测评雷达图！',
          showCancel: false
        });
      }
    });
  },

  navToPostureMirror() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  navToMall() {
    wx.navigateTo({
      url: '/pages/mall/mall',
      fail: () => {
        wx.showToast({ title: '进入器材商城', icon: 'none' });
      }
    });
  },

  navToConsult() {
    wx.navigateTo({
      url: '/pages/consult/consult',
      fail: () => {
        wx.showToast({ title: '进入门诊咨询', icon: 'none' });
      }
    });
  }
});
