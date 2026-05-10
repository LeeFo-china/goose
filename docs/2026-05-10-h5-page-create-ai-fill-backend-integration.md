# H5 活动页新建 AI 辅助后端对接文档

## 1. 目标

在 admin 后台“新建 H5 活动页”弹窗中，运营人员输入活动要求后，后端调用 AI 生成新建表单内容：

- 页面标题 `title`
- 页面描述 `description`

前端拿到结果后直接回填到文本框，用户仍可继续手动修改。

MVP 不让 AI 生成活动路径 `slug`，也不直接生成完整页面 `config`。活动路径继续由前端自动随机生成，完整页面内容进入编辑器后再用模块级 AI 辅助。

## 2. API 设计

### 2.1 租户后台

```http
POST /marketing-pages/ai-fill-create
```

### 2.2 平台后台

```http
POST /platform/marketing-pages/ai-fill-create
```

两个入口共享同一个底层 AI service，只在权限和上下文数据 scope 上分流。

```text
租户接口 /marketing-pages/ai-fill-create
平台接口 /platform/marketing-pages/ai-fill-create
        ↓
fillMarketingPageCreateWithAi()
        ↓
AI Gateway / provider
```

## 3. 权限规则

### 3.1 租户后台

- 必须登录。
- 必须具备 `marketing_page.create` 权限。
- 只能读取当前 `tenant_id` 下已有 H5 页面作为上下文。

### 3.2 平台后台

- 必须登录。
- 必须是 `platform_admin`。
- 只能读取 `tenant_id IS NULL` 的平台 H5 页面作为上下文。

## 4. 请求参数

```json
{
  "instruction": "面向郑州老房翻新客户，突出免费量房、限时优惠、预约咨询"
}
```

建议 schema：

```ts
export const MarketingPageCreateAiFillSchema = z.object({
  instruction: z
    .string()
    .trim()
    .min(4, "请输入更具体的活动要求")
    .max(1000, "活动要求不能超过 1000 字"),
});
```

## 5. 成功响应

```json
{
  "title": "老房翻新限时预约",
  "description": "预约免费量房，获取专属翻新方案和活动权益。"
}
```

字段限制：

- `title`：不超过 30 个中文字符。
- `description`：不超过 80 个中文字符。
- 不返回 `slug`。
- 不返回页面配置 `config`。

## 6. 后端实现位置

### 6.1 Schema

文件：

```text
apps/api/src/schema/marketing-pages.ts
```

新增：

```ts
MarketingPageCreateAiFillSchema
```

### 6.2 AI Service

文件：

```text
apps/api/src/services/marketing-page-ai.ts
```

新增方法：

```ts
fillMarketingPageCreateWithAi(input: {
  scope: "tenant" | "platform";
  instruction: string;
  tenantName?: string | null;
  pages: Array<{
    title: string;
    slug: string;
    status: string;
    description: string | null;
  }>;
}): Promise<{
  title: string;
  description: string;
}>
```

### 6.3 Controller

文件：

```text
apps/api/src/controllers/marketing-pages/index.ts
```

新增路由：

```ts
POST /marketing-pages/ai-fill-create
POST /platform/marketing-pages/ai-fill-create
```

controller 只负责：

- 获取登录态。
- 校验权限。
- 校验 body。
- 查询或调用 service 获取上下文。
- 调用 `fillMarketingPageCreateWithAi()`。
- 用 `ResponseHandler.success()` 返回。

## 7. Prompt 设计

后端 prompt 需要注入：

```text
你正在为装修公司后台生成 H5 营销活动页的新建表单内容。

业务场景：
- 装修公司获客活动
- 用户会在微信小程序 web-view 或 H5 页面中看到
- 目标是让客户愿意留下联系方式

生成字段：
- title：页面标题，不超过 30 个中文字符
- description：页面描述，不超过 80 个中文字符

写作要求：
- 清晰、可信、偏转化
- 不夸大承诺
- 不使用“百分百”“保证”等绝对化表达
- 不生成价格虚假承诺
- 不生成链接、手机号、二维码
- 不生成 Markdown
- 只返回 JSON

当前 scope：
{{scope}}

租户名称：
{{tenantName}}

用户具体要求：
{{instruction}}

已有 H5 页面：
{{pages}}
```

AI 输出必须强制 JSON：

```json
{
  "title": "string",
  "description": "string"
}
```

## 8. 上下文数据隔离

### 8.1 租户上下文查询

```sql
SELECT title, slug, status, description
FROM marketing_pages
WHERE tenant_id = 当前租户
  AND status != 'archived'
ORDER BY updated_at DESC
LIMIT 20;
```

### 8.2 平台上下文查询

```sql
SELECT title, slug, status, description
FROM marketing_pages
WHERE tenant_id IS NULL
  AND status != 'archived'
ORDER BY updated_at DESC
LIMIT 20;
```

## 9. 错误处理

错误响应必须经过 `error-factory.ts` 包装，不直接 `throw new Error()`。

建议错误：

| 场景 | HTTP | 建议文案 |
| --- | --- | --- |
| 未登录 | 401 | 请先登录 |
| 无权限 | 403 | 无权使用 H5 活动页 AI 生成 |
| `instruction` 不合法 | 400 | 请输入更具体的活动要求 |
| AI provider 异常 | 502 | AI 生成失败，请稍后重试 |
| AI 返回格式不可解析 | 502 | AI 生成结果格式异常，请重新生成 |

## 10. 前端交互约定

前端调用成功后：

- 把 `title` 回填到页面标题输入框。
- 把 `description` 回填到页面描述输入框。
- 不修改 `slug`。
- 显示“重新生成”入口。
- 保留“一键撤销本次 AI 回填”。
- 用户可继续手动修改文本框内容。

## 11. 推荐结论

采用“双入口、单 AI service”的实现：

- 平台和租户权限边界清晰。
- 上下文数据不会串租户。
- AI 生成逻辑复用。
- 后续切换 AI provider 或按业务使用不同模型时，只需要改 AI gateway 和 service 层。
