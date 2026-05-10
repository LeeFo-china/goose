# Admin 对接执行方案：基于 application_integration_documentation 汇总

日期：2026-05-10

## 1. 目标

本文档汇总 `docs/application_integration_documentation` 下所有 admin 相关对接文档，形成一份可执行的 admin 端落地方案。

目标不是重复每份接口文档，而是明确：

- admin 端应该按什么顺序对接。
- 哪些页面需要改，哪些页面只需要回归。
- 平台超管和租户管理员的入口边界。
- 每个阶段的验收口径。
- 当前下一步应该做什么。

## 2. 覆盖文档

本方案覆盖以下 admin 对接文档：

| 阶段 | 文档 |
| --- | --- |
| 0 | `2026-05-09-phase-0-admin-integration.md` |
| 1 | `2026-05-09-phase-1-admin-integration.md` |
| 2 | `2026-05-09-phase-2-admin-integration.md` |
| 2B | `2026-05-09-phase-2b-admin-integration.md` |
| 3A | `2026-05-09-phase-3a-admin-integration.md` |
| 3B | `2026-05-09-phase-3b-admin-integration.md` |
| 3C | `2026-05-09-phase-3c-admin-integration.md` |
| 3D | `2026-05-09-phase-3d-admin-integration.md` |
| 3E | `2026-05-09-phase-3e-admin-integration.md` |
| 3F | `2026-05-09-phase-3f-admin-integration.md` |
| 3G | `2026-05-09-phase-3g-admin-integration.md` |
| 3H-1 | `2026-05-09-phase-3h-1-admin-integration.md` |
| 3H-2 | `2026-05-09-phase-3h-2-admin-integration.md` |
| 4A-4F | `2026-05-09-phase-4a` 到 `phase-4f` admin 对接文档 |
| 4G | `2026-05-10-phase-4g-admin-integration.md` |
| 4H | `2026-05-10-phase-4h-admin-integration.md` |
| 5A-5H | `2026-05-10-phase-5a` 到 `phase-5h` admin 对接文档 |
| 5.9 | `2026-05-10-phase-5-9-admin-miniprogram-regression-checklist.md` |

## 3. 总体原则

### 3.1 普通租户 admin

普通租户 admin 的所有业务页面都不传：

```text
tenant_id
tenantId
X-Tenant-ID
```

后端通过登录态中的 `AuthContext.tenantId` 自动过滤租户数据。

适用页面：

- 客户
- 项目
- 员工
- 组织架构
- 角色权限
- 费用审批
- 施工日志
- 工序验收
- 工地监控
- 营销活动
- H5 页面
- H5 线索
- 自媒体脚本
- 系统配置
- 通知

### 3.2 平台超管 admin

平台超管使用独立菜单和平台接口：

```text
/platform/tenants
/platform/leads
/platform/audit-logs
/settings
/ops
/social-video
```

平台超管不应默认进入租户业务页面，不应显示客户、项目、费用、营销、工地监控等租户业务菜单。

平台超管身份判断：

```ts
session.roles.includes("platform_admin") && !session.tenant
```

工程上建议保留防御逻辑：只要包含 `platform_admin` 且 `tenant` 为空或 `tenant.id` 为空，就进入平台模式。

### 3.3 系统配置边界

平台级能力由平台统一维护：

- 短信网关和模板 Code
- 腾讯云 IoT / SIP 配置
- 萤石配置
- AI Provider / 模型 / API Key
- 微信 AppID / Secret
- 短视频识别配置
- 通知网关
- 对象存储基础配置

租户管理员当前 MVP 只允许配置：

```text
ALIYUN_SMS_SIGN_NAME
```

admin 页面也应只向租户展示“租户短信配置”，不要展示 AI、监控、微信等平台配置项。

### 3.4 缓存规则

账号切换、登录态刷新、租户状态变化后，admin 前端应清空以下本地缓存或重新请求：

- 客户、项目、员工列表
- 部门、岗位、角色
- 费用分类、费用列表
- 施工日志、评论
- 工序验收列表和详情
- 摄像头项目分组和绑定选项
- 营销/H5 页面、线索
- 自媒体脚本列表和用量摘要
- 系统配置
- 通知摘要

## 4. 执行阶段

### 阶段 A：登录态、菜单和访问边界

目标：保证平台超管和租户管理员进入不同工作台。

执行项：

- 确认 `AdminSession` 包含 `tenant`、`roles`、`permissions`。
- 顶部栏租户模式显示当前公司，平台模式显示“平台超管 · 平台管理模式”。
- 侧边栏按模式分流：
  - 平台模式：平台概览、平台租户、平台线索、平台审计、平台系统配置、运维脚本、自媒体脚本。
  - 租户模式：概览、客户、项目、费用审批、营销活动、自媒体脚本、工地监控、员工、组织架构、角色、权限点、租户短信配置。
