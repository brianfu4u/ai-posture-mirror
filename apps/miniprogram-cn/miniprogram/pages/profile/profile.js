// miniprogram/pages/profile/profile.js
Page({
  data: {
    activeChildId: 'child_1',
  },

  onLoad() {
    const savedChild = wx.getStorageSync('apm_active_child') || 'child_1';
    this.setData({ activeChildId: savedChild });
  },

  switchChild(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeChildId: id });
    wx.setStorageSync('apm_active_child', id);
    wx.showToast({
      title: id === 'child_2' ? '已切至二宝 (7岁)' : '已切至大宝 (10岁)',
      icon: 'none',
      duration: 1200,
    });
  },

  navToGuide() {
    wx.navigateTo({
      url: '/pages/guide/guide',
    });
  },

  navToMall() {
    wx.navigateTo({
      url: '/pages/mall/mall',
    });
  },
});
