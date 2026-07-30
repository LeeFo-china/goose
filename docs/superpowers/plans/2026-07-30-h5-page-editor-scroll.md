# H5 活动编辑页滚动修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Admin 固定视口中 H5 活动编辑页下部被裁掉的问题。

**Architecture:** 保留 AdminShell 的全局固定视口策略，在共享
`H5PageEditor` 根容器建立自身的高度约束和纵向滚动边界。平台超管与
装企端继续复用同一组件，因此一处修复同时覆盖两个入口。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、Bun Test

---

### Task 1: 建立编辑器滚动边界

**Files:**
- Create: `apps/admin/components/marketing/h5-page-editor-layout.test.ts`
- Modify: `apps/admin/components/marketing/h5-page-editor.tsx:43-45`

- [ ] **Step 1: 写入失败的布局回归测试**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const editorSource = readFileSync(
  new URL("./h5-page-editor.tsx", import.meta.url),
  "utf8",
);

describe("H5 page editor layout", () => {
  test("owns vertical scrolling inside the fixed admin shell", () => {
    expect(editorSource).toContain(
      'className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6"',
    );
  });
});
```

- [ ] **Step 2: 运行测试并确认因缺少滚动边界而失败**

Run:

```bash
bun test apps/admin/components/marketing/h5-page-editor-layout.test.ts
```

Expected: FAIL，实际根容器仍是 `className="flex flex-col gap-4"`。

- [ ] **Step 3: 实施最小布局修复**

将 `H5PageEditor` 根容器修改为：

```tsx
<div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-6">
```

不修改三栏网格、业务状态、请求接口或 AdminShell。

- [ ] **Step 4: 运行回归测试并确认通过**

Run:

```bash
bun test apps/admin/components/marketing/h5-page-editor-layout.test.ts
```

Expected: 1 pass，0 fail。

- [ ] **Step 5: 运行 Admin 静态与生产构建验证**

Run:

```bash
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
```

Expected: 文件大小检查、类型检查、生产构建和差异检查均以状态码 0 完成；
构建清单包含两个 H5 编辑路由。

- [ ] **Step 6: 运行页面运行态检查**

确认 Admin 服务监听端口后，请求平台 H5 编辑入口，验证路由能够由 Next.js
正常处理。浏览器实例可用时，分别在桌面和窄视口滚动到编辑器底部；浏览器
不可用时记录该限制，不把 HTTP 检查表述为视觉验收。

- [ ] **Step 7: 提交修复**

```bash
git add \
  apps/admin/components/marketing/h5-page-editor-layout.test.ts \
  apps/admin/components/marketing/h5-page-editor.tsx
git commit -m "fix(admin): 修复H5编辑页底部截断"
```
