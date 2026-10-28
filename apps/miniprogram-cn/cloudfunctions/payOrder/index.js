// cloudfunctions/payOrder/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const PRICE_MAP = {
  KIT_39_9: { amount: 3990, desc: '39.9元 AI 坐姿伴学魔镜实体校准套装' },
  VIP_MONTHLY: { amount: 990, desc: '家庭 VIP 月卡（全功能无感推送到家）' },
  VIP_YEARLY: { amount: 6900, desc: '家庭 VIP 年卡（脊柱成长档案 + 视力雷达）' },
};

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const parentOpenId = wxContext.OPENID;
  const { planId, deviceId, referralCode } = event;

  const plan = PRICE_MAP[planId] || PRICE_MAP.KIT_39_9;
  const outTradeNo = `APM_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // WeChat CloudBase Unified Pay API call
    const res = await cloud.cloudPay.unifiedOrder({
      body: plan.desc,
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: process.env.WX_SUB_MCH_ID || '1800000000',
      totalFee: plan.amount,
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'payCallback',
    });

    const db = cloud.database();
    await db.collection('orders').add({
      data: {
        outTradeNo,
        parentOpenId,
        deviceId: deviceId || null,
        planId,
        totalFee: plan.amount,
        referralCode: referralCode || null,
        status: 'UNPAID',
        createdAt: db.serverDate(),
      },
    });

    return {
      success: true,
      payment: res.payment,
      outTradeNo,
    };
  } catch (err) {
    console.error('payOrder error:', err);
    return {
      success: false,
      error: err.message,
    };
  }
};
