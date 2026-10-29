// miniprogram/pages/guide/guide.js
Page({
  data: {
    isVideoPlaying: false,
  },
  onLoad() {},

  playVideo() {
    this.setData({ isVideoPlaying: true });
  },
});
