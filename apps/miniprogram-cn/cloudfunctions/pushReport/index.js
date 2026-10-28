// cloudfunctions/pushReport/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event, context) => {
  const db = cloud.database();
  const { deviceToken, report } = event;

  if (!deviceToken || !report || !report.sessionId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    // 1. Verify device authorization
    const deviceRes = await db.collection('devices').where({ deviceToken }).get();
    if (!deviceRes.data || deviceRes.data.length === 0) {
      return { success: false, error: 'Unauthorized device' };
    }

    const device = deviceRes.data[0];
    const parentOpenId = device.parentOpenId;

    // 2. Idempotent check (avoid duplicate reports)
    const existing = await db
      .collection('session_reports')
      .where({ 'report.sessionId': report.sessionId })
      .get();

    if (existing.data && existing.data.length > 0) {
      return { success: true, message: 'Already processed', id: existing.data[0]._id };
    }

    // 3. Store session report
    const insertRes = await db.collection('session_reports').add({
      data: {
        deviceId: device.deviceId,
        parentOpenId,
        report,
        createdAt: db.serverDate(),
      },
    });

    // 4. Send WeChat Template / Subscription Message if parent has bound
    if (parentOpenId) {
      const durationMins = Math.round(report.durationSeconds / 60);
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: parentOpenId,
          page: `pages/report/report?sessionId=${report.sessionId}`,
          lang: 'zh_CN',
          data: {
            thing1: { value: `${durationMins} 分钟写作业完成` },
            number2: { value: report.uprightPercentage },
            number3: { value: report.reminderCount },
            phrase4: { value: report.isZeroReminderMaster ? '零提醒通关' : '正常伴学' },
          },
          templateId: 'tmpl_posture_session_finish',
          miniprogramState: 'formal',
        });
      } catch (pushErr) {
        // Parent may not have subscribed to this specific session, continue gracefully
        console.warn('Subscription push skipped or failed:', pushErr);
      }
    }

    return { success: true, id: insertRes._id };
  } catch (err) {
    console.error('pushReport failed:', err);
    return { success: false, error: err.message };
  }
};