- URL 直达租户业务页面时，平台超管应显示无权限提示或跳回平台工作台。
- 租户管理员访问 `/platform/*` 应返回无权限。

验收：

- `18637605353` 登录后只看到平台菜单。
- `18638374738` 登录后只看到租户菜单。
- 租户管理员不能访问 `/platform/tenants`、`/platform/leads`、`/platform/audit-logs`。
- 平台超管可访问 `/ops` 和 `/settings`。

### 阶段 B：核心租户业务页面回归

目标：确认原有业务页面无需传租户参数，后端隔离生效。

执行项：

- 客户页：列表、详情、新建、编辑、房产展示。
- 项目页：列表、详情、新建、成员选择、客户/房产选择。
- 员工页：列表、新建、编辑、角色分配。
- 组织页：部门、岗位、部门岗位规则。
- 角色权限页：角色列表、权限绑定。

验收：

- A 租户看不到 B 租户客户、项目、员工、部门、岗位、角色。
- A 租户新建项目时，下拉选择器不出现 B 租户客户和员工。
- A/B 租户可以使用相同岗位 code、角色 code。
- 通过 URL 打开其他租户详情返回 403/404，页面有可理解提示。

### 阶段 C：业务扩展模块回归

目标：确认费用、日志、验收、摄像头、自媒体等业务模块按租户隔离。

执行项：

- 费用审批 `/expenses`
  - 列表、过滤、分页、审批、驳回、打款。
  - 费用统计 `GET /expense-requests/stats/summary`。
- 任务中心
  - `GET /task-center/todos`
  - `GET /task-center/todos/summary`
  - 支持 `project_acceptance` 待办类型。
- 施工日志
  - 项目日志、日历、评论。
- 工序验收
  - 列表、详情、提交、复核、驳回、通知客户。
- 工地监控
  - 绑定项目选择器、腾讯云通道、播放、解绑。
- 自媒体
  - 转写任务、脚本生成、脚本列表、用量摘要。

验收：

- A 租户费用、日志、验收、摄像头、自媒体脚本不出现 B 租户数据。
- 摄像头通道被其他租户占用时，只显示“已被其他项目绑定”，不泄露对方项目名称和摄像头名称。
- 自媒体同链接缓存只在同一租户内复用。
- 用量摘要只统计当前租户。

### 阶段 D：营销、H5、线索和客户来源

目标：打通租户营销闭环，并让 admin 能看到来源与跟进入口。

执行项：

- 营销活动和 H5 页面
  - `/marketing`
  - `/marketing/h5-pages/:id/edit`
  - 页面列表、配置、发布、下线、复制、删除。
- H5 线索
  - 列表、过滤、分页、作废、批量操作、转客户。
- H5 tenant URL
  - 后续复制链接时优先使用：

```text
https://h5.goodcms.cn/t/:tenantSlug/p/:slug
```

- 客户来源摘要
  - 客户列表展示：
    - 老客户新线索
    - 平台新线索
    - 员工分享
  - 客户详情展示最近来源。
  - 客户详情增加来源时间线：

```http
GET /customers/:id/sources?page=1&pageSize=20
```

验收：

- A 租户看不到 B 租户营销活动、H5 页面和线索。
- H5 线索转客户只在当前租户内按手机号匹配。
- 平台线索分配给已存在客户后，租户客户列表能显示“老客户新线索”。
- 员工分享绑定客户后，客户列表能显示“员工分享”。

### 阶段 E：平台租户管理

目标：平台超管可以创建、编辑、停用、启用租户，并查看租户详情。

页面：

```text
/platform/tenants
/platform/tenants/:id
```

接口：

```http
GET /platform/tenants
POST /platform/tenants
GET /platform/tenants/:id
PATCH /platform/tenants/:id
POST /platform/tenants/:id/suspend
POST /platform/tenants/:id/activate
```

创建租户表单字段：

- 公司名称
- slug
- 联系人
- 联系电话
- 管理员姓名
- 管理员手机号

页面展示：

- 租户列表：公司、slug、状态、联系人、电话、用量、创建时间。
- 租户详情：基础信息、用量摘要、管理员、初始化记录、角色列表。

错误处理：

| code | 前端提示 |
| --- | --- |
| `TENANT_SLUG_EXISTS` | 租户标识已存在，请更换 slug |
| `TENANT_ADMIN_PHONE_EXISTS` | 该手机号已绑定员工身份，请更换管理员手机号 |
| `TENANT_NOT_AVAILABLE` | 当前公司服务已暂停，请联系平台管理员 |

