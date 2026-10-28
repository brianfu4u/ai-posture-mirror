/**
 * Multi-Child Automatic Profile Switcher
 * Identifies and switches profiles based on calibrated physical shoulder width
 * and seated torso height (e.g., Elder child vs Younger sibling).
 */

export interface ChildProfile {
  id: string;
  name: string;
  baselineShoulderMm: number;
  baselineNoseShoulderMm: number;
  createdAt: number;
  lastActiveAt: number;
  totalStudyMinutes: number;
  goldMasterCount: number;
}

export interface ProfileMatchResult {
  profile: ChildProfile;
  isNewProfile: boolean;
  matchConfidence: number;
  switched: boolean;
}

export class ProfileManager {
  private profiles: Map<string, ChildProfile> = new Map();
  private activeProfileId: string | null = null;
  private tolerancePercent: number; // Default 12% tolerance for daily variation / posture slack

  constructor(tolerancePercent: number = 0.12) {
    this.tolerancePercent = tolerancePercent;
  }

  /**
   * Identifies or creates a child profile from calibrated physical dimensions.
   */
  public resolveProfile(
    shoulderMm: number,
    noseShoulderMm: number,
    nowMs: number = Date.now()
  ): ProfileMatchResult {
    let bestMatch: ChildProfile | null = null;
    let minDiffRatio = Infinity;

    for (const profile of this.profiles.values()) {
      const shoulderDiff = Math.abs(profile.baselineShoulderMm - shoulderMm) / profile.baselineShoulderMm;
      const heightDiff = Math.abs(profile.baselineNoseShoulderMm - noseShoulderMm) / profile.baselineNoseShoulderMm;
      const combinedDiff = (shoulderDiff * 0.7) + (heightDiff * 0.3);

      if (combinedDiff < minDiffRatio) {
        minDiffRatio = combinedDiff;
        bestMatch = profile;
      }
    }

    if (bestMatch && minDiffRatio <= this.tolerancePercent) {
      // Matching existing profile
      const switched = this.activeProfileId !== bestMatch.id;
      this.activeProfileId = bestMatch.id;
      bestMatch.lastActiveAt = nowMs;

      // Smooth moving average update for growth tracking
      bestMatch.baselineShoulderMm = Math.round((bestMatch.baselineShoulderMm * 0.8 + shoulderMm * 0.2) * 10) / 10;
      bestMatch.baselineNoseShoulderMm = Math.round((bestMatch.baselineNoseShoulderMm * 0.8 + noseShoulderMm * 0.2) * 10) / 10;

      return {
        profile: bestMatch,
        isNewProfile: false,
        matchConfidence: Math.max(0.6, Math.min(1.0, 1.0 - minDiffRatio)),
        switched,
      };
    }

    // No matching profile -> create new profile (e.g. Child A, Child B)
    const profileIndex = this.profiles.size + 1;
    const newId = `child_profile_${profileIndex}`;
    const newProfile: ChildProfile = {
      id: newId,
      name: `宝贝 ${profileIndex} 号`,
      baselineShoulderMm: Math.round(shoulderMm * 10) / 10,
      baselineNoseShoulderMm: Math.round(noseShoulderMm * 10) / 10,
      createdAt: nowMs,
      lastActiveAt: nowMs,
      totalStudyMinutes: 0,
      goldMasterCount: 0,
    };

    this.profiles.set(newId, newProfile);
    const switched = this.activeProfileId !== newId;
    this.activeProfileId = newId;

    return {
      profile: newProfile,
      isNewProfile: true,
      matchConfidence: 1.0,
      switched,
    };
  }

  public getActiveProfile(): ChildProfile | null {
    if (!this.activeProfileId) return null;
    return this.profiles.get(this.activeProfileId) ?? null;
  }

  public getAllProfiles(): ChildProfile[] {
    return Array.from(this.profiles.values());
  }

  public setProfileName(id: string, name: string): void {
    const p = this.profiles.get(id);
    if (p) p.name = name;
  }
}
