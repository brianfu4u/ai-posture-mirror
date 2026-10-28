# 工单 #3：“有人即开始，无人即结束”在场状态机

- **区域**：`algorithm-core`
- **前置依赖**：#1

**技术栈**：有限状态机（纯 TS，不引入 RxJS；如需流式封装放在 web-core）

**目标文件**
- `packages/algorithm-core/src/session_state.ts`
- `packages/algorithm-core/test/session_state.test.ts`

**输入 / 输出契约**
```ts
class SessionMachine {
  constructor(opts?: { clock?: () => number; leaveTimeoutMs?: number /* 60000 */ })
  onFrame(input: { personPresent: boolean; posture?: PostureResult; lux?: LuxReading }, nowMs: number): SessionStateName
  onReminderPlayed(): void
  onFinished(cb: (r: SessionReport) => void): void
  readonly state: SessionStateName
  readonly targetFps: 1 | 10
}
```

**状态**
- `STANDBY`：无人，1 FPS，省电
- `ALIGNING`：检测到人，0.5 秒对焦提示音，采集基准（调用 `createBaseline`）
- `ACTIVE_STUDY`：静音伴学，10 FPS
- `SESSION_FINISHED`：离座超时，输出报告后回到 `STANDBY`

**离座防误切**
- 连续检测不到人 → 启动 60 秒倒计时；60 秒内回来 → 恢复 `ACTIVE_STUDY`，时长不断档。
- 超过 60 秒 → `SESSION_FINISHED`，输出 `SessionReport`（`durationSeconds` 不含末尾离座的 60 秒）。
- `uprightPercentage` = 端正帧 / 有效帧（`isInterference` 帧不计入分母）。
- `isZeroReminderMaster` = `reminderCount === 0 && durationSeconds >= 600`。

**验收标准 (DoD)**
- [ ] 注入假时钟测试：入画 → 出画 10 秒 → 回画（不结案、时长连续）；出画 65 秒（结案，报告字段正确）。
- [ ] 状态转换 100% 符合预期，覆盖率 ≥ 90%。
