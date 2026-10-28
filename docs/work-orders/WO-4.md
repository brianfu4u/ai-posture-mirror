# 工单 #4：无语言趣味短音效与 45 秒静默冷却引擎

- **区域**：`audio-assets`
- **前置依赖**：无

**技术栈**：Web Audio API（AudioBufferSourceNode + 可选程序化合成）、TypeScript

**目标文件**
- `packages/audio-assets/src/sound_player.ts`
- `packages/audio-assets/src/cooldown.ts`
- `packages/audio-assets/sounds/*.mp3`
- `packages/audio-assets/LICENSES.md`（每个音频的来源与授权）

**音效主题（全部无人声、每个 < 50 KB）**
- Theme A 卡通逗趣：滑稽笑声、弹簧 “Duang”、口哨、吃金币风格提示音
- Theme B 森林微风：马林巴琶音、风铃、木鱼、大提琴和弦
- Theme C 8-bit 像素：像素跌落、雷达声、卡带声、Level-Up
- 系统音：`device_locked.mp3`（支架咔哒）、`camera_focus.mp3`（对焦嘟声）

> ⚠️ 版权：不得使用或模仿可识别的“小黄人”笑声、马里奥金币音等受版权/商标保护的音频。只允许原创合成（推荐用 Web Audio 程序化生成后导出）或 CC0 素材，并在 `LICENSES.md` 登记。

**45 秒静默冷却**
- 异常提醒音播放结束后锁定 45 秒；期间任何提醒请求一律丢弃（系统音不受限）。
- 冷却时长可配置；使用可注入时钟，便于测试。

**验收标准 (DoD)**
- [ ] 首次用户手势后解锁 `AudioContext`（含 iOS Safari）。
- [ ] 断网状态下所有内置音效从缓存解码后播放，触发到发声 < 50 ms。
- [ ] 冷却单元测试：45 秒内第二次请求被拒绝，45 秒后放行。
