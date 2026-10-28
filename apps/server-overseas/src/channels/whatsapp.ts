import crypto from 'node:crypto';

export interface WhatsAppTemplatePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components: Array<{
      type: string;
      parameters: Array<{
        type: string;
        text?: string;
      }>;
    }>;
  };
}

export class WhatsAppChannelClient {
  private phoneNumberId: string;
  private accessToken: string;
  private appSecret: string;
  private verifyToken: string;

  constructor(
    opts: {
      phoneNumberId?: string;
      accessToken?: string;
      appSecret?: string;
      verifyToken?: string;
    } = {}
  ) {
    this.phoneNumberId = opts.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = opts.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.appSecret = opts.appSecret || process.env.WHATSAPP_APP_SECRET || '';
    this.verifyToken = opts.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'apm_verify_token_default';
  }

  /**
   * Validates webhook verify token during Meta verification challenge.
   */
  public verifyWebhookChallenge(token: string): boolean {
    return token === this.verifyToken;
  }

  /**
   * Verifies X-Hub-Signature-256 HMAC-SHA256 header.
   */
  public verifySignature(rawBody: string | Buffer, headerSignature: string): boolean {
    if (!this.appSecret || !headerSignature) return false;
    const cleanSig = headerSignature.replace('sha256=', '');
    const hash = crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');
    return hash === cleanSig;
  }

  /**
   * Sends approved session summary template message to parent's WhatsApp.
   */
  public async sendSessionSummary(params: {
    toPhoneNumber: string;
    sessionId: string;
    durationMinutes: number;
    uprightPercentage: number;
    reminderCount: number;
    isZeroReminderMaster: boolean;
    locale?: 'en-US' | 'zh-TW';
  }): Promise<boolean> {
    const langCode = params.locale === 'zh-TW' ? 'zh_TW' : 'en_US';
    const statusText = params.isZeroReminderMaster ? 'Zero-Reminder Master 🏆' : 'Completed';

    const payload: WhatsAppTemplatePayload = {
      messaging_product: 'whatsapp',
      to: params.toPhoneNumber,
      type: 'template',
      template: {
        name: 'apm_session_summary',
        language: { code: langCode },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: `${params.durationMinutes} mins` },
              { type: 'text', text: `${params.uprightPercentage}%` },
              { type: 'text', text: `${params.reminderCount}` },
              { type: 'text', text: statusText },
            ],
          },
        ],
      },
    };

    if (!this.accessToken || !this.phoneNumberId) {
      console.log(`[Mock WhatsApp Push] To: ${params.toPhoneNumber}, Payload:`, JSON.stringify(payload));
      return true;
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (err) {
      console.error('WhatsApp send failed:', err);
      return false;
    }
  }
}
