# 多租户阶段 4B 执行记录：营销/H5 基础表租户化

日期：2026-05-09

## 1. 阶段目标

本阶段完成营销活动、H5 活动页、H5 线索和 H5 埋点的基础租户隔离。

阶段 4B 重点是后端数据隔离，不改变 admin 和小程序的交互形态。

## 2. 已完成内容

### 2.1 数据库迁移

新增 migration：

```text
supabase/migrations/20260509200000_tenant_scope_marketing_h5.sql
```

已执行远端 Supabase migration：

```bash
supabase db push
```

新增或回填字段：

- `marketing_campaigns.tenant_id`
- `marketing_campaign_project_scopes.tenant_id`
- `marketing_pages.tenant_id`
- `marketing_page_versions.tenant_id`
- `marketing_assets.tenant_id`
- `marketing_leads.tenant_id`
- `marketing_events.tenant_id`

回填规则：

- 旧数据统一回填到默认租户 `gooes_default`。
- `marketing_campaign_project_scopes` 优先从 `marketing_campaigns` 继承租户。
- `marketing_page_versions` 优先从 `marketing_pages` 继承租户。
- `marketing_leads` 和 `marketing_events` 优先从 `marketing_pages` 继承租户。

新增索引：

- 营销活动租户 + 类型 + 状态索引。
- H5 页面租户 + 状态 + 更新时间索引。
- H5 线索租户 + 状态 + 创建时间索引。
- H5 线索租户 + page + phone + 创建时间索引。
- H5 埋点租户 + page/event + 创建时间索引。

### 2.2 H5 活动页 admin 接口隔离

更新：

```text
apps/api/src/controllers/marketing-pages/index.ts
apps/api/src/services/marketing-pages.ts
apps/api/src/repositories/marketing-pages.ts
```

已实现：

- `GET /marketing-pages` 按当前租户过滤。
- `POST /marketing-pages` 创建时写入当前租户。
- `GET /marketing-pages/:id` 校验当前租户。
- `PATCH /marketing-pages/:id` 校验当前租户。
- `DELETE /marketing-pages/:id` 校验当前租户。
- `GET /marketing-pages/:id/draft` 校验当前租户。
- `PUT /marketing-pages/:id/draft` 校验当前租户。
- `POST /marketing-pages/:id/publish` 校验当前租户。
- `POST /marketing-pages/:id/offline` 校验当前租户。
- `POST /marketing-pages/:id/duplicate` 只能复制当前租户页面，新副本写入当前租户。
- H5 页面 AI 回填接口先校验页面租户边界。

### 2.3 H5 线索与埋点租户化

已实现：

- `GET /marketing-leads` 按当前租户过滤。
- `PATCH /marketing-leads/:id` 校验当前租户。
- `POST /marketing-leads/:id/convert-customer` 校验当前租户。
- H5 公开提交线索时，从 `marketing_pages.slug` 找到 page，再继承 `page.tenant_id`。
- H5 公开埋点时，从 page 继承 `tenant_id`。
- 线索 24 小时去重增加 `tenant_id + page_id + phone` 维度。
- H5 线索转客户改为 `tenant_id + phone` 匹配，避免跨租户绑定客户。
- 新创建客户写入线索所属 `tenant_id`。

### 2.4 营销活动租户化

更新：

```text
apps/api/src/repositories/marketing-campaigns.ts
apps/api/src/services/customer-project-log-shares.ts
```

已实现：

- 营销活动列表按当前租户过滤。
- 营销活动详情按当前租户查询。
- 营销活动创建写入当前租户。
- 营销活动更新、状态变更按当前租户校验。
- 营销活动项目范围写入 `tenant_id`。
- 保存活动项目范围时校验项目属于当前租户/当前可见项目。
- 客户侧命中营销活动时，先从项目反查 `tenant_id`，再匹配同租户活动，避免 `all_projects` 活动跨租户生效。

## 3. 验证记录

### 3.1 静态验证

已执行：

```bash
bun run api:typecheck
bun run api:build
git diff --check
```

结果：通过。

### 3.2 数据库迁移

已执行：

```bash
supabase db push
```

结果：已应用 `20260509200000_tenant_scope_marketing_h5.sql`。

### 3.3 运行时 smoke

使用远端 Supabase 模拟 A/B 租户数据，插入：

- A/B H5 页面
- A/B H5 页面版本
- A/B H5 线索
- A/B H5 埋点
- A/B 营销活动
- A/B 营销活动项目范围

使用 A 租户 token 验证：

```text
[PASS] marketing page list tenant scoped
[PASS] tenant A cannot read tenant B marketing page - HTTP 404
[PASS] marketing leads tenant scoped
[PASS] tenant A cannot update tenant B lead - HTTP 404
[PASS] marketing campaign list tenant scoped
[PASS] tenant A cannot read tenant B campaign - HTTP 404
```

## 4. 本阶段不做事项

- 不改 H5 路由为 `/t/:tenantSlug/p/:slug`。
- 不改变小程序活动列表交互。
- 不实现平台访客态。
- 不实现平台线索分配。
- 不实现员工拓客 `share_token`。
- 不新增 `customer_sources` 来源时间线。

这些进入阶段 4C/4D/4E/4F。

## 5. 后续阶段建议

下一步建议进入阶段 4C：H5 公开链路和小程序活动入口租户化。

重点：

- H5 session token 增加 `tenant_id`。
- 小程序活动列表按当前客户/员工租户返回。
- 明确公开 `/public/marketing-pages` 在无登录态下是否继续返回全量。
- 为后续 `/t/:tenantSlug/p/:slug` 预留接口。

