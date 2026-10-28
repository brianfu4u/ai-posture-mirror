// cloudfunctions/sendFlower/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const parentOpenId = wxContext.OPENID;
  const { sessionId } = event;

  const db = cloud.database();
  const _ = db.command;

  try {
    // 1. Locate device associated with this parent or session
    let targetDeviceId = null;
    if (sessionId) {
      const sRes = await db.collection('session_reports').where({ 'report.sessionId': sessionId }).get();
      if (sRes.data && sRes.data.length > 0) {
        targetDeviceId = sRes.data[0].deviceId;
      }
    }

    if (!targetDeviceId) {
      const dRes = await db.collection('devices').where({ parentOpenId }).get();
      if (dRes.data && dRes.data.length > 0) {
        targetDeviceId = dRes.data[0].deviceId;
      }
    }

    if (!targetDeviceId) {
      return { success: false, error: 'Target device not found' };
    }

    // 2. Increment pendingFlowers on the device record for desk phone polling
    await db
      .collection('devices')
      .where({ deviceId: targetDeviceId })
      .update({
        data: {
          pendingFlowers: _.inc(1),
          lastFlowerAt: db.serverDate(),
        },
      });

    // 3. Log reward action
    await db.collection('rewards_log').add({
      data: {
        deviceId: targetDeviceId,
        parentOpenId,
        sessionId,
        type: 'FLOWER',
        createdAt: db.serverDate(),
      },
    });

    return { success: true };
  } catch (err) {
    console.error('sendFlower failed:', err);
    return { success: false, error: err.message };
  }
};
