import crypto from 'node:crypto';

export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: Record<string, unknown>;
}

export class LineChannelClient {
  private channelAccessToken: string;
  private channelSecret: string;

  constructor(opts: { channelAccessToken?: string; channelSecret?: string } = {}) {
    this.channelAccessToken = opts.channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    this.channelSecret = opts.channelSecret || process.env.LINE_CHANNEL_SECRET || '';
  }

  /**
   * Verifies LINE Webhook X-Line-Signature HMAC-SHA256.
   */
  public verifySignature(rawBody: string | Buffer, signature: string): boolean {
    if (!this.channelSecret || !signature) return false;
    const hash = crypto
      .createHmac('sha256', this.channelSecret)
      .update(rawBody)
      .digest('base64');
    return hash === signature;
  }

  /**
   * Constructs an ergonomic LINE Flex Message card for session completion report.
   */
  public buildSessionReportCard(params: {
    sessionId: string;
    durationMinutes: number;
    uprightPercentage: number;
    reminderCount: number;
    isZeroReminderMaster: boolean;
    luxQualified: boolean;
    locale?: 'ja-JP' | 'zh-TW' | 'en-US';
  }): LineFlexMessage {
    const isJa = params.locale === 'ja-JP';
    const title = params.isZeroReminderMaster
      ? (isJa ? '🏆 ノーリマインド・ゴールド達成！' : '🏆 零提醒黃金通關！')
      : (isJa ? '📖 学習セッションが完了しました' : '📖 寫作業伴學已完成');

    const durationText = isJa
      ? `${params.durationMinutes} 分間`
      : `${params.durationMinutes} 分鐘`;

    const uprightText = `${params.uprightPercentage}%`;
    const reminderText = isJa
      ? `${params.reminderCount} 回`
      : `${params.reminderCount} 次`;

    const luxStatusText = params.luxQualified
      ? (isJa ? '💡 照明基準を満たしています (合格)' : '💡 光線充足 (合格)')
      : (isJa ? '⚠️ 一時的に照度不足がありました' : '⚠️ 曾有光線偏暗');

    return {
      type: 'flex',
      altText: title,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: params.isZeroReminderMaster ? '#D97706' : '#0F172A',
          paddingAll: '20px',
          contents: [
            {
              type: 'text',
              text: title,
              weight: 'bold',
              size: 'lg',
              color: '#FFFFFF',
              wrap: true,
            },
            {
              type: 'text',
              text: 'Designed in Tokyo, Japan · Made in Shanghai, China',
              size: 'xxs',
              color: '#CBD5E1',
              margin: 'md',
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1E293B',
          paddingAll: '20px',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: isJa ? '集中時間' : '專注時長',
                  size: 'sm',
                  color: '#94A3B8',
                },
                {
                  type: 'text',
                  text: durationText,
                  size: 'sm',
                  color: '#F8FAFC',
                  align: 'end',
                  weight: 'bold',
                },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: isJa ? '姿勢端正率' : '姿勢端正率',
                  size: 'sm',
                  color: '#94A3B8',
                },
                {
                  type: 'text',
                  text: uprightText,
                  size: 'sm',
                  color: '#34D399',
                  align: 'end',
                  weight: 'bold',
                },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: isJa ? 'リマインド回数' : '主動提醒次數',
                  size: 'sm',
                  color: '#94A3B8',
                },
                {
                  type: 'text',
                  text: reminderText,
                  size: 'sm',
                  color: '#FBBF24',
                  align: 'end',
                  weight: 'bold',
                },
              ],
            },
            {
              type: 'separator',
              margin: 'lg',
              color: '#334155',
            },
            {
              type: 'text',
              text: luxStatusText,
              size: 'xs',
              color: params.luxQualified ? '#34D399' : '#FBBF24',
              margin: 'md',
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1E293B',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: isJa ? '詳細レポートを見る' : '查看完整成長報告',
                uri: `https://posture-mirror.web.app/reports/${params.sessionId}`,
              },
              style: 'primary',
              color: '#0284C7',
            },
          ],
        },
      },
    };
  }

  /**
   * Pushes message to LINE parent user ID.
   */
  public async pushMessage(toUserId: string, message: LineFlexMessage): Promise<boolean> {
    if (!this.channelAccessToken) {
      console.log(`[Mock LINE Push] To: ${toUserId}, AltText: ${message.altText}`);
      return true;
    }

    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({
          to: toUserId,
          messages: [message],
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('LINE push failed:', err);
      return false;
    }
  }
}
