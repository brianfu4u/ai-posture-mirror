import http from 'node:http';
import { LineChannelClient } from './channels/line.js';
import { WhatsAppChannelClient } from './channels/whatsapp.js';
import { FirestoreStorageAdapter } from './storage/firestore.js';
import { StripeBillingClient } from './billing/stripe.js';

export interface OverseasSessionPayload {
  sessionId: string;
  report: {
    sessionId: string;
    durationSeconds: number;
    reminderCount: number;
    uprightPercentage: number;
    isZeroReminderMaster: boolean;
    luxQualified: boolean;
  };
  deviceId?: string;
  createdAt?: number;
}

export interface UserProfile {
  userId: string;
  channel: 'line' | 'whatsapp';
  channelId: string;
  deviceId: string;
  locale: 'ja-JP' | 'zh-TW' | 'en-US';
  registeredAt: number;
  tier?: 'FREE_TRIAL' | 'HARDWARE_BASIC' | 'FAMILY_VIP';
}

export class OverseasServer {
  private lineClient: LineChannelClient;
  private whatsappClient: WhatsAppChannelClient;
  private stripeClient: StripeBillingClient;
  private storage: FirestoreStorageAdapter;

  private processedSessions = new Map<string, OverseasSessionPayload>();
  private users = new Map<string, UserProfile>();
  private devices = new Map<string, { deviceId: string; token: string; userId: string; pendingFlowers: number }>();

  constructor() {
    this.lineClient = new LineChannelClient();
    this.whatsappClient = new WhatsAppChannelClient();
    this.stripeClient = new StripeBillingClient();
    this.storage = new FirestoreStorageAdapter();

    this.devices.set('default-device', {
      deviceId: 'default-device',
      token: 'default-device-token',
      userId: 'test-parent-user-1',
      pendingFlowers: 0,
    });
    const defaultUser: UserProfile = {
      userId: 'test-parent-user-1',
      channel: 'line',
      channelId: 'U1234567890abcdef',
      deviceId: 'default-device',
      locale: 'ja-JP',
      registeredAt: Date.now(),
      tier: 'HARDWARE_BASIC',
    };
    this.users.set('test-parent-user-1', defaultUser);
    this.storage.saveUser(defaultUser);
  }

