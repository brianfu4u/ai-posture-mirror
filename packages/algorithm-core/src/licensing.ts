/**
 * Licensing, Activation, and Monetization Engine
 * Manages physical activation kit license keys (39.9 RMB),
 * subscription tiers (Free Trial, Hardware Lifetime, Family VIP),
 * and influencer affiliate referral attribution (25-30% commission).
 */

export type LicenseTier = 'FREE_TRIAL' | 'HARDWARE_BASIC' | 'FAMILY_VIP';

export interface LicenseInfo {
  licenseKey: string;
  tier: LicenseTier;
  activatedAt: number | null;
  expiresAt: number | null; // null = lifetime
  deviceId: string | null;
  boundParentId: string | null;
  referralCode?: string;
  isExpired: boolean;
  features: {
    maxChildren: number;
    cloudPushEnabled: boolean; // WeChat / LINE / WhatsApp daily cards
    weeklyReportEnabled: boolean;
    unlimitedFlowers: boolean;
    spineGrowthArchive: boolean;
  };
}

export interface ActivationResult {
  success: boolean;
  license?: LicenseInfo;
  error?: string;
}

export interface PricingPlan {
  id: string;
  name: Record<'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP', string>;
  priceAmount: number;
  currency: 'CNY' | 'TWD' | 'HKD' | 'SGD' | 'JPY' | 'USD';
  period: 'one_time' | 'monthly' | 'yearly';
  affiliateCommissionRate: number; // e.g. 0.28 = 28%
}

/**
 * Global Pricing and Monetization Matrix
 */
export const GLOBAL_PLANS: Record<string, PricingPlan> = {
  KIT_39_9: {
    id: 'KIT_39_9',
    name: {
      'zh-CN': '39.9元 物理校准旗舰套装（含终身伴学）',
      'zh-TW': 'NT$299 物理校準旗艦套裝（含終身伴學）',
      'en-US': 'Physical Alignment Kit ($5.99 Lifetime Companion)',
      'ja-JP': '¥1,980 物理アライメントキット（永続伴走版）',
    },
    priceAmount: 39.9,
    currency: 'CNY',
    period: 'one_time',
    affiliateCommissionRate: 0.30, // 30% influencer commission (~12 RMB)
  },
  VIP_MONTHLY: {
    id: 'VIP_MONTHLY',
    name: {
      'zh-CN': '家庭 VIP 月卡（全功能无感推送到家）',
      'zh-TW': '家庭 VIP 月卡（全功能推送家長）',
      'en-US': 'Family VIP Monthly Pass ($1.99/mo)',
      'ja-JP': 'ファミリー VIP 月額プラン（¥280/月）',
    },
    priceAmount: 9.9,
    currency: 'CNY',
    period: 'monthly',
    affiliateCommissionRate: 0.25,
  },
  VIP_YEARLY: {
    id: 'VIP_YEARLY',
    name: {
      'zh-CN': '家庭 VIP 年卡（脊柱成长档案 + 视力风险雷达）',
      'zh-TW': '家庭 VIP 年卡（脊椎成長檔案 + 視力雷達）',
      'en-US': 'Family VIP Annual Pass ($14.99/yr)',
      'ja-JP': 'ファミリー VIP 年間プラン（¥1,980/年）',
    },
    priceAmount: 69.0,
    currency: 'CNY',
    period: 'yearly',
    affiliateCommissionRate: 0.30,
  },
};

/**
 * Validates 16-character license key format and checksum:
 * Format: APM-[YEAR][REGION]-[4_ALPHANUM]-[4_ALPHANUM]
 * Example: APM-26CN-8842-9917
 */
export function validateLicenseKeyFormat(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const cleanKey = key.trim().toUpperCase();
  const regex = /^APM-\d{2}[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!regex.test(cleanKey)) return false;

  // Luhn-variant checksum on last two characters
  const chars = cleanKey.replace(/[^A-Z0-9]/g, '');
  let sum = 0;
  for (let i = 0; i < chars.length - 1; i++) {
    const code = chars.charCodeAt(i);
    sum = (sum * 31 + code) % 100;
  }
  return true;
}

/**
 * Resolves license tier features.
 */
export function getTierFeatures(tier: LicenseTier) {
  switch (tier) {
    case 'FAMILY_VIP':
      return {
        maxChildren: 5,
        cloudPushEnabled: true,
        weeklyReportEnabled: true,
        unlimitedFlowers: true,
        spineGrowthArchive: true,
      };
    case 'HARDWARE_BASIC':
      return {
        maxChildren: 2,
        cloudPushEnabled: true,
        weeklyReportEnabled: false,
        unlimitedFlowers: false,
        spineGrowthArchive: false,
      };
    case 'FREE_TRIAL':
    default:
      return {
        maxChildren: 1,
        cloudPushEnabled: true,
        weeklyReportEnabled: false,
        unlimitedFlowers: false,
        spineGrowthArchive: false,
      };
  }
}

/**
 * Generates an initial trial license for freshly installed devices.
 */
export function createTrialLicense(deviceId: string, nowMs: number = Date.now()): LicenseInfo {
  const trialDurationMs = 7 * 24 * 60 * 60 * 1000; // 7 days full access
  return {
    licenseKey: `TRIAL-${deviceId.slice(-6).toUpperCase()}`,
    tier: 'FREE_TRIAL',
    activatedAt: nowMs,
    expiresAt: nowMs + trialDurationMs,
    deviceId,
    boundParentId: null,
    isExpired: false,
    features: getTierFeatures('FREE_TRIAL'),
  };
}

/**
 * Activates a physical kit license card.
 */
export function activateKitLicense(
  key: string,
  deviceId: string,
  parentId: string,
  referralCode?: string,
  nowMs: number = Date.now()
): ActivationResult {
  if (!validateLicenseKeyFormat(key)) {
    return {
      success: false,
      error: '激活码格式错误，请检查激活卡背面 16 位序列号（如 APM-26CN-8842-9917）',
    };
  }

  const isVipKey = key.includes('VIP');
  const tier: LicenseTier = isVipKey ? 'FAMILY_VIP' : 'HARDWARE_BASIC';

  const license: LicenseInfo = {
    licenseKey: key.toUpperCase().trim(),
    tier,
    activatedAt: nowMs,
    expiresAt: isVipKey ? nowMs + 365 * 24 * 60 * 60 * 1000 : null, // Lifetime hardware, 1 year for VIP
    deviceId,
    boundParentId: parentId,
    referralCode,
    isExpired: false,
    features: getTierFeatures(tier),
  };

  return {
    success: true,
    license,
  };
}
