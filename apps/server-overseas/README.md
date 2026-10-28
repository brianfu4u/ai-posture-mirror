# Overseas Backend Server (Google Cloud Run)

Server backend for LINE Messaging API and WhatsApp Cloud API push notifications for APAC parents (Japan, Taiwan, Singapore, Hong Kong).

## Architecture & Features
- **Idempotent Session Sync (`POST /v1/sessions`)**: Ingests `SessionReport` with unique key `deviceId + sessionId`. Duplicate sync attempts return status 200 without duplicate parent notifications.
- **LINE Flex Message (`Japan / Taiwan`)**: Sends rich graphical cards with focus duration, upright percentage, and zero-reminder badges.
- **WhatsApp Cloud API (`Singapore / Hong Kong`)**: Dispatches approved interactive templates.
- **Data Deletion API (`DELETE /v1/users/:userId`)**: Implements strict data privacy compliance for Japan APPI, Singapore PDPA, Hong Kong PDPO, and Taiwan Personal Data Protection Act.
- **Desk Phone Reward Polling (`GET /v1/flowers/poll`)**: Enables instantaneous positive reinforcement from parents to desk phones within 30 seconds.

## Local Development & Testing
```bash
# Run server
node dist/index.js

# Health check
curl http://localhost:8080/healthz
```

## Google Cloud Run Deployment
Deploy directly using `gcloud`:
```bash
gcloud run deploy apm-server-overseas \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars LINE_CHANNEL_ACCESS_TOKEN="...",WHATSAPP_ACCESS_TOKEN="..."
```