  public handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const method = req.method || 'GET';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Line-Signature, Stripe-Signature');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (method === 'GET' && url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            brand: 'Designed in Tokyo, Japan · Made in Shanghai, China',
            timestamp: Date.now(),
          })
        );
        return;
      }

      // Session Ingestion (POST /v1/sessions)
      if (method === 'POST' && (url.pathname === '/v1/sessions' || url.pathname === '/api/v1/sessions')) {
        const bodyStr = await this.readBody(req);
        const data = JSON.parse(bodyStr || '{}') as OverseasSessionPayload;

        if (!data.sessionId || !data.report) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload: sessionId and report required' }));
          return;
        }

        const deviceId = data.deviceId || 'default-device';
        const idempotencyKey = `${deviceId}:${data.sessionId}`;

        if (this.processedSessions.has(idempotencyKey)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Already processed', duplicate: true }));
          return;
        }

        this.processedSessions.set(idempotencyKey, data);
        await this.storage.saveSession(data);

        const dev = this.devices.get(deviceId);
        if (dev) {
          const user = this.users.get(dev.userId);
          if (user) {
            const durationMins = Math.round(data.report.durationSeconds / 60);

            if (user.channel === 'line') {
              const flexCard = this.lineClient.buildSessionReportCard({
                sessionId: data.sessionId,
                durationMinutes: durationMins,
                uprightPercentage: data.report.uprightPercentage,
                reminderCount: data.report.reminderCount,
                isZeroReminderMaster: data.report.isZeroReminderMaster,
                luxQualified: data.report.luxQualified,
                locale: user.locale,
              });
              await this.lineClient.pushMessage(user.channelId, flexCard);
            } else if (user.channel === 'whatsapp') {
              await this.whatsappClient.sendSessionSummary({
                toPhoneNumber: user.channelId,
                sessionId: data.sessionId,
                durationMinutes: durationMins,
                uprightPercentage: data.report.uprightPercentage,
                reminderCount: data.report.reminderCount,
                isZeroReminderMaster: data.report.isZeroReminderMaster,
                locale: user.locale === 'zh-TW' ? 'zh-TW' : 'en-US',
              });
            }
          }
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sessionId: data.sessionId }));
        return;
      }

      // Stripe Checkout Session (POST /v1/billing/checkout)
      if (method === 'POST' && url.pathname === '/v1/billing/checkout') {
        const bodyStr = await this.readBody(req);
        const body = JSON.parse(bodyStr || '{}');
        const checkoutSession = await this.stripeClient.createCheckoutSession({
          planId: body.planId || 'KIT_OVERSEAS',
          currency: body.currency || 'jpy',
          successUrl: body.successUrl || 'https://posture-mirror.web.app/checkout/success',
          cancelUrl: body.cancelUrl || 'https://posture-mirror.web.app/checkout/cancel',
          customerEmail: body.email,
          deviceId: body.deviceId,
          referralCode: body.referralCode,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...checkoutSession }));
        return;
      }

      // License Card Activation (POST /v1/billing/activate)
      if (method === 'POST' && url.pathname === '/v1/billing/activate') {
        const bodyStr = await this.readBody(req);
        const { licenseKey, deviceId, userId, referralCode } = JSON.parse(bodyStr || '{}');

        if (!licenseKey || !deviceId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'License key and deviceId required' }));
          return;
        }

        const tier = licenseKey.includes('VIP') ? 'FAMILY_VIP' : 'HARDWARE_BASIC';
        const user = this.users.get(userId || 'test-parent-user-1');
        if (user) {
          user.tier = tier;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tier, message: 'License activated successfully' }));
        return;
      }

      // Stripe Webhook (POST /webhooks/stripe)
      if (method === 'POST' && url.pathname === '/webhooks/stripe') {
        const sig = req.headers['stripe-signature'] as string;
        const body = await this.readBody(req);

        // Acknowledge webhook
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
        return;
      }

      // Weekly summary report query (GET /v1/users/:userId/weekly)
      if (method === 'GET' && url.pathname.includes('/weekly')) {
        const parts = url.pathname.split('/');
        const userId = parts[parts.indexOf('users') + 1] || 'test-parent-user-1';
        const summary = await this.storage.getWeeklySummary(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, summary }));
        return;
      }

      // Trigger Weekly Carousel push to LINE (POST /v1/users/:userId/push-weekly)
      if (method === 'POST' && url.pathname.includes('/push-weekly')) {
        const parts = url.pathname.split('/');
        const userId = parts[parts.indexOf('users') + 1] || 'test-parent-user-1';
        const user = this.users.get(userId);
        if (user && user.channel === 'line') {
          const summary = await this.storage.getWeeklySummary(userId);
          const carousel = this.lineClient.buildWeeklyCarousel({
            totalMinutes: summary.totalFocusMinutes,
            averageUpright: summary.averageUprightRate,
            goldCount: summary.goldMasterCount,
            locale: user.locale === 'ja-JP' ? 'ja-JP' : 'zh-TW',
          });
          await this.lineClient.pushMessage(user.channelId, carousel);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // Flower Poll (GET /v1/flowers/poll)
      if (method === 'GET' && (url.pathname === '/v1/flowers/poll' || url.pathname === '/api/v1/flowers/poll')) {
        const deviceId = url.searchParams.get('deviceId') || 'default-device';
        const dev = this.devices.get(deviceId);
        let hasNewFlower = false;
        if (dev && dev.pendingFlowers > 0) {
          hasNewFlower = true;
          dev.pendingFlowers--;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hasNewFlower }));
        return;
      }

      // Send Flower (POST /v1/flowers)
      if (method === 'POST' && (url.pathname === '/v1/flowers' || url.pathname === '/api/v1/flowers')) {
        const bodyStr = await this.readBody(req);
        const { deviceId } = JSON.parse(bodyStr || '{}');
        const targetDev = this.devices.get(deviceId || 'default-device');
        if (targetDev) {
          targetDev.pendingFlowers++;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // Data Privacy Deletion (DELETE /v1/users/:userId)
      if (method === 'DELETE' && url.pathname.startsWith('/v1/users/')) {
        const userId = url.pathname.replace('/v1/users/', '').trim();
        const user = this.users.get(userId);
        if (user) {
          this.devices.delete(user.deviceId);
          this.users.delete(userId);
        }
        await this.storage.deleteUserAndData(userId);

        for (const [key] of this.processedSessions.entries()) {
          if (user && key.startsWith(`${user.deviceId}:`)) {
            this.processedSessions.delete(key);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deletedUserId: userId }));
        return;
      }

      // LINE Webhook
      if (method === 'POST' && url.pathname === '/webhooks/line') {
        const signature = req.headers['x-line-signature'] as string;
        const body = await this.readBody(req);

        if (!this.lineClient.verifySignature(body, signature || '')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid LINE signature' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    } catch (err: any) {
      console.error('Server error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  };

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  public createHttpServer(): http.Server {
    return http.createServer(this.handleRequest);
  }
}

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  const server = new OverseasServer().createHttpServer();
  server.listen(port, () => {
    console.log(`Overseas backend server listening on http://0.0.0.0:${port}`);
    console.log('Designed in Tokyo, Japan · Made in Shanghai, China');
  });
}
