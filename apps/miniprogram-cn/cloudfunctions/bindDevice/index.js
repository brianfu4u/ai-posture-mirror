// cloudfunctions/bindDevice/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const parentOpenId = wxContext.OPENID;
  const { pairingCode } = event;

  if (!pairingCode) {
    return { success: false, error: 'Pairing code is required' };
  }

  const db = cloud.database();
  try {
    // 1. Look up device with matching pairing code (valid within 10 minutes)
    const deviceRes = await db
      .collection('devices')
      .where({ pairingCode })
      .get();

    if (!deviceRes.data || deviceRes.data.length === 0) {
      return { success: false, error: '配对码无效或已过期，请在伴学镜上刷新重试' };
    }

    const device = deviceRes.data[0];

    // 2. Bind device with parent OpenID
    await db.collection('devices').doc(device._id).update({
      data: {
        parentOpenId,
        boundAt: db.serverDate(),
        pairingCode: null, // Clear used code
      },
    });

    return {
      success: true,
      deviceId: device.deviceId,
      deviceName: device.deviceName || '书桌旧手机伴学镜',
    };
  } catch (err) {
    console.error('bindDevice failed:', err);
    return { success: false, error: err.message };
  }
};
