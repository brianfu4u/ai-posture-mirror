export const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'] as const;
export type Locale = (typeof LOCALES)[number];

/** Brand line is fixed English on all locales (device screen, mat, quick-guide card). */
export const BRAND_LINE = 'Designed in Tokyo, Japan · Made in Shanghai, China';

export const PRODUCT_NAME: Record<Locale, string> = {
  'zh-CN': '护眼坐姿伴学镜',
  'zh-TW': '護眼坐姿伴學鏡',
  'en-US': 'Eye Care & Posture Mirror',
  'ja-JP': '目にやさしい姿勢ミラー',
};

export const BRAND_SUBLINE: Record<Locale, string> = {
  'zh-CN': '东京人机工学概念与系统设计 · 上海精益制造与供应链交付',
  'zh-TW': '東京人體工學概念與系統設計 · 上海精實製造與供應鏈交付',
  'en-US': 'Ergonomic concept & system design in Tokyo · Lean manufacturing & supply chain in Shanghai',
  'ja-JP': '東京で人間工学コンセプトとシステムを設計 · 上海でリーン生産とサプライチェーンを担当',
};

/** UI strings. Keys must exist in every locale (enforced by type). */
export const MESSAGES = {
  'zh-CN': {
    tooDark: '光线太暗啦，请打开台灯（建议 500~1000 Lux）',
    aligning: '请坐好，正在对准…',
    studying: '伴学中',
    finished: '本段学习已结束',
    alignBottomEdge: '请将垫子底边对准绿色校准带',
    zeroReminderMaster: '零提醒黄金通关',
  },
  'zh-TW': {
    tooDark: '光線太暗了，請打開檯燈（建議 500~1000 Lux）',
    aligning: '請坐好，正在對準…',
    studying: '伴學中',
    finished: '本段學習已結束',
    alignBottomEdge: '請將墊子底邊對準綠色校準帶',
    zeroReminderMaster: '零提醒黃金通關',
  },
  'en-US': {
    tooDark: 'Too dark — please turn on the desk lamp (500–1000 lux recommended)',
    aligning: 'Sit down, aligning…',
    studying: 'Studying',
    finished: 'Session finished',
    alignBottomEdge: 'Align the mat’s bottom edge with the green band',
    zeroReminderMaster: 'Zero-Reminder Gold',
  },
  'ja-JP': {
    tooDark: '暗すぎます。デスクライトをつけてください（500〜1000 Lux 推奨）',
    aligning: '座ってください。位置合わせ中…',
    studying: '学習中',
    finished: '今回の学習は終了しました',
    alignBottomEdge: 'マットの下端を緑のガイドに合わせてください',
    zeroReminderMaster: 'ノーリマインド・ゴールド',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof MESSAGES)['zh-CN'];

export function t(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key];
}
