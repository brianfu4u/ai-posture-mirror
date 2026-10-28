export type ThemeId = 'cartoon' | 'forest' | 'pixel';
export type SystemSoundId = 'device_locked' | 'camera_focus';

export interface SoundDef {
  id: string;
  file: string;
}

/** Reminder (posture alert) sounds per theme. All voice-free, original synthesis. */
export const THEMES: Record<ThemeId, readonly SoundDef[]> = {
  cartoon: [
    { id: 'a_cartoon_giggle', file: 'a_cartoon_giggle.mp3' },
    { id: 'a_spring_duang', file: 'a_spring_duang.mp3' },
    { id: 'a_whistle', file: 'a_whistle.mp3' },
    { id: 'a_sparkle_pickup', file: 'a_sparkle_pickup.mp3' },
  ],
  forest: [
    { id: 'b_marimba_arpeggio', file: 'b_marimba_arpeggio.mp3' },
    { id: 'b_wind_chime', file: 'b_wind_chime.mp3' },
    { id: 'b_wood_block', file: 'b_wood_block.mp3' },
    { id: 'b_cello_chord', file: 'b_cello_chord.mp3' },
  ],
  pixel: [
    { id: 'c_pixel_fall', file: 'c_pixel_fall.mp3' },
    { id: 'c_radar_ping', file: 'c_radar_ping.mp3' },
    { id: 'c_cartridge_insert', file: 'c_cartridge_insert.mp3' },
    { id: 'c_level_up', file: 'c_level_up.mp3' },
  ],
};

/** System feedback sounds. Never subject to the reminder cooldown. */
export const SYSTEM_SOUNDS: Record<SystemSoundId, SoundDef> = {
  device_locked: { id: 'device_locked', file: 'device_locked.mp3' },
  camera_focus: { id: 'camera_focus', file: 'camera_focus.mp3' },
};

export const ALL_SOUND_FILES: readonly string[] = [
  ...Object.values(THEMES).flatMap((t) => t.map((s) => s.file)),
  ...Object.values(SYSTEM_SOUNDS).map((s) => s.file),
];
