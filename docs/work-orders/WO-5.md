# 工单 #5：旧手机 PWA 离线容器与本地存储

- **区域**：`web-core`
- **前置依赖**：#1 #2 #3 #4

**技术栈**：Vite、Vanilla TypeScript（不引入 Vue，保持轻量）、Workbox、`idb`

**目标文件**
- `apps/web-core/src/sw.ts`
- `apps/web-core/src/db.ts`
- `apps/web-core/src/main.ts`
- `apps/web-core/public/models/pose_landmarker_lite.task`（构建时下载，不入库）

**功能**
1. Service Worker：`index.html`、JS、WASM、MediaPipe 模型（约 6 MB）全部 Cache-First 预缓存；版本号变更时清理旧缓存。
2. 极简 UI：
   - 底部 10% 绿色虚线校准带（对准垫子底边）
   - 暗光时屏幕边缘 4000K 暖白补光环（视觉提示，不宣称替代台灯）
   - 伴学中：纯黑底大字时钟（省电）
   - 姿态异常：1.2 秒趣味动画 + 音效（受 #4 冷却约束）
3. IndexedDB `offline_sessions` 待发队列；监听 `online` 事件 + 启动时检查，批量同步，成功后删除，失败指数退避。
4. 四语切换（zh-CN / zh-TW / en-US / ja-JP），默认跟随 `navigator.language`；屏幕固定标注 `Designed in Tokyo, Japan · Made in Shanghai, China`。
5. 隐私：视频帧只在内存中处理，**绝不**写盘或上传；只同步 `SessionReport`。
6. 屏幕常亮：使用 Screen Wake Lock API。

**验收标准 (DoD)**
- [ ] 首次加载后开启飞行模式，刷新页面仍可 100% 运行（Lighthouse PWA 检查通过）。
- [ ] 断网期间的伴学记录写入 IndexedDB，恢复网络后自动同步。
- [ ] 在一台 2018 年左右的旧安卓机与旧 iPhone 上实测 10 FPS 稳定运行 30 分钟。