验收：

- 平台超管可创建新租户，并初始化部门、岗位、角色、管理员。
- 新租户管理员可登录。
- 停用租户后，该租户管理员不能登录或使用后台。
- 启用后恢复正常。
- 历史租户没有初始化记录时，详情页显示空状态，不报错。

### 阶段 F：平台线索管理

目标：平台超管可以处理平台公海线索并分配给目标租户。

页面：

```text
/platform/leads
```

接口：

```http
GET /platform/leads?page=1&pageSize=20&status=new&keyword=张三
GET /platform/leads/:id
POST /platform/leads/:id/assign
GET /platform/tenants?page=1&pageSize=20&status=active&keyword=关键词
```

页面能力：

- 状态筛选：`new`、`assigned`、`invalid`。
- 关键词搜索：姓名、手机号、城市、小区。
- 查看详情。
- 搜索目标租户。
- 手动分配。
- 展示分配日志。
- 展示去重结果：
  - `existing_customer`：老客户新线索。
  - `created_customer`：新客户。
  - `already_assigned`：已分配。

验收：

- 平台超管可搜索和查看平台线索。
- 待分配线索可分配给 active 租户。
- 目标租户已有同手机号客户时，不重复创建客户，只追加来源记录。
- 分配成功后，目标租户管理员收到站内通知。
- 分配动作写入平台审计日志。

### 阶段 G：平台审计日志

目标：平台超管可追踪关键平台操作。

页面：

```text
/platform/audit-logs
```

接口：

```http
GET /platform/audit-logs?page=1&pageSize=20&action=tenant_create&keyword=关键词
```

支持筛选：

- action
- status
- target_tenant_id
- resource_type
- keyword

当前 action 文案：

| action | 文案 |
| --- | --- |
| `tenant_create` | 创建租户 |
| `tenant_update` | 更新租户 |
| `tenant_suspend` | 停用租户 |
| `tenant_activate` | 启用租户 |
| `tenant_admin_create` | 创建管理员 |
| `platform_lead_assign` | 分配平台线索 |

验收：

- 创建、更新、停用、启用租户有审计记录。
- 分配平台线索有审计记录。
- 列表可按操作类型、状态、租户、关键词过滤。
- 审计写入失败不阻断主业务，但页面应能展示已有记录。

### 阶段 H：通知中心

目标：租户管理员和员工能看到与自己有关的站内通知。

接口：

```http
GET /notifications?page=1&pageSize=20&status=unread
GET /notifications/summary
POST /notifications/read
```

当前通知场景：

| scene | 含义 |
| --- | --- |
| `platform_lead_assigned` | 平台线索分配成功 |
| `employee_share_customer_bound` | 员工分享绑定客户成功 |

页面建议：

- 顶部栏增加通知入口。
- 展示未读数量。
- 通知列表支持未读/全部切换。
- 点击通知跳转 `target_url`。
- 打开通知后可标记已读。

验收：

- 平台线索分配后，目标租户管理员收到通知。
- 员工分享绑定客户后，分享员工收到通知。
- 通知只返回当前登录员工自己的记录。
- 标记已读后未读数减少。

### 阶段 I：AI 和自媒体用量增强

目标：先完成现有自媒体页面摘要，后续再做平台 AI 配置页。

MVP 执行项：

- 自媒体脚本管理页顶部增加用量摘要：
  - 识别任务：总数 / 成功 / 失败 / 总时长。
  - 脚本生成：总数 / 成功 / 失败。
  - AI 用量：调用次数 / token / 缺失 token 数。

接口：

```http
GET /admin/social-video/usage-summary?created_from=2026-05-01&created_to=2026-05-10
```

后续平台 AI 配置页：

- 管理 `ai_providers`。
- 管理 `ai_models`。
- 配置 `ai_scene_routes`。
- 查看 `ai_call_logs` 调用量、失败率、token 用量。

注意：

- AI API Key 是平台级敏感配置。
- MVP 不支持租户自带 AI Key。
- provider 未返回 token usage 时，token 字段可能为空，不能当作真实 0 做计费。

## 5. 推荐实际执行顺序

结合当前系统状态，推荐从低风险到高收益执行：

### 5.1 立即执行：阶段 5.9 真实账号人工回归

原因：

- 后端严格隔离脚本已通过。
- 平台超管菜单、平台首页、系统配置、运维脚本已做过修正。
- 现在最需要确认的是生产真实账号链路。

执行账号：

