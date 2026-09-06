# 城市合伙人审核交互 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 补齐待审核城市合伙人的审核启用入口，验证后只合并本地 main。

**Architecture:** 复用 Admin MutationDialogButton 与现有状态 PATCH。页面计算权限，表格传递权限，新按钮负责固定 active 命令与审核上下文。只为此流程补强共用弹窗同步防重复提交及 textarea 长度属性。

**Tech Stack:** Next.js、React、现有 shadcn/Radix、Bun test、Playwright，本地 HTTP mock。

---

### Task 1: 审核入口与回归测试

**Files:**
- Create: `apps/admin/components/platform-partners/platform-partner-approval-action.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-actions.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-tables.tsx`
- Modify: `apps/admin/app/(console)/platform/partners/page.tsx`
- Test: `apps/admin/components/platform-partners/platform-partner-page-layout.test.ts`

- [ ] 在现有测试追加入口接线断言并运行，确认缺失入口导致失败：

```ts
expect(readSource('./platform-partner-tables.tsx')).toContain('ApprovePartnerButton');
```

- [ ] 页面计算并传递 `canManagePartners`：

```ts
const canManagePartners = session.permissions.some(
  (permission) => permission.code === 'platform.partner.manage',
);
```

- [ ] 新按钮复用 MutationDialogButton，条件 `!canManagePartners || partner.status !== 'pending'` 返回 null。弹窗展示名称、联系人、手机号和区域；无区域禁用。使用必填说明字段 maxLength=300，描述说明覆盖备注，固定状态 active：

```tsx
endpoint={`/platform/partners/${partner.id}/status`}
method="PATCH"
buildPayload={(formData) => ({ status: 'active', reason: stringField(formData, 'reason') })}
```

- [ ] 共用弹窗使用 useRef 同步锁，检查 submitDisabled 后才请求，finally 解锁；Textarea 透传 FieldConfig.maxLength。保留现有错误及 deferred refresh。
- [ ] `bun test --cwd apps/admin components/platform-partners` 应全部通过。`bun run --cwd apps/admin typecheck`、`bun run --cwd apps/admin check:file-size` 应退出 0。
- [ ] 自查并提交，只暂存任务文件，中文 Conventional Commit。

### Task 2: 浏览器交互与合并

**Files:**
- Create: `apps/admin/e2e/partner-approval-mock-backend.mjs`
- Create: `apps/admin/e2e/partner-approval-workflow.spec.ts`
- Create: `apps/admin/playwright.partner-approval.config.ts`

- [ ] 沿用 customer-leads Playwright 结构，分别绑定 127.0.0.1:3989（mock）和 3039（Admin），独立 `.next-e2e/partner-approval`。mock 提供鉴权、分页合伙人及区域查询、状态 PATCH 与测试请求记录。
- [ ] 真实页面打开 `/platform/partners?tab=partners&partnerPageSize=6`，验证按钮、取消、成功 active 刷新，断言请求仅 `{status:'active',reason:'审核说明'}`；只读及其他状态无入口。区域失败保留说明，无区域禁用，maxlength=300，重复 submit 仅一条请求。窄屏检查弹窗边界。
- [ ] 静态检查通过后运行 `bunx playwright test --config=playwright.partner-approval.config.ts`（apps/admin）；检查截图。仅 mock 承接写请求。
- [ ] 依次做规格审查和代码质量审查，修复重要问题，再跑上述验证，记录证据。
- [ ] 在根工作区核对 main 未出现冲突改动，`git merge --ff-only fix/partner-approval-interaction`；如 main 前进则先审查差异、合并并重新验证。合并后重跑合伙人测试和类型检查。
- [ ] 保留用户原有未提交文档，不执行 push/deploy；仅在确认本次 worktree 干净且已合并后清理本次工作树。
