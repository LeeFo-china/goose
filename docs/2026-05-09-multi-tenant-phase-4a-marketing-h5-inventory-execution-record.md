# 多租户阶段 4A 执行记录：营销/H5/平台线索清点

日期：2026-05-09

## 1. 阶段目标

阶段 4A 只做清点和执行拆分，不直接改业务逻辑。

目标是明确营销、H5、线索、员工拓客、平台线索分配在多租户下的边界，避免阶段 4B 开始落库表和接口时遗漏公开链路。

## 2. 已扫描范围

### 2.1 数据表

已确认需要纳入阶段 4 租户化的表：

| 表 | 当前状态 | 阶段 4 处理建议 |
| --- | --- | --- |
| `marketing_campaigns` | 无 `tenant_id` | 增加 `tenant_id`，租户活动必须隔离 |
| `marketing_campaign_project_scopes` | 无 `tenant_id`，依赖 `campaign_id` | 可通过 campaign 继承隔离；建议增加 `tenant_id` 冗余索引用于审计和查询 |
| `marketing_campaign_templates` | 平台模板 | 平台级模板可不带 `tenant_id`，后续支持租户自定义模板时再增加可空 `tenant_id` |
| `marketing_pages` | 无 `tenant_id` | 增加 `tenant_id`，slug MVP 继续全局唯一 |
| `marketing_page_versions` | 无 `tenant_id`，依赖 `page_id` | 可通过 page 继承隔离；建议增加 `tenant_id` 冗余索引用于审计和查询 |
| `marketing_assets` | 无业务归属 | 建议增加 `tenant_id`，并保留 `page_id` 可空字段作为后续素材归属增强 |
| `marketing_leads` | 无 `tenant_id` | 增加 `tenant_id`，H5 提交时由 page 反推租户 |
| `marketing_events` | 无 `tenant_id` | 增加 `tenant_id`，H5 埋点由 page 反推租户 |
| `customers` | 已租户化 | H5 线索转客户必须改为租户内手机号匹配 |
| `customer_sources` | 当前未发现独立表 | 阶段 4 建议新增，用于来源时间线和老客户新线索 |
| `platform_leads` | 当前未发现 | 阶段 4D 新增，平台访客态公海线索 |
| `platform_lead_assign_logs` | 当前未发现 | 阶段 4E 新增，平台线索分配审计 |
| `tenant_share_links` | 当前未发现 | 阶段 4F 新增，员工拓客直绑定 |

### 2.2 后端接口

已确认的核心接口入口：

| 接口 | 文件 | 当前风险 |
| --- | --- | --- |
| `GET /marketing-pages` | `apps/api/src/controllers/marketing-pages/index.ts` | 列表未按租户过滤 |
| `POST /marketing-pages` | 同上 | 创建未写入 `tenant_id` |
| `GET /marketing-pages/:id` | 同上 | 详情未校验租户边界 |
| `PUT /marketing-pages/:id/draft` | 同上 | 草稿版本未校验租户边界 |
| `POST /marketing-pages/:id/publish` | 同上 | 发布未校验租户边界 |
| `POST /marketing-pages/:id/duplicate` | 同上 | 复制可能跨租户复制页面 |
| `GET /public/marketing-pages` | 同上 | 公开列表未携带租户上下文 |
| `GET /public/marketing-pages/:slug` | 同上 | 通过全局 slug 查询，MVP 可保留全局唯一 |
| `POST /public/marketing-pages/:slug/leads` | 同上 | 线索未写入 `tenant_id` |
| `POST /public/marketing-pages/:slug/events` | 同上 | 事件未写入 `tenant_id` |
| `GET /marketing-leads` | 同上 | 线索列表未按租户过滤 |
| `PATCH /marketing-leads/:id` | 同上 | 更新未校验租户边界 |
| `POST /marketing-leads/:id/convert-customer` | 同上 | 当前按全局手机号匹配客户，需改为租户内匹配 |
| 营销活动 CRUD | `apps/api/src/repositories/marketing-campaigns.ts` | 活动列表、详情、创建、更新均未带租户条件 |

### 2.3 Admin 影响范围

已确认的 admin 页面和组件：

- `apps/admin/app/(console)/marketing/page.tsx`
- `apps/admin/components/marketing/marketing-table.tsx`
- `apps/admin/components/marketing/marketing-mutations.tsx`
- `apps/admin/components/marketing/h5-pages-table.tsx`
- `apps/admin/components/marketing/h5-page-mutations.tsx`
- `apps/admin/components/marketing/h5-page-editor.tsx`
- `apps/admin/components/marketing/h5-leads-panel.tsx`
- `apps/admin/components/marketing/h5-leads-table.tsx`
- `apps/admin/components/customers/customers-table.tsx`

阶段 4B/4C 后，admin 端应尽量不显式传 `tenant_id`，由登录态和后端鉴权决定租户。

### 2.4 小程序/H5 影响范围

H5 公开链路当前以 `/p/:slug` 为主。阶段 4 MVP 建议：

- slug 继续全局唯一，避免 H5 路由立刻大改。
- 小程序获取活动列表时后端根据客户/员工登录态返回当前租户可见活动。
- H5 提交线索时不信任前端传 `tenant_id`，后端通过 slug 找到 page，再写入 page 的 `tenant_id`。
- 后续再引入 `/t/:tenantSlug/p/:slug`，用于多租户品牌化和避免 slug 全局占用。