- 平台超管：`18637605353`
- 租户管理员：`18638374738`
- 一个普通员工账号。
- 一个小程序客户账号。

回归路径：

1. 平台超管登录 `https://admin.goodcms.cn/login`。
2. 验证平台菜单和平台首页。
3. 打开 `/platform/tenants`、`/platform/leads`、`/platform/audit-logs`、`/settings`、`/ops`。
4. 租户管理员登录。
5. 验证租户菜单、客户、项目、员工、费用、营销、摄像头、系统配置。
6. 租户管理员尝试访问 `/platform/*`，应被拒绝。
7. 小程序和 H5 做一次链路回归。

完成后更新：

```text
docs/2026-05-09-multi-tenant-phase-5-platform-admin-todolist.md
docs/2026-05-10-multi-tenant-phase-5-9-real-account-regression-execution-record.md
```

### 5.2 第二批：通知中心和客户来源时间线

原因：

- 平台线索分配和员工分享已经有后端能力。
- 这两个能力能提升租户管理员跟进效率。

执行：

1. 客户列表增加来源 tag。
2. 客户详情增加最近来源和来源时间线。
3. 顶部栏增加通知入口和未读数。
4. 通知列表弹层或页面实现。

### 5.3 第三批：自媒体用量摘要

原因：

- 后端已有 `/admin/social-video/usage-summary`。
- 页面改动可控。

执行：

1. 自媒体页面增加时间过滤。
2. 增加 3 个摘要块。
3. 切换时间直接刷新数据区，不刷新页面。

### 5.4 第四批：平台 AI 配置页

原因：

- 这是平台能力，不影响租户 MVP 闭环。
- 涉及敏感密钥、模型路由、token 统计，建议单独设计权限和审计。

执行：

1. 先出平台 AI 配置页 PRD。
2. 再实现 provider/model/scene route 管理。
3. 最后接入调用日志查询。

## 6. 统一验收清单

### 6.1 平台超管

- [ ] 只看到平台菜单。
- [ ] 可访问平台租户、平台线索、平台审计。
- [ ] 可访问平台系统配置。
- [ ] 可访问运维脚本。
- [ ] 不能误进入租户业务工作台。

### 6.2 租户管理员

- [ ] 只看到租户业务菜单。
- [ ] 系统配置页只显示租户短信配置。
- [ ] 不能访问 `/platform/*`。
- [ ] 所有列表只显示当前租户数据。
- [ ] 创建业务数据时不传 `tenant_id`，后端自动归属当前租户。

### 6.3 数据隔离

- [ ] A 租户列表不出现 B 租户资源 ID。
- [ ] A 租户详情接口访问 B 租户资源返回 403/404。
- [ ] A 租户选择器不出现 B 租户客户、员工、项目。
- [ ] 摄像头、营销页、自媒体、费用、验收、日志都通过隔离验证。

### 6.4 平台线索

- [ ] 可创建或获取平台线索。
- [ ] 可分配给 active 租户。
- [ ] 已有客户时显示“老客户新线索”。
- [ ] 新客户时显示“平台新线索”。
- [ ] 分配后有通知和审计。

### 6.5 H5

- [ ] 租户 admin 可管理自己的 H5 页面。
- [ ] 复制链接优先使用 tenant URL。
- [ ] H5 提交线索归属 URL 中的租户。
- [ ] H5 线索转客户只在当前租户内匹配。

## 7. 风险和处理策略

| 风险 | 处理 |
| --- | --- |
| 前端误传 `tenant_id` | 普通 admin 页面禁止新增租户参数，所有隔离以后端登录态为准 |
| 平台超管误用租户页面 | 菜单隐藏 + URL 直达阻断 |
| 租户停用后页面体验差 | 登录页展示“当前公司服务已暂停，请联系平台管理员” |
| 平台线索重复分配 | 后端幂等和业务错误，admin 展示后端 message |
| 老客户新线索不明显 | 客户列表 tag + 客户详情来源时间线 |
| AI token 缺失被误计费 | token 为空只能表示供应商未返回，不可按 0 计费 |
| 公开 H5 链接混用旧路径 | 后续复制链接优先 tenant URL，旧路径保留兼容 |

## 8. 当前结论

当前最合理的下一步不是继续新增大功能，而是先执行阶段 5.9 真实账号人工回归。

回归完成后，再按以下顺序推进：

```text
通知中心 / 客户来源时间线
-> 自媒体用量摘要
-> 平台 AI 配置页
-> 阶段 6 数据分析 2.0
```

这样可以先把多租户 MVP 的运营闭环确认稳定，再进入平台增强能力。
