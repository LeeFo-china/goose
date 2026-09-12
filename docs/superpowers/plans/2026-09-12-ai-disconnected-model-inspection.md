# 未接通场景模型浏览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 装修生图未接通时仍可浏览供应商的已登记模型、调用名称、能力状态及不可绑定原因，保持服务端绑定保护。

**Architecture:** 复用分页 route-model-options GET，增加显式只读 inspect 视图，避免触发手工候选或外部目录。前端将浏览状态与真实绑定分离；未接通场景展示只读列表，不用不可打开的下拉框承担信息展示。现有主备模型保持原样，浏览动作只发 GET。

**Tech Stack:** Fastify/Zod、现有 repository、React/shadcn/Radix、Bun、现有 Playwright mock fixture。

## 范围和设计约束

- 用户已批准“可查看与可绑定分开”。不改 registry、migration、真实模型模态或权限，不部署，不调用模型，不新增依赖。
- 已定位根因：not_connected 同时触发 bindingDisabled、loadCandidates 早退，且 image 过滤隐藏当前 text 记录。
- 保留创建/修改 API 的 `AI_SCENE_RUNTIME_NOT_CONNECTED` 和数据库约束。不得把浏览记录变成选中模型或触发 resolve。
- 本轮只改变未接通场景的浏览体验；已接通文本场景继续使用原有模态筛选和选择流程。
- 不把 unverified/stale 或已登记模态当成厂商能力已核实。明确显示“已登记模型，非供应商完整目录”。

## Task 1：只读分页视图

Files: `apps/api/src/schema/ai-config.ts`、`apps/api/src/services/ai-config/index.ts`、邻近 `index.test.ts`。复用 `apps/api/src/repositories/ai-config.ts` 的有界查询。

- [x] 写 service 测试：inspect 带 keyword 时只返回内部记录，没有 manual/catalog，分页大小保持 20；允许显示 text、image 和 inactive 记录。不调用外部目录，不写模型。
- [x] 跑 RED：`cd apps/api && bun test src/services/ai-config/index.test.ts`，确认失败来自缺少 inspect 分支。
- [x] Query 增加可选字段，旧调用不变：

```ts
view: z.enum(["inspect"]).optional(),
```

- [x] service 已完成权限/provider 校验后，inspect 分支在创建手工候选/目录查询之前返回内部分页结果。浏览不强加 active 状态，调用方不传 modality，以显示不匹配项：

```ts
const inspection = query.view === "inspect";
const internalOptions = await this.requireConfigRepository("listRouteModels")
  .call(this.configRepository, provider.id, {
    ...query, status: inspection ? query.status : query.status ?? "active",
  });
if (inspection) return internalOptions;
```

- [x] 跑 GREEN 与现有路由 policy 回归；inspect 参数没有进入写路由/resolve 合同。

## Task 2：浏览与绑定状态隔离

Files: `apps/admin/components/platform-ai/use-ai-route-editor.ts`、`use-ai-route-model-options.ts`、`ai-model-route-tab.tsx`、`ai-route-model-selector.tsx`、`ai-config-types.ts`。可新增小型 `ai-route-model-inspection.tsx` 专责列表呈现，不新建通用组件体系。

- [x] 先写组件 RED：未接通时供应商与搜索可用，模型名称及“不匹配”“能力待核实”“未接通”可见；没有可绑定按钮。
- [x] 列表请求保留 page/pageSize/keyword，浏览时使用 `view=inspect`，不传 image/status 过滤：

```ts
const params = new URLSearchParams({ page: String(page), pageSize: "20" });
if (inspection) params.set("view", "inspect");
else { params.set("modality", form.modality); params.set("status", "active"); }
```

- [x] 编辑或切换未接通场景自动加载；主备各自的请求序号防止旧供应商、旧页码、旧场景响应回写。
- [x] 未接通场景切换浏览供应商和关键词只影响列表，不清空/替换 current model IDs、option value 或 selected 原绑定。保存其他元数据时原绑定不变，不能调用 resolve。
- [x] 仅 selection/save lock 阻断变更，浏览列表显示 loading/error/empty/retry/pagination。错误不显示旧供应商候选，不把失败当空结果。
- [x] 只读列表显示实际调用名称、已登记输出模态、已登记输入模态、验证状态和不可绑定原因；不显示内部 UUID、密钥或伪造官方能力。长 ID 自动换行。
- [x] 未绑定时明确显示“尚未绑定主模型”；已有绑定单独保留摘要，浏览其他供应商不能把其伪装成当前绑定。
- [x] 沿用原有只读账号权限边界；不开放原先没有的编辑/保存入口，不扩大目录能力。

## Task 3：真实页面 + mock 边界回归

Files: `apps/admin/e2e/ai-model-routes.spec.ts`、`ai-provider-secrets-mock-backend.mjs`、邻近组件测试。

- [x] mock 增加 raw_unbound / inspect 列表 fixture；使用普通合成型号，不拷贝真实账号或凭据。
- [x] E2E RED 断言思路：

```ts
await expect(page.getByLabel("主模型供应商", { exact: true })).toBeEnabled();
await expect(page.getByText("尚未绑定主模型", { exact: true })).toBeVisible();
await expect(page.getByText("文本模型不匹配图片场景", { exact: false })).toBeVisible();
const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
expect(writes).toHaveLength(0);
```

- [x] 补旧有效绑定：切换供应商、搜索、翻页后保存其他字段，主备 ID 原样；读操作没有 resolve/POST/PATCH。
- [x] 补空结果、失败重试、搜索超过一页、迟到结果丢弃、切回文本恢复选择、400px 截图及无横向溢出。
- [x] 启动浏览器前先跑 `pnpm --dir apps/admin check` 和 API typecheck。
- [x] 跑完整 `pnpm exec playwright test --config playwright.ai-provider-secrets.config.ts`；不削弱旧密钥/删除/权限回归。
- [x] 复核截图及 spec/quality 审查，记录实际结果；本地 mock 不冒充开发超管实连。
- [x] 精确提交本批文件，保留此前未提交的只读核验文档，不 push/发布/改 release 分支。

验证记录：`docs/operations/evidence/2026-09-12-ai-disconnected-model-inspection.md`。本次保留当前分支和 worktree，不做合并或清理。
