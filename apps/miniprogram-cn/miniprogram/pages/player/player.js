// miniprogram/pages/player/player.js
Page({
  data: {
    isPlaying: false,
    timerSeconds: 45,
    timerText: '00:45',
  },

  timerInterval: null,

  onUnload() {
    this.stopTimer();
  },

  togglePlay() {
    if (this.data.isPlaying) {
      this.stopTimer();
      this.setData({ isPlaying: false });
    } else {
      this.setData({ isPlaying: true });
      this.startTimer();
    }
  },

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.data.timerSeconds > 0) {
        const next = this.data.timerSeconds - 1;
        const mins = Math.floor(next / 60).toString().padStart(2, '0');
        const secs = (next % 60).toString().padStart(2, '0');
        this.setData({
          timerSeconds: next,
          timerText: `${mins}:${secs}`,
        });
      } else {
        this.stopTimer();
        this.setData({ isPlaying: false });
        wx.showToast({ title: '本节练习完成', icon: 'success' });
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  navToScoring() {
    wx.navigateTo({
      url: '/pages/scoring/scoring',
    });
  },
});
