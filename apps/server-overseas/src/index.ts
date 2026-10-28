import http from 'node:http';
import { LineChannelClient } from './channels/line.js';
import { WhatsAppChannelClient } from './channels/whatsapp.js';

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
  channelId: string; // LINE userId or WhatsApp phone number
  deviceId: string;
  locale: 'ja-JP' | 'zh-TW' | 'en-US';
  registeredAt: number;
}

export class OverseasServer {
  private lineClient: LineChannelClient;
  private whatsappClient: WhatsAppChannelClient;

  // In-memory persistent collections (or Firestore in production)
  private processedSessions = new Map<string, OverseasSessionPayload>();
  private users = new Map<string, UserProfile>();
  private devices = new Map<string, { deviceId: string; token: string; userId: string; pendingFlowers: number }>();

  constructor() {
    this.lineClient = new LineChannelClient();
    this.whatsappClient = new WhatsAppChannelClient();

    // Default test seed device
    this.devices.set('default-device', {
      deviceId: 'default-device',
      token: 'default-device-token',
      userId: 'test-parent-user-1',
      pendingFlowers: 0,
    });
    this.users.set('test-parent-user-1', {
      userId: 'test-parent-user-1',
      channel: 'line',
      channelId: 'U1234567890abcdef',
      deviceId: 'default-device',
      locale: 'ja-JP',
      registeredAt: Date.now(),
    });
  }

  public handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const method = req.method || 'GET';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Line-Signature, X-Hub-Signature-256');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 1. Health check
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

      // 2. Posture Session Sync (POST /v1/sessions)
      if (method === 'POST' && (url.pathname === '/v1/sessions' || url.pathname === '/api/v1/sessions')) {
        const auth = req.headers['authorization'];
        const token = auth?.replace('Bearer ', '').trim();

        const bodyStr = await this.readBody(req);
        const data = JSON.parse(bodyStr || '{}') as OverseasSessionPayload;

        if (!data.sessionId || !data.report) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload: sessionId and report required' }));
          return;
        }

        const deviceId = data.deviceId || 'default-device';
        const idempotencyKey = `${deviceId}:${data.sessionId}`;

        // Idempotency check: duplicate prevention
        if (this.processedSessions.has(idempotencyKey)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Already processed', duplicate: true }));
          return;
        }

        this.processedSessions.set(idempotencyKey, data);

        // Find associated parent user
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

      // 3. Flower Reward Poll (GET /api/v1/flowers/poll)
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

      // 4. Send Flower Encouragement (POST /v1/flowers)
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

      // 5. Data Deletion API (DELETE /v1/users/:userId)
      // Compliance with Japan APPI, Singapore PDPA, HK PDPO, Taiwan Personal Data Protection Act
      if (method === 'DELETE' && url.pathname.startsWith('/v1/users/')) {
        const userId = url.pathname.replace('/v1/users/', '').trim();
        const user = this.users.get(userId);
        if (user) {
          this.devices.delete(user.deviceId);
          this.users.delete(userId);
        }

        // Purge session history matching this user/device
        for (const [key] of this.processedSessions.entries()) {
          if (user && key.startsWith(`${user.deviceId}:`)) {
            this.processedSessions.delete(key);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deletedUserId: userId }));
        return;
      }

      // 6. WhatsApp Webhook Verification (GET /webhooks/whatsapp)
      if (method === 'GET' && url.pathname === '/webhooks/whatsapp') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        if (mode === 'subscribe' && token && this.whatsappClient.verifyWebhookChallenge(token)) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(challenge || '');
          return;
        }
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      // 7. LINE Webhook (POST /webhooks/line)
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

      // 404 Fallback
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

// Auto start if executed directly
if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  const server = new OverseasServer().createHttpServer();
  server.listen(port, () => {
    console.log(`Overseas backend server listening on http://0.0.0.0:${port}`);
    console.log('Designed in Tokyo, Japan · Made in Shanghai, China');
  });
}
