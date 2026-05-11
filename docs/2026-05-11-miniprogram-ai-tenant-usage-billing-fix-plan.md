# 小程序 AI 用量归属租户修复对接文档

日期：2026-05-11

## 背景

租户客户在微信小程序端使用装修 AI 问答时，AI token 用量应计入对应装修公司租户账户。当前多租户体系已经在客户登录 token 中携带 `tenant_id / tenant_slug / customer_id`，但 AI 调用链路没有完整使用该租户上下文。

## 当前核查结论

当前不是完整按租户记账。

- `aiGateway.chat()` 支持写入 `ai_call_logs.tenant_id`。
- `POST /ai/decoration-qa` 调用 `askDecorationQa(result.data)`，未传当前登录态租户。
- `GET /ai/decoration-qa/suggestions` 内部调用 `aiGateway.chat()`，未传 `tenantId`。
- `POST /ai/decoration-qa/stream` 目前走直接 `fetch` 流式调用，不经过 `aiGateway`，不会完整写入 `ai_call_logs`。

因此现状可能是：

- 非流式 AI 问答：有 AI 日志，但 `tenant_id = null`。
- 推荐问题生成：有 AI 日志，但 `tenant_id = null`。
- 流式 AI 问答：可能没有进入统一 AI 用量日志。

## 修复目标

所有租户客户在小程序端产生的 AI 调用，都必须归属到当前租户：

- 写入 `ai_call_logs.tenant_id`。
- 进入 `/usage/summary`、`/usage/ai-logs`、平台租户用量统计。
- 不允许客户把其它租户项目的 AI 调用记到当前租户。
- 无有效租户上下文时，不得记为平台级空租户用量。

## 后端修复方案

### 1. 统一解析 AI 调用租户上下文

在 AI controller 或 service 层新增上下文解析：

```ts
type AiTenantUsageContext = {
  authUserId: string | null;
  tenantId: string | null;
  customerId: string | null;
  employeeId: string | null;
  source: "customer_miniprogram" | "employee_miniprogram" | "visitor" | "admin";
};
```

解析优先级：

1. 如果是客户项目上下文 AI，优先用项目所属 `projects.tenant_id`，并校验项目属于当前客户。
2. 否则使用当前 JWT 的 `tenant_id`。
3. 如果当前账号是客户，但没有租户，返回 403，错误码建议：`AI_TENANT_CONTEXT_MISSING`。
4. visitor 场景可允许 `tenant_id = null`，但必须设置 `billable=false` 或 `source='visitor'`，避免误入租户账单。

### 2. 非流式问答 `/ai/decoration-qa`

当前：

```ts
askDecorationQa(result.data)
```

建议改为：

```ts
askDecorationQa(result.data, {
  authUserId: request.user?.sub,
  tenantId: resolvedTenantId,
  source: "customer_miniprogram",
});
```

并在 `askDecorationQa` 内调用：

```ts
aiGateway.chat({
  sceneCode: "decoration_qa",
  tenantId,
  metadata: {
    source,
    auth_user_id: authUserId,
    customer_id: customerId,
    project_id: input.context?.project_id ?? null,
  },
  ...
});
```

### 3. 推荐问题 `/ai/decoration-qa/suggestions`

当前推荐问题生成会调用：

```ts
aiGateway.chat({
  sceneCode: "decoration_qa_title",
  ...
});
```

需要传入：

```ts
tenantId: resolvedTenantId,
metadata: {
  source: "customer_miniprogram",
  scene,
  project_id: projectId,
  auth_user_id: authUserId,
}
```

注意：

- 命中缓存时不应新增 AI 用量。
- refresh 触发 AI 重新生成时必须记入租户。
- customer + project 场景必须校验项目归属客户，使用项目 `tenant_id`。

### 4. 流式问答 `/ai/decoration-qa/stream`

当前流式链路绕过 `aiGateway`，需要二选一修复：

