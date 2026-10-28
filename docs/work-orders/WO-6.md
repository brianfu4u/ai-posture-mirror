# 工单 #6：中国大陆版微信小程序与成长日报

- **区域**：`miniprogram-cn`
- **前置依赖**：#3 #5

**技术栈**：微信小程序原生框架、微信云开发（CloudBase）云函数 / 云数据库

**目标文件**
- `apps/miniprogram-cn/miniprogram/pages/index/`
- `apps/miniprogram-cn/miniprogram/pages/report/`
- `apps/miniprogram-cn/cloudfunctions/bindDevice/`
- `apps/miniprogram-cn/cloudfunctions/pushReport/`
- `apps/miniprogram-cn/cloudfunctions/sendFlower/`

**功能**
1. 绑定：旧手机 H5 显示一次性绑定码（二维码，10 分钟有效）；家长微信扫码进入小程序一键绑定。
2. 日报：设备上传 `SessionReport` → 云函数校验设备令牌 → 写库 → 发送订阅消息《今日写作业姿态成长简报》。
3. 报告页仅展示：专注时长、被提醒次数、姿态端正率、【零提醒黄金通关】勋章。
4. 正向互动：家长点【送一朵小红花】→ 云数据库更新 → 旧手机轮询（30 秒）收到后播放奖励音 + 爱心动画。

> ⚠️ 订阅消息：“长期订阅”仅对特定类目开放，需先确认小程序类目是否符合；不符合时按“一次性订阅”设计（家长每次在报告页点击订阅以续期）。上线前须完成 ICP 备案、隐私保护指引与未成年人个人信息保护规则配置。

**验收标准 (DoD)**
- [ ] 微信开发者工具中通过云函数模拟推送，真机收到订阅消息卡片，点击进入报告页。
- [ ] 送花从点击到旧手机播放 ≤ 30 秒。