## 3. 关键风险

### 3.1 H5 公开页面的租户来源

`GET /public/marketing-pages/:slug` 当前只靠 slug 查询。MVP 保留全局唯一 slug 是可行的，但必须保证：

- `marketing_pages.slug` 仍全局唯一。
- page 必须有 `tenant_id`。
- lead/event 必须从 page 继承 `tenant_id`。
- 后台不能让 A 租户编辑 B 租户页面。

### 3.2 线索转客户的手机号匹配

当前 `marketing_leads` 转客户逻辑会按手机号全局查 `customers`。

阶段 4B 后必须改成：

```text
tenant_id + phone
```

否则 A 租户的 H5 线索可能错误绑定到 B 租户客户。

### 3.3 营销活动项目范围

`marketing_campaign_project_scopes.project_id` 当前只关联项目，不带租户字段。

阶段 4B 必须保证：

- 创建或更新活动范围时，只允许选择当前租户项目。
- 读取活动范围时，必须通过当前租户 campaign 进入。
- 建议给 scope 表增加 `tenant_id`，便于审计和创建复合索引。

### 3.4 平台模板与租户活动的区分

`marketing_campaign_templates` 当前更像平台级模板，阶段 4 不应强制租户化，否则会导致每个租户都需要复制一份模板。

建议：

- 平台内置模板继续平台级。
- 租户创建的活动是租户级。
- 后续支持租户自定义模板时，再将 `marketing_campaign_templates.tenant_id` 设计为可空：
  - `tenant_id IS NULL`：平台模板
  - `tenant_id = 当前租户`：租户模板

## 4. 阶段 4 拆分建议

### 阶段 4B：营销/H5 基础表租户化

目标：

- 给营销活动、H5 页面、线索、事件增加 `tenant_id`。
- 回填默认租户。
- 增加必要索引。
- 后端 admin 接口按 `authContext.tenantId` 过滤。

建议包含：

- `marketing_campaigns.tenant_id`
- `marketing_campaign_project_scopes.tenant_id`
- `marketing_pages.tenant_id`
- `marketing_page_versions.tenant_id`
- `marketing_assets.tenant_id`
- `marketing_leads.tenant_id`
- `marketing_events.tenant_id`

### 阶段 4C：H5 公开链路租户化

目标：

- H5 页面公开读取仍支持 `/p/:slug`。
- lead/event 从 page 继承 `tenant_id`。
- 线索 24 小时去重改为租户内 + page + phone。
- H5 session token 增加 `tenant_id`。

### 阶段 4D：平台访客态和多租户客户选择态

目标：

- 客户手机号没有命中任何租户时返回 `platform_visitor`。
- 客户手机号命中多个租户时返回 `select_tenant`。
- 小程序端据此展示访客页或公司选择页。

### 阶段 4E：平台公海线索与手动分配

目标：

- 新增 `platform_leads`。
- 新增 `platform_lead_assign_logs`。
- 平台超管可手动分配。
- 分配时按目标租户 + 手机号去重。
- 老客户新线索写入来源时间线。

### 阶段 4F：员工拓客直绑定

目标：

- 新增 `tenant_share_links`。
- 小程序码/H5 链接携带 `share_token`。
- 客户注册后直接绑定目标租户，不走平台分配。
- 已存在客户追加来源，不重复创建。

## 5. 阶段 4B 执行清单

- [ ] 新增 migration：营销/H5 基础表 `tenant_id` 字段和索引。
- [ ] 回填默认租户。
- [ ] 更新 `MarketingCampaignRepository`，所有列表、详情、更新、状态变更带租户条件。
- [ ] 更新营销活动创建，写入 `authContext.tenantId`。
- [ ] 更新活动项目范围保存，校验项目属于当前租户。
- [ ] 更新 `MarketingPageRepository`，admin 侧列表、详情、草稿、发布、复制带租户条件。
- [ ] 更新 H5 页面创建，写入 `authContext.tenantId`。
- [ ] 更新 `marketing_leads` admin 列表、更新、转客户租户过滤。
- [ ] 更新 H5 线索转客户为租户内手机号匹配。
- [ ] 更新阶段 4 验证脚本，加入 A/B 租户营销/H5 数据验收。

## 6. Admin 对接判断

阶段 4B 后 admin 端不需要传 `tenant_id`。

可能需要调整：

- 如果接口返回新增 `tenant_id` 字段，前端无需展示。
- 营销活动项目选择器应保持分页搜索，后端会只返回当前租户项目。
- 线索列表会只返回当前租户线索。

## 7. 小程序/H5 对接判断

阶段 4B 主要是后端隔离，小程序端可以暂不改。

阶段 4C/4D/4F 会需要小程序端对接：

- 活动列表返回当前租户可见活动。
- H5 session token 增加租户信息。
- 客户登录可能返回 `platform_visitor` 或 `select_tenant`。
- 员工分享路径需要保存并回传 `share_token`。

## 8. 验收标准

- A 租户 admin 看不到 B 租户营销活动。
- A 租户 admin 看不到 B 租户 H5 页面。
- A 租户 admin 看不到 B 租户 H5 线索。
- A 租户不能编辑、发布、复制、下线 B 租户 H5 页面。
- A 租户不能更新或转化 B 租户线索。
- H5 公开提交线索后，线索写入对应 page 的 `tenant_id`。
- H5 线索转客户只在同租户内按手机号匹配。

