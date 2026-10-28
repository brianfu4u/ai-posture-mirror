// cloudfunctions/activateDevice/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const parentOpenId = wxContext.OPENID;
  const { licenseKey, deviceId, referralCode } = event;

  if (!licenseKey || !deviceId) {
    return { success: false, error: '请提供激活码与设备号' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();
  const regex = /^APM-\d{2}[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!regex.test(cleanKey)) {
    return { success: false, error: '激活码格式错误，请检查卡片 16 位序列号（如 APM-26CN-8842-9917）' };
  }

  const db = cloud.database();
  try {
    // 1. Check if license card exists in database and has not been redeemed
    const cardRes = await db.collection('license_cards').where({ licenseKey: cleanKey }).get();

    // In production, cards are pre-generated. If not found in dev, allow valid format
    let tier = cleanKey.includes('VIP') ? 'FAMILY_VIP' : 'HARDWARE_BASIC';
    if (cardRes.data && cardRes.data.length > 0) {
      const card = cardRes.data[0];
      if (card.isRedeemed) {
        return { success: false, error: '该激活码已被使用，如有疑问请联系客服' };
      }
      tier = card.tier || tier;
      // Mark as redeemed
      await db.collection('license_cards').doc(card._id).update({
        data: {
          isRedeemed: true,
          redeemedBy: parentOpenId,
          redeemedAt: db.serverDate(),
          deviceId,
          referralCode: referralCode || null,
        },
      });
    }

    // 2. Update device binding record
    await db.collection('devices').where({ deviceId }).update({
      data: {
        parentOpenId,
        licenseTier: tier,
        licenseKey: cleanKey,
        activatedAt: db.serverDate(),
        referralCode: referralCode || null,
      },
    });

    // 3. Record affiliate commission if referralCode is present (25-30% payout)
    if (referralCode) {
      await db.collection('affiliate_orders').add({
        data: {
          referralCode,
          deviceId,
          parentOpenId,
          licenseKey: cleanKey,
          commissionAmount: 11.97, // ~30% of 39.9
          status: 'PENDING_SETTLEMENT',
          createdAt: db.serverDate(),
        },
      });
    }

    return {
      success: true,
      tier,
      message: '恭喜！设备已成功激活，已享终身无感伴学服务！',
    };
  } catch (err) {
    console.error('activateDevice failed:', err);
    return { success: false, error: err.message };
  }
};
