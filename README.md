# AI Posture Mirror · 护眼坐姿伴学镜

> **Designed in Tokyo, Japan · Made in Shanghai, China**
> 东京人机工学概念与系统设计 · 上海精益制造与供应链交付

把家里闲置的旧手机变成孩子写作业时的“护眼坐姿伴学镜”：离线识别坐姿与书桌光线，用无语言的趣味短音效轻提醒，结束后只把统计数据（不含任何视频）推送给家长。

| 语言 | 简介 |
|---|---|
| 简体中文 | 旧手机变身护眼坐姿伴学镜：离线运行、零视频上传、微信接收成长日报。 |
| 繁體中文 | 舊手機變身護眼坐姿伴學鏡：離線運行、零影像上傳、LINE / WhatsApp 接收成長日報。 |
| English | Turn a spare phone into an offline eye-care & posture study companion. No video ever leaves the device. |
| 日本語 | 使わなくなったスマホを、目と姿勢を見守る学習ミラーに。完全オフライン、映像は一切送信しません。 |

## 架构

| 区域 | 设备端 | 家长端 | 云 |
|---|---|---|---|
| 中国大陆 | PWA（`apps/web-core`） | 微信小程序（`apps/miniprogram-cn`） | 微信云开发 / 腾讯云 CloudBase |
| 海外 | PWA（`apps/web-core`） | LINE / WhatsApp | Google Cloud Run + Firestore（`apps/server-overseas`），Cloudflare 边缘分发 |

```
apps/
  web-core/          旧手机离线 PWA（Vite + TS + Workbox + IndexedDB）
  miniprogram-cn/    中国大陆微信小程序 + 云函数
  server-overseas/   Cloud Run 服务（LINE / WhatsApp）
packages/
  algorithm-core/    纯 TS 算法：姿态、照度、在场状态机
  audio-assets/      原创无语言音效 + 45s 冷却
  i18n/              zh-CN / zh-TW / en-US / ja-JP
hardware-spec/       400×300mm 校准垫与快速指南卡设计稿
docs/work-orders/    Codex 标准工单 #1–#7
```

## 快速开始

```bash
corepack enable
pnpm install
pnpm test
pnpm --filter @apm/web-core dev
```

## 开发顺序

| Sprint | 工单 |
|---|---|
| 1 | [#1 姿态判定](docs/work-orders/WO-1.md) · [#2 照度门禁](docs/work-orders/WO-2.md) · [#4 音效与冷却](docs/work-orders/WO-4.md) |
| 2 | [#3 在场状态机](docs/work-orders/WO-3.md) |
| 3 | [#5 PWA 离线容器](docs/work-orders/WO-5.md) |
| 4 | [#6 微信小程序](docs/work-orders/WO-6.md) · [#7 海外后台](docs/work-orders/WO-7.md) |

## 隐私原则

1. 摄像头画面只在设备内存中处理，不写盘、不上传。
2. 云端只接收 `SessionReport` 统计字段。
3. 本产品为习惯养成辅助工具，不提供医疗诊断，不承诺矫正视力或脊柱。
