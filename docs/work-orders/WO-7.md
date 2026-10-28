# 工单 #7：海外版 Google Cloud 后台与 LINE / WhatsApp 推送

- **区域**：`server-overseas`
- **前置依赖**：#3 #5

**技术栈**：Node.js 20 + TypeScript、Google Cloud Run（Fastify 或 Hono）、Firestore、LINE Messaging API SDK、WhatsApp Cloud API；Cloudflare 负责 PWA 静态资源边缘分发

**目标文件**
- `apps/server-overseas/src/index.ts`
- `apps/server-overseas/src/channels/line.ts`
- `apps/server-overseas/src/channels/whatsapp.ts`
- `apps/server-overseas/Dockerfile`

**功能**
1. `POST /v1/sessions`：接收设备同步的 `SessionReport`（设备令牌鉴权、zod 校验、幂等键 = `deviceId + sessionId`）。
2. 渠道路由：
   - 日本 / 台湾：LINE Flex Message 图文卡片
   - 新加坡 / 香港：WhatsApp Cloud API 模板消息 + 查看链接（会话窗口外须使用已审核模板）
3. Webhook：`/webhooks/line`（签名校验）、`/webhooks/whatsapp`（verify token + 签名校验），用于家长绑定。
4. 隐私：零视频上传；只存统计字段；Firestore 区域就近（`asia-northeast1` 等）；提供删除接口（遵循日本 APPI、新加坡 PDPA、香港 PDPO、台湾个资法）。

**验收标准 (DoD)**
- [ ] 本地 Mock 请求调用接口，LINE 测试频道与 WhatsApp 测试号成功收到作业结束简报卡片。
- [ ] 重复提交同一 session 不会重复推送。
- [ ] `gcloud run deploy` 一键部署脚本与 README 说明。
