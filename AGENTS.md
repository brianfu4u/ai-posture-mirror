# AGENTS.md — Codex 开发规约

本文件是 Codex / AI 编码代理在本仓库工作的强制规约。

## 工作方式
- 一次只做一个工单（`docs/work-orders/WO-N.md`，对应 GitHub Issue #N）。分支命名 `wo-N-<short-name>`，PR 标题 `WO-N: <标题>`，PR 描述中 `Closes #N`。
- 严格遵守工单中的“目标文件”和“输入/输出契约”。需要改 `packages/algorithm-core/src/types.ts` 时，必须在 PR 中单独说明原因。
- 每条验收标准（DoD）必须在 PR 描述中逐条勾选，并附测试输出或截图。

## 代码规范
- TypeScript strict（见 `tsconfig.base.json`），禁止 `any`，禁止 `// @ts-ignore`。
- `packages/*` 不得依赖 DOM 或 UI；浏览器 API 只在 `apps/*` 中使用。
- 所有阈值放在常量或配置中，不得硬编码在逻辑里。
- 时间相关逻辑必须支持注入时钟（`clock: () => number`），测试中不得真实等待。
- 测试使用 Vitest，放在 `test/` 目录。

## 必须通过
```bash
pnpm install
pnpm typecheck
pnpm test
```

## 红线
- 不得上传、存储或记录任何摄像头画面或关键点原始序列。
- 不得提交任何密钥；使用 `.env.example` 中列出的变量名。
- 不得使用或模仿受版权保护的音效（如小黄人、马里奥），只能原创合成或 CC0，并登记在 `packages/audio-assets/LICENSES.md`。
- UI 与文案中照度值为“估算”，不得宣称医疗效果或精确测光。
- 用户可见文案必须同时提供 zh-CN / zh-TW / en-US / ja-JP 四语（`packages/i18n`）。
