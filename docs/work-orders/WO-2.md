# 工单 #2：书桌环境光照度门禁与暗光拒工模块

- **区域**：`algorithm-core`
- **前置依赖**：无

**技术栈**：Canvas API、TypeScript

**目标文件**
- `packages/algorithm-core/src/lux_meter.ts`
- `packages/algorithm-core/test/lux_meter.test.ts`

**输入 / 输出契约**
```ts
computeLuma(rgba: Uint8ClampedArray, width: number, height: number, roi?: Rect): number   // 纯函数
class LuxGate { push(luma: number, nowMs: number, exposureHint?: ExposureHint): LuxReading }
```
DOM 侧抽帧（`<video>` → 160×120 canvas，1 fps）放在 `apps/web-core`，本包只处理像素数组，保证可测。

**功能**
1. 中央作业区 ROI 加权感知亮度：\(Y = 0.299R + 0.587G + 0.114B\)。
2. 照度估算：优先使用 `MediaStreamTrack.getSettings()` 的 `exposureTime` / `iso` / `exposureCompensation`（若浏览器提供）；否则用直方图启发式估算。**输出为估算值，不得在 UI 或营销中宣称“精确测光”。**
3. 门禁：估算 < 500 lux → `TOO_DARK`；≥ 500 → `LUX_QUALIFIED`。
4. 防抖：`TOO_DARK` 需连续 2 秒确认才切换；恢复同样 2 秒（迟滞，防跳变）。
5. 阈值与映射系数可配置，并预留“出厂按机型标定”接口。

**验收标准 (DoD)**
- [ ] 合成弱光帧 → `TOO_DARK`；台灯/强光帧 → `LUX_QUALIFIED`。
- [ ] 1.5 秒瞬时阴影不触发 `TOO_DARK`；持续 2 秒以上触发。
