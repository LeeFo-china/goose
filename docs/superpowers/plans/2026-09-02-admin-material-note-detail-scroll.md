# 租户后台资料笔记详情滚动修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复租户后台资料笔记详情页长内容被裁切且无法滚动的问题。

**Architecture:** 保持 `AdminShell` 的全局 `overflow-hidden` 边界不变，让
`MaterialNoteDetail` 根容器成为该页面唯一的纵向滚动区域。通过现有源码合同测试锁定
完整高度、flex 收缩、纵向滚动和稳定滚动条占位，不修改接口、编辑器或页面数据流。

**Tech Stack:** Next.js、React、Tailwind CSS、shadcn/ui、Bun Test、pnpm

---

## 文件结构

- 修改 `apps/admin/components/douyin-miniapp/material-note-ui.test.tsx`：增加详情页滚动边界回归合同。
- 修改 `apps/admin/components/douyin-miniapp/material-note-detail.tsx`：补齐根容器的高度和纵向滚动类。
- 不新增业务组件，不修改 `AdminShell`、API、数据库或抖音小程序。

### Task 1: 以失败测试复现详情页缺少滚动边界

**Files:**
- Test: `apps/admin/components/douyin-miniapp/material-note-ui.test.tsx`

- [ ] **Step 1: 写入失败合同测试**

在“抖音资料后台工作台 UI 合同”测试组中增加：

```tsx
test("详情页在后台固定视口内提供唯一纵向滚动区域", () => {
  const detail = read("components/douyin-miniapp/material-note-detail.tsx");
  expect(detail).toContain(
    'className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]"',
  );
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
pnpm --dir apps/admin exec bun test components/douyin-miniapp/material-note-ui.test.tsx
```

Expected: 新测试失败，实际源码仍为
`className="flex flex-col gap-5 pb-6"`；其他既有测试通过。

### Task 2: 为详情页补齐页面级滚动容器

**Files:**
- Modify: `apps/admin/components/douyin-miniapp/material-note-detail.tsx:144`
- Test: `apps/admin/components/douyin-miniapp/material-note-ui.test.tsx`

- [ ] **Step 1: 实施最小修复**

将详情组件最外层容器改为：

```tsx
<div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]">
```

不修改其余组件结构、状态或请求逻辑。

- [ ] **Step 2: 运行聚焦测试并确认通过**

Run:

```bash
pnpm --dir apps/admin exec bun test components/douyin-miniapp/material-note-ui.test.tsx
```

Expected: 资料笔记 UI 合同全部通过，0 fail。

- [ ] **Step 3: 运行 Admin 静态门禁**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: lint、TypeScript 和相关 Admin 检查均以 exit 0 完成。

- [ ] **Step 4: 运行生产构建**

Run:

```bash
pnpm --dir apps/admin build
```

Expected: Next.js 构建成功，详情路由编译完成，exit 0。

- [ ] **Step 5: 提交单一缺陷修复**

```bash
git add \
  apps/admin/components/douyin-miniapp/material-note-ui.test.tsx \
  apps/admin/components/douyin-miniapp/material-note-detail.tsx
git diff --cached --check
git commit -m "fix(admin): 修复资料详情内容截断"
```

Expected: 提交只包含测试和详情根容器两处源码变更。

### Task 3: 集成 main、发布 Admin dev 并复测

**Files:**
- No source file changes.

- [ ] **Step 1: 核对提交范围并推送 main**

Run:

```bash
git status --short --branch
git diff origin/main...HEAD --check
git log --oneline origin/main..HEAD
git push origin HEAD:main
```

Expected: 未跟踪的抖音交接文档未进入提交；`main` 快进到设计、计划和修复提交。

- [ ] **Step 2: 发布 Admin dev**

Run:

```bash
gh workflow run release-dev.yml --ref main \
  -f service=admin \
  -f operation=release \
  -f reason="修复资料笔记详情内容截断"
```

Expected: Release Dev 的 build、migration verify、Admin deploy 和 readiness 全部成功。

- [ ] **Step 3: 核对 dev revision**

Run:

```bash
release_run_id="$(gh run list --workflow "Release Dev" --branch main \
  --event workflow_dispatch --limit 1 --json databaseId \
  --jq '.[0].databaseId')"
test -n "${release_run_id}"
gh run watch "${release_run_id}" --exit-status
gh run view "${release_run_id}" --json status,conclusion,headSha,url
```

Expected: workflow 结论为 `success`，`headSha` 等于本次 `main` 的完整 40 位 SHA；工作流
日志中的 Admin 容器 revision 与该 SHA 一致，且
`https://admin-dev.goodcms.cn/login` readiness 为 200。

- [ ] **Step 4: 浏览器视觉复测**

在可用的已登录浏览器打开：

```text
https://admin-dev.goodcms.cn/douyin-miniapp/materials/d3fe5cda-7b44-4699-ab9d-1455b6658434
```

依次验证：

1. 页面出现纵向滚动条；
2. 可以滚动到正文编辑器最底部并看到全部操作；
3. 切换版本后仍可滚动且无横向跳动；
4. 缩窄视口后底部内容仍可访问；
5. 页面只有一个主纵向滚动区域。

Expected: 五项全部通过。若浏览器仍不可用，则如实标记视觉复测待执行，不得仅凭静态测试
声称 dev 页面已经完成视觉验收。
