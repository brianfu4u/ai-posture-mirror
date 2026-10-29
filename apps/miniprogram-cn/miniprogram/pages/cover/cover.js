// miniprogram/pages/cover/cover.js
Page({
  data: {
    isLoggedIn: true,
    activeChild: 'child_1',
    childProfiles: {
      child_1: { name: '大宝', age: 10 },
      child_2: { name: '二宝', age: 7 }
    }
  },

  onLoad() {
    const cachedUser = wx.getStorageSync('apm_user_info');
    if (cachedUser) {
      this.setData({ isLoggedIn: true });
    }
    const cachedChild = wx.getStorageSync('apm_active_child') || 'child_1';
    this.setData({ activeChild: cachedChild });
  },

  handleLogin() {
    wx.showLoading({ title: '正在登录...' });
    setTimeout(() => {
      wx.hideLoading();
      this.setData({ isLoggedIn: true });
      wx.setStorageSync('apm_user_info', { phone: '138****8888', name: '家长用户' });
      wx.showToast({ title: '登录成功', icon: 'success' });
    }, 400);
  },

  switchChild(e) {
    const child = e.currentTarget.dataset.child;
    this.setData({ activeChild: child });
    wx.setStorageSync('apm_active_child', child);
    wx.showToast({
      title: `当前孩子：${this.data.childProfiles[child].name}`,
      icon: 'none'
    });
  },

  // 路线一：进入原有的眼脑协同测试（完全独立，不碰对方代码）
  navToEyeBrain() {
    wx.navigateTo({
      url: '/pages/home/home',
      fail: () => {
        // Fallback提示
        wx.showModal({
          title: '眼脑协调测试',
          content: '眼脑协调测试互动模块已就绪，保持独立运行。',
          showCancel: false
        });
      }
    });
  },

  // 路线二：进入 AI 护眼坐姿伴学魔镜（完全独立）
  navToPostureMirror() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  }
});
