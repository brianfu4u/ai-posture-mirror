// app.js
App({
  onLaunch() {
    try {
      if (wx.cloud && typeof wx.cloud.init === 'function') {
        wx.cloud.init({
          env: 'apm-prod-cloud-env',
          traceUser: true,
        });
      }
    } catch (e) {
      console.log('wx.cloud init bypassed:', e);
    }

    this.globalData = {
      deviceId: null,
      parentOpenId: null,
    };
  },
});
