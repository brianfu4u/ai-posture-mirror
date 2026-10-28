// cloudfunctions/getWeeklyTrends/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const parentOpenId = wxContext.OPENID;

  const db = cloud.database();
  const _ = db.command;

  try {
    // 1. Fetch user devices
    const deviceRes = await db.collection('devices').where({ parentOpenId }).get();
    if (!deviceRes.data || deviceRes.data.length === 0) {
      return { success: false, error: 'No bound device found' };
    }

    const deviceId = deviceRes.data[0].deviceId;

    // 2. Fetch last 7 days of session reports
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const reportsRes = await db
      .collection('session_reports')
      .where({
        deviceId,
        createdAt: _.gte(sevenDaysAgo),
      })
      .orderBy('createdAt', 'asc')
      .get();

    let totalDurationSecs = 0;
    let totalReminders = 0;
    let uprightSum = 0;
    let goldCount = 0;

    const days = reportsRes.data.map((item) => {
      const r = item.report;
      totalDurationSecs += r.durationSeconds;
      totalReminders += r.reminderCount;
      uprightSum += r.uprightPercentage;
      if (r.isZeroReminderMaster) goldCount++;

      return {
        date: new Date(item.createdAt).toLocaleDateString([], { month: '2-digit', day: '2-digit' }),
        durationMinutes: Math.round(r.durationSeconds / 60),
        uprightPercentage: r.uprightPercentage,
        reminderCount: r.reminderCount,
        isZeroReminderMaster: r.isZeroReminderMaster,
      };
    });

    const count = reportsRes.data.length;
    const avgUpright = count > 0 ? Math.round(uprightSum / count) : 100;

    return {
      success: true,
      deviceId,
      totalFocusMinutes: Math.round(totalDurationSecs / 60),
      totalReminders,
      averageUprightPercentage: avgUpright,
      goldMasterCount: goldCount,
      days,
    };
  } catch (err) {
    console.error('getWeeklyTrends failed:', err);
    return { success: false, error: err.message };
  }
};
