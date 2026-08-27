# Admin Candidate Deploy Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生产候选部署入口始终可发现，并让发布记录中的候选操作定位到对应部署区。

**Architecture:** 保留现有 `ReleaseCandidateEvidence` 作为唯一候选读取和部署入口，将其渲染条件与发布表单环境解耦。发布记录通过父组件回调选择候选、切换服务发布标签并滚动到证据区。

**Tech Stack:** Next.js、React、TypeScript、Zustand、shadcn/ui、Bun test

---

### Task 1: 固化交互契约

**Files:**
- Modify: `apps/admin/components/ops/release-deployments-workbench.test.ts`

- [x] **Step 1: Write the failing test**

增加断言，要求工作台包含候选定位处理函数、`scrollIntoView`、始终渲染的候选证据区，并要求记录行文案为“部署候选”。

- [x] **Step 2: Run test to verify it fails**

Run: `bun test components/ops/release-deployments-workbench.test.ts`

Expected: FAIL，因为当前候选区受 `production` 条件控制，且没有定位处理函数。

### Task 2: 实现可发现的候选部署入口

**Files:**
- Modify: `apps/admin/components/ops/release-candidate-evidence.tsx`
- Modify: `apps/admin/components/ops/release-deployments-panel.tsx`
- Modify: `apps/admin/components/ops/release-deployments-sections.tsx`

- [x] **Step 1: Add a stable evidence section ID**

从候选组件导出稳定 DOM ID，并设置到候选证据 `<section>`。

- [x] **Step 2: Decouple candidate evidence from environment selection**

在服务发布标签中无条件渲染 `Separator` 和 `ReleaseCandidateEvidence`，继续使用最新或用户选择的可部署候选。

- [x] **Step 3: Connect the release row action**

父组件回调设置候选 Run ID、切换到 `service-release`，并在下一帧调用 `scrollIntoView({ behavior: "smooth", block: "start" })`。记录行按钮文案改为“部署候选”。

- [x] **Step 4: Run the focused test**

Run: `bun test components/ops/release-deployments-workbench.test.ts`

Expected: PASS。

### Task 3: 验证与交付

**Files:**
- Verify: `apps/admin/components/ops/*.test.ts`

- [x] **Step 1: Run Admin ops tests**

Run: `bun test components/ops`

Expected: 全部通过。

- [x] **Step 2: Run Admin checks and build**

Run: `bun run check`

Run: `bun run build`

Expected: 两个命令均退出码 0。

- [ ] **Step 3: Commit and merge**

提交聚焦变更，推送分支，创建 PR，并 squash merge 到 `main`。

- [ ] **Step 4: Verify development deployment**

监控 main 对应的构建和自动开发部署成功；登录开发环境后确认 `/ops?tab=releases` 包含“部署此构建到生产”，并确认候选接口返回 `ready_to_deploy=true`。
