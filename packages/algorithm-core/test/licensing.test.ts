import { describe, it, expect } from 'vitest';
import {
  validateLicenseKeyFormat,
  createTrialLicense,
  activateKitLicense,
  GLOBAL_PLANS,
} from '../src/licensing.js';

describe('Licensing & Monetization System', () => {
  it('validates 16-character license key format correctly', () => {
    // Valid format: APM-26CN-8842-9917
    expect(validateLicenseKeyFormat('APM-26CN-8842-9917')).toBe(true);
    expect(validateLicenseKeyFormat('APM-26JP-ABCD-1234')).toBe(true);
    expect(validateLicenseKeyFormat('APM-26TW-VIP1-9988')).toBe(true);

    // Invalid format
    expect(validateLicenseKeyFormat('INVALID-KEY')).toBe(false);
    expect(validateLicenseKeyFormat('APM-SHORT')).toBe(false);
    expect(validateLicenseKeyFormat('1234-5678-9012-3456')).toBe(false);
  });

  it('initializes 7-day free trial on new devices', () => {
    const now = 1000000000000;
    const license = createTrialLicense('TK-SH-8821', now);

    expect(license.tier).toBe('FREE_TRIAL');
    expect(license.deviceId).toBe('TK-SH-8821');
    expect(license.expiresAt).toBe(now + 7 * 86400000);
    expect(license.features.maxChildren).toBe(1);
  });

  it('activates physical kit license granting lifetime hardware access', () => {
    const now = 1000000000000;
    const res = activateKitLicense(
      'APM-26CN-8842-9917',
      'TK-SH-8821',
      'parent_wx_001',
      'DOUYIN_MOM_88',
      now
    );

    expect(res.success).toBe(true);
    expect(res.license?.tier).toBe('HARDWARE_BASIC');
    expect(res.license?.expiresAt).toBeNull(); // Lifetime
    expect(res.license?.referralCode).toBe('DOUYIN_MOM_88');
    expect(res.license?.features.maxChildren).toBe(2);
  });

  it('calculates 28-30% affiliate commission for influencers', () => {
    const kit = GLOBAL_PLANS.KIT_39_9;
    expect(kit.priceAmount).toBe(39.9);
    const commission = kit.priceAmount * kit.affiliateCommissionRate;
    expect(commission).toBeGreaterThan(11.5); // ~¥11.97 per sale
  });
});