方案 A：推荐

- 扩展 `aiGateway` 支持 stream。
- 所有模型配置、fallback、日志、token 统计统一由 `aiGateway` 处理。

方案 B：短期

- 保留当前 streaming fetch。
- 在流式完成后写入 `ai_call_logs`：
  - `tenant_id`
  - `scene_code = decoration_qa`
  - `status = success/failure`
  - `prompt_tokens`
  - `completion_tokens`
  - `total_tokens`
  - `source = customer_miniprogram`
  - `metadata.customer_id / project_id / auth_user_id`

如果模型没有返回 usage：

- `total_tokens = null`
- `ai_missing_token_count` 后续统计会体现
- 仍应写入调用日志，方便排查和计费兜底

## Admin 对接说明

Admin 侧不需要新增页面，但需要确认现有用量页面能看到这些记录。

### 需要核对的页面

- 租户后台：`/usage`
- 平台后台：`/platform/usage`
- AI 明细：`/usage/ai-logs`、`/platform/usage/ai-logs`

### 需要展示或确认的字段

AI 日志应能看到：

- 租户
- 场景：`decoration_qa` / `decoration_qa_title`
- 来源：建议显示 `source`
- 模型/provider
- token：prompt / completion / total
- 状态：success / failure
- 时间

如果当前表格没有展示 `source`，建议后续补充展示，便于区分：

- 客户小程序 AI
- 员工小程序 AI
- H5/admin AI
- visitor AI

## 微信小程序对接说明

小程序原则上不需要额外传 `tenant_id`。

必须继续携带：

```http
Authorization: Bearer <token>
```

客户项目上下文问答时，继续传：

```json
{
  "context": {
    "role": "customer",
    "project_id": "项目ID"
  }
}
```

前端不要传租户 ID，租户归属由后端通过登录态和项目归属判断。

### 小程序需要关注的错误码

- `AI_TENANT_CONTEXT_MISSING`：当前账号无法确定装修公司，提示重新登录或联系装修公司。
- `FORBIDDEN`：项目不属于当前客户，提示无权访问。
- `TENANT_NOT_AVAILABLE`：装修公司状态不可用。

## 验收用例

### 用例 1：客户普通 AI 问答计入租户

1. 客户登录小程序。
2. 调用 `POST /ai/decoration-qa`。
3. 查询 `ai_call_logs`。

预期：

- 新增日志 `tenant_id = 当前客户所属租户`。
- `scene_code = decoration_qa`。
- token 字段能记录则记录，不能记录则 `missing_token_count` 后续可统计。

### 用例 2：客户项目流式问答计入项目租户

1. 客户登录小程序。
2. 调用 `POST /ai/decoration-qa/stream`，context 带 `project_id`。
3. 查询 `ai_call_logs`。

预期：

- 新增日志 `tenant_id = projects.tenant_id`。
- metadata 包含 `project_id` 和 `customer_id`。
- 非当前客户项目返回 403，不写入其它租户账。

### 用例 3：推荐问题刷新计入租户

1. 客户打开 AI 推荐问题。
2. refresh=false 命中缓存时，不新增 AI 日志。
3. refresh=true 触发生成。

预期：

- refresh=true 新增 `decoration_qa_title` 日志。
- `tenant_id` 为当前租户。

### 用例 4：租户用量页可见

1. 产生客户小程序 AI 调用。
2. 打开 admin `/usage`。

预期：

- AI 调用次数增加。
- token 统计增加。
- AI 明细可查到对应调用。

## 实施顺序建议

1. 后端补 `AiTenantUsageContext` 解析。
2. 非流式 `/ai/decoration-qa` 传 `tenantId`。
3. 推荐问题生成传 `tenantId`。
4. 流式 `/ai/decoration-qa/stream` 纳入日志。
5. Admin 用量页面确认字段展示。
6. 小程序只做错误码提示兼容，不传租户 ID。
