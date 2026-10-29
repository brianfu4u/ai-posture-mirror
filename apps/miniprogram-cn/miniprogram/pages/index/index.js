// miniprogram/pages/index/index.js
Page({
  data: {
    activeChildId: 'child_1',
    systemMode: 'single', // 'single': 单机两用, 'dual': 双机联动
    offlineModeEnabled: true,
    showOfflinePromptModal: false,
  },

  onLoad() {
    const savedMode = wx.getStorageSync('apm_system_mode') || 'single';
    const savedChild = wx.getStorageSync('apm_active_child') || 'child_1';
    const savedOffline = wx.getStorageSync('apm_offline_mode');
    this.setData({
      systemMode: savedMode,
      activeChildId: savedChild,
      offlineModeEnabled: savedOffline !== false,
    });
  },

  onShow() {
    const savedChild = wx.getStorageSync('apm_active_child') || 'child_1';
    this.setData({ activeChildId: savedChild });
  },

  toggleChild() {
    const next = this.data.activeChildId === 'child_1' ? 'child_2' : 'child_1';
    this.setData({ activeChildId: next });
    wx.setStorageSync('apm_active_child', next);
    wx.showToast({
      title: next === 'child_2' ? '已切至二宝 (7岁)' : '已切至大宝 (10岁)',
      icon: 'none',
      duration: 1200,
    });
  },

  toggleSystemMode() {
    const next = this.data.systemMode === 'single' ? 'dual' : 'single';
    this.setData({ systemMode: next });
    wx.setStorageSync('apm_system_mode', next);
    wx.showToast({
      title: next === 'single' ? '已切为单机两用模式' : '已切为双机常态联动',
      icon: 'none',
      duration: 1200,
    });
  },

  toggleOfflineMode(e) {
    const enabled = e.detail.value;
    this.setData({ offlineModeEnabled: enabled });
    wx.setStorageSync('apm_offline_mode', enabled);
    wx.showToast({
      title: enabled ? '已开启离线断网守护' : '已关闭离线断网提示',
      icon: 'none',
    });
  },

  // 1. SESSION_01: 书桌伴学
  startDeskCompanion() {
    if (this.data.offlineModeEnabled) {
      this.setData({ showOfflinePromptModal: true });
    } else {
      this.navigateToCompanion(false);
    }
  },

  confirmStartOffline() {
    this.setData({ showOfflinePromptModal: false });
    this.navigateToCompanion(true);
  },

  confirmStartOnline() {
    this.setData({ showOfflinePromptModal: false });
    this.navigateToCompanion(false);
  },

  closeOfflineModal() {
    this.setData({ showOfflinePromptModal: false });
  },

  noop() {},

  navigateToCompanion(isOffline) {
    wx.navigateTo({
      url: `/pages/live/live?autoStart=true&offline=${isOffline}&mode=${this.data.systemMode}`,
      fail: (err) => {
        console.error('Navigate to companion failed:', err);
        wx.showToast({ title: '无法打开伴学屏', icon: 'none' });
      },
    });
  },

  // 2. DATA_02: 分析报告
  openReportCenter() {
    wx.navigateTo({
      url: '/pages/report/report',
      fail: (err) => {
        console.error('Navigate to report center failed:', err);
        wx.showToast({ title: '无法打开分析报告', icon: 'none' });
      },
    });
  },

  // 3. GUIDE_03: 安装指南
  openGuidePage() {
    wx.navigateTo({
      url: '/pages/guide/guide',
      fail: (err) => {
        console.error('Navigate to guide failed:', err);
        wx.showToast({ title: '无法打开安装指南', icon: 'none' });
      },
    });
  },

  // 4. INFO_04: 产品说明
  openIntroPage() {
    wx.navigateTo({
      url: '/pages/intro/intro',
      fail: (err) => {
        console.error('Navigate to intro failed:', err);
        wx.showToast({ title: '无法打开产品说明', icon: 'none' });
      },
    });
  },

  // 5. 官方商城
  navToMall() {
    wx.navigateTo({
      url: '/pages/mall/mall',
      fail: () => {
        wx.showToast({ title: '官方商城加载中', icon: 'none' });
      },
    });
  },
});
