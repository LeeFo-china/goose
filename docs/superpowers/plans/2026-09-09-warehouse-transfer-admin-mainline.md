# 调拨 Admin 主线集成 Implementation Plan

> **For agentic workers:** Use subagent-driven-development with SPEC then quality review. User approved current-mainline integration and DEV Admin release; no production or Orange writes.

**Goal:** 在当前主线保留采购工作台更新的前提下恢复调拨 Admin，再继续真实 DEV 验收。

**Architecture:** 仅移植已审查的 `2f20df15`、`e20387a1` 中 Admin 差异；不重发旧整树，不改 API、Domain、迁移、依赖或发布流程。既有工作区切换到基于 `43cb38bf` 的 `feature/warehouse-transfer-admin-mainline`。

**Tech Stack:** Bun、Next.js、React、现有 shadcn/Radix、Playwright、现有 Release Dev workflow。

## Task 1：最小集成

文件范围：`apps/admin/components/warehouse-transfers/*`、`app/(console)/warehouse-transfers/page.tsx`；既有 inventory、supplier settings、platform tenant rollout、layout menu 对应差异；调拨/rollout E2E 与调拨 Playwright 配置。

- [x] 获取远端 main，确认 `43cb38bf` 与 DEV API/Admin 实际版本一致；旧分支排障证据保存于 `a8048208`，未丢弃用户变更。
- [x] 运行当前主线相关单测和 Admin check；先恢复已有回归测试并观察缺少调拨实现的 RED，再恢复既有实现。
- [x] 运行受影响单测及 `bun run check`；独立 SPEC 后质量审查。对比 `git diff 43cb38bf -- apps/api packages/domain supabase` 必须为空，采购工作台文件亦无差异。
- [x] 静态通过后跑调拨、库存、rollout 桌面/375px E2E，并追加采购工作台受影响回归；模拟测试不代替真实验收。

## Task 2：固定候选与 DEV Admin 发布

- [ ] 发布前重查 main、DEV 容器 SHA、活动 workflow、磁盘和只读业务基线，防止集成期间再有覆盖。
- [x] 确认 migration list Local/Remote 对齐；本批无 migration，不执行 apply。
- [ ] 集成提交后推送功能分支和唯一固定 release 分支，通过 `gh workflow run release-dev.yml --ref <固定候选分支> -f service=admin -f operation=release` 仅发布 Admin。不合并 main、不触发生产。
- [ ] 等待 workflow success，并核对实际 Admin SHA/digest/健康、API 仍为发布前版本、迁移门禁与业务基线。回滚只能通过既有流程重发发布前固定 SHA，不做数据回滚。

## Task 3：真实 Chrome 验收

- [ ] Chrome 访问调拨页不再 404，核对指定租户、既有权限员工与明确测试 SKU。
- [ ] 具备现有权限时正常 UI 配置测试开关和双仓，执行正常/反向调拨，核对数量/价值守恒和项目成本/应付/付款未变化；结束关闭开关。不得自动赋权或直接 SQL 修库。
- [ ] 记录实际结果与未完成门禁。D1 真实验收未满足不得进入 D2。
