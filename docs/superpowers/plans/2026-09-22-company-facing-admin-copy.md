# 公司侧 Admin 文案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将公司员工可见的 Admin 文案从“租户”统一调整为“公司”，并保留平台超管侧的“租户”术语。

**Architecture:** 以路由受众为边界审计字符串，只修改 JSX、提示映射和错误兜底中的用户可见文本。内部 `tenant` 标识及平台管理页面保持不变；共享组件按调用场景核对后决定是否改文案。

**Tech Stack:** Next.js、TypeScript、React、shadcn/ui、Tailwind CSS。

---

### Task 1：审计并修改公司侧文案

**Files:**
- Modify: `apps/admin/app/(console)/dashboard/dashboard-sections.tsx`
- Modify: `apps/admin/app/(console)/dashboard/dashboard-data.ts`
- Modify: company-facing files identified by `rg` under `apps/admin/app/(console)` and `apps/admin/components`

- [ ] 将概览标题和错误兜底改为“公司概览”。
- [ ] 将公司侧页面的用户可见“租户”表述按设计规则改为“公司”。
- [ ] 保留平台超管页面、内部变量、接口、权限和数据库术语。

### Task 2：验证边界

**Files:**
- Review: `apps/admin/app/(console)/platform/**`
- Review: `apps/admin/components/platform-*/**`

- [ ] 使用 `rg` 复查公司侧残留文本，并逐项确认共享组件受众。
- [ ] 运行 `bun run --cwd apps/admin check`。
- [ ] 运行 `bun run --cwd apps/admin build`。
- [ ] 运行 `git diff --check` 并检查最终差异。

### Task 3：集成与生产发布

- [ ] 提交聚焦的 Conventional Commit。
- [ ] 合并到 `main` 并推送远端。
- [ ] 按仓库生产候选构建与部署流程发布 Admin。
- [ ] 核对生产部署结果与 `/dashboard` 页面。

