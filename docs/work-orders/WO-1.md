# 工单 #1：核心视觉与几何姿态判定模块

- **区域**：`algorithm-core`
- **前置依赖**：无

**技术栈**：TypeScript (ESNext, strict)，`@mediapipe/tasks-vision`（仅类型/输入，算法本身不依赖 MediaPipe 运行时）

**目标文件**
- `packages/algorithm-core/src/posture_eval.ts`
- `packages/algorithm-core/src/types.ts`（契约已定义，勿随意改动）
- `packages/algorithm-core/test/posture_eval.test.ts`

**输入 / 输出契约**
```ts
evaluatePosture(lm: PoseLandmarks, baseline: PostureBaseline, th?: PostureThresholds): PostureResult
createBaseline(frames: PoseLandmarks[]): PostureBaseline   // 取多帧中位数
```

**功能**
1. 肩宽自归一化：鼻尖（0）到双肩连线（11–12）的垂直距离 \(H_t\)，除以肩宽 \(W_t\)，得 \(R_t = H_t / W_t\)。
2. 四维异常判定：
   - 低头 / 趴桌 `HEAD_DOWN`：\(R_t < 0.68 R_0\)
   - 距离过近 `TOO_CLOSE`：\(W_t > 1.25 W_0\)
   - 歪头 `HEAD_TILT`：眼线（2–5）倾角 \(|\theta| > 15^\circ\)
   - 斜肩 / 驼背 `SHOULDER_TILT`：肩线（11–12）倾角 \(|\theta| > 12^\circ\)
3. 手部防误判：腕点（15、16）到面部中心（鼻尖与嘴角中点的中点，代替下巴）的三维距离 < 1.2 × 眼间距 → `isInterference: true`，调用方须挂起异常计时。
4. 阈值全部走 `DEFAULT_POSTURE_THRESHOLDS`，不得硬编码。
5. 关键点 `visibility < 0.5` 时该维度不参与判定。

**验收标准 (DoD)**
- [ ] Vitest 覆盖：正常坐姿、低头 30°、歪头 20°、托腮、肩线倾斜、肩宽放大 1.3×（过近）。
- [ ] 基准测试：单帧 `evaluatePosture` 在 Node 下 p95 < 0.2 ms（为移动浏览器 < 2 ms 留余量）。
- [ ] 无 DOM 依赖，`pnpm --filter @apm/algorithm-core typecheck` 通过。
