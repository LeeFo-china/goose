# 抖音客户项目登录提示优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 明确客户登录页登录的是装修客户项目，并将未关联手机号准确提示为没有关联装修项目。

**Architecture:** 保留现有抖音手机号授权、短信验证和客户身份匹配链路。客户登录页面仅按稳定的 `ApiRequestError.code` 映射预期业务结果，未知异常继续使用安全兜底；页面模板统一采用“客户项目”语义。

**Tech Stack:** 抖音原生小程序、TypeScript、TTML、Bun Test

---

### Task 1: 客户项目登录错误映射

**Files:**
- Modify: `apps/douyin-mini/src/pages/customer-login/page.test.ts`
- Modify: `apps/douyin-mini/src/pages/customer-login/page.ts`

- [ ] **Step 1: 写入未关联项目的失败测试**

在页面测试中让抖音手机号授权和短信验证分别抛出：

```ts
new ApiRequestError(
  404,
  "CUSTOMER_CONTEXT_MISSING",
  "该手机号未匹配到客户项目，请联系装修公司确认预留手机号",
)
```

断言两种入口均显示：

```ts
"未找到关联项目。该手机号尚未关联装修项目，请联系装修公司确认预留手机号。"
```

- [ ] **Step 2: 运行测试并确认按旧通用提示失败**

Run: `bun test apps/douyin-mini/src/pages/customer-login/page.test.ts`

Expected: FAIL，实际值仍为“客户登录失败，请重试”或短信登录旧提示。

- [ ] **Step 3: 实现稳定错误码映射**

在 `page.ts` 中导入 `ApiRequestError`，增加纯函数：

```ts
function resolveCustomerProjectLoginError(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError && error.code === "CUSTOMER_CONTEXT_MISSING") {
    return "未找到关联项目。该手机号尚未关联装修项目，请联系装修公司确认预留手机号。";
  }
  return fallback;
}
```

让 `runAuth` 的 `catch` 接收异常，并通过该函数设置 `loginError`。抖音授权和短信验证的兜底文案统一为“登录客户项目失败，请稍后重试”。身份选择继续保留现有提示。

- [ ] **Step 4: 运行页面测试并确认通过**

Run: `bun test apps/douyin-mini/src/pages/customer-login/page.test.ts`

Expected: PASS，0 failures。

### Task 2: 明确页面的客户项目语义

**Files:**
- Modify: `apps/douyin-mini/src/pages/customer-login/index.json`
- Modify: `apps/douyin-mini/src/pages/customer-login/index.ttml`
- Modify: `apps/douyin-mini/src/pages/customer-login/page.test.ts`

- [ ] **Step 1: 写入页面文案契约测试**

读取 JSON 和 TTML 源文件，断言包含设计中的导航标题、页面标题、说明、按钮、短信入口和底部说明，并断言不再包含“使用抖音手机号登录”。

- [ ] **Step 2: 运行测试并确认旧文案导致失败**

Run: `bun test apps/douyin-mini/src/pages/customer-login/page.test.ts`

Expected: FAIL，缺少新的客户项目文案。

- [ ] **Step 3: 修改页面文案**

使用以下确定文案：

```text
登录客户项目
查看我的装修项目
使用装修公司预留的手机号，查找并登录您关联的装修项目
授权抖音手机号并登录项目
正在查找项目
使用其他手机号登录项目
手机号仅用于核验并查找您关联的装修项目
```

- [ ] **Step 4: 运行页面测试并确认通过**

Run: `bun test apps/douyin-mini/src/pages/customer-login/page.test.ts`

Expected: PASS，0 failures。

### Task 3: 完整验证与提交

**Files:**
- Verify: `apps/douyin-mini`
- Modify: `docs/superpowers/plans/2026-09-17-douyin-customer-project-login-copy.md`

- [ ] **Step 1: 运行抖音小程序完整检查**

Run: `bun run --cwd apps/douyin-mini check`

Expected: 所有测试通过，TypeScript 类型检查通过。

- [ ] **Step 2: 检查变更边界**

Run: `git diff --check && git status --short && git diff --stat`

Expected: 只包含客户登录页、测试和本计划文件，无空白错误，无 Orange 仓库改动。

- [ ] **Step 3: 更新计划勾选状态并提交**

Run:

```bash
git add apps/douyin-mini/src/pages/customer-login/index.json \
  apps/douyin-mini/src/pages/customer-login/index.ttml \
  apps/douyin-mini/src/pages/customer-login/page.ts \
  apps/douyin-mini/src/pages/customer-login/page.test.ts \
  docs/superpowers/plans/2026-09-17-douyin-customer-project-login-copy.md
git commit -m "fix(douyin): 明确客户项目登录结果"
```

Expected: 提交成功且工作区干净。
