# 多租户系统改造规划方案

日期：2026-05-09

## 1. 背景

当前系统是单装修公司模式：

- 一个 admin 后台。
- 一套员工、客户、项目、费用、营销、H5、摄像头、验收数据。
- 权限体系以员工、角色、权限点为中心。
- 后端大量接口默认查询全局业务表。

如果要支持多家装修公司入驻，需要把系统升级为 SaaS 多租户模式。每家装修公司应拥有自己的：

- 员工、部门、岗位、角色。
- 客户、房产、项目、施工日志。
- 费用审批、工序验收、摄像头绑定。
- 营销活动、H5 页面、线索数据。
- admin 后台配置和业务数据。

核心目标不是简单增加一个 `tenant_id` 字段，而是建立完整的数据隔离、权限隔离、配置隔离和入口隔离。

## 2. 推荐结论

建议采用：

```text
单代码仓库
+ feature/multi-tenant 分支
+ 单 API / 单 admin / 单 H5 应用
+ 单 Supabase 项目
+ 共享数据库表
+ 业务表统一 tenant_id 隔离
```

不建议第一版采用：

```text
每个租户一个独立仓库
每个租户一套数据库
每个租户一套部署
```

原因：

- 当前业务仍在快速迭代，独立仓库会导致 bug fix 和业务功能重复合并。
- 多租户第一版更需要验证业务闭环，不应过早增加部署和运维复杂度。
- 共享表 + `tenant_id` 是 SaaS MVP 最常见、最可控的落地方式。

## 3. 分支策略

建议新开长期改造分支：

```bash
git checkout -b feature/multi-tenant
```

分支职责：

| 分支 | 职责 |
| --- | --- |
| `main` | 当前单公司生产线，继续修 bug 和业务迭代 |
| `feature/multi-tenant` | 多租户改造线，持续从 `main` 合并最新业务代码 |

合并规则：

- `feature/multi-tenant` 每 1-3 天从 `main` 合并一次。
- 多租户未闭环前，不把大规模租户改造合回 `main`。
- 如果 `main` 新增业务表或业务模块，必须在 `feature/multi-tenant` 同步补租户边界。

## 4. 核心设计原则

### 4.1 数据隔离优先

所有租户业务数据必须通过 `tenant_id` 隔离。

后端任何查询必须满足：

```text
当前用户所属 tenant_id = 查询数据 tenant_id
```

除平台超管接口外，不允许跨租户读取。

### 4.2 权限体系租户化

权限点 `permissions` 可以保持全局，因为它表示系统能力。

以下数据应租户化：

- `roles`
- `role_permissions`
- `employee_roles`
- `employee_permission_overrides`
- `departments`
- `posts`
- `department_post_rules`
- `project_member_role_post_rules`

需要区分两类管理员：

| 角色 | 含义 |
| --- | --- |
| 平台超管 | goodcms 平台运营人员，可管理租户 |
| 租户管理员 | 某装修公司管理员，只能管理本公司 |

当前 `system_admin` 不应继续代表全平台权限。建议新增：

```text
platform_admin
tenant_admin
```

或在 `roles` 增加 `scope_type = platform | tenant`。

### 4.3 配置隔离

系统配置需要拆分成：

| 类型 | 示例 |
| --- | --- |
| 平台级配置 | 默认 AI 模型、全局安全配置、平台短信供应商兜底 |
| 租户级配置 | 短信签名、腾讯云视频配置、H5 品牌配置、营销默认设置 |

建议 `system_settings` 增加：

```sql
tenant_id uuid null references tenants(id),
scope text not null default 'platform'
```

规则：

- `tenant_id is null` 表示平台默认配置。
- `tenant_id = 当前租户` 表示租户覆盖配置。
- 读取配置时优先租户配置，缺失时回退平台默认。

#### 4.3.1 平台级配置与租户级数据分离

部分系统配置属于平台级基础设施，不随租户隔离。

典型平台级配置：

- 腾讯云 IoT Video SIP 配置：
  - SIP 服务器 ID
  - SIP 服务器 IP
  - SIP 服务器端口
  - SIP 域
- 短信平台网关配置。
- AI 网关和模型配置：
  - API Key
  - API endpoint
  - 默认模型
  - 超时时间
  - 全局安全策略
- 对象存储 OSS/COS 基础配置。

这些配置应存储在环境变量或 `system_settings` 的平台级记录中：

```text
tenant_id is null
scope = platform
```

不应写入租户业务表，也不应要求租户管理员理解或维护。

配置层级建议：

| 配置类型 | 归属层级 | 存储位置 | 示例 |
| --- | --- | --- | --- |
| 平台级配置 | 平台 | 环境变量 / `system_settings(tenant_id is null)` | `SIP_SERVER_ID`、`SMS_GATEWAY`、`AI_API_KEY`、`AI_MODEL`、`COS_BUCKET` |
| 租户级配置 | 租户 | `system_settings(tenant_id = 租户ID)` | 短信签名、H5 品牌色、自定义 Logo、租户文案偏好 |
| 租户业务数据 | 租户 | 业务表，必须带 `tenant_id` | `project_cameras`、`customers`、`projects` |

平台级配置可以作为默认值；租户级配置只覆盖真正需要租户自定义的部分。

AI 配置原则：

- AI API Key、endpoint、默认模型属于平台级配置。
- 不建议 MVP 阶段支持租户自带 AI Key。
- 租户可配置的是业务偏好，例如 H5 品牌语气、脚本风格默认值、营销文案偏好。
- AI 调用产生的业务数据仍属于租户数据，例如 `social_video_transcriptions`、`social_video_scripts` 必须带 `tenant_id`。

#### 4.3.3 多 AI Provider 与场景路由

当前系统以单一 DeepSeek 配置为主。平台化后，建议升级为平台级多 AI Provider 配置，便于切换供应商，并让不同业务场景使用不同模型。

目标能力：

```text
平台级 AI Provider
-> 多模型
-> 按业务场景路由
-> 支持 primary model
-> 支持 fallback model
-> 记录调用日志和租户用量归因
```

推荐数据结构：

```text
ai_providers
- id
- code
- name
- endpoint
- api_key_secret
- status
- timeout_ms
- priority
- created_at
- updated_at

ai_models
- id
- provider_id
- model_code
- name
- capability
- status
- max_tokens
- cost_level
- created_at

ai_scene_routes
- id
- scene_code
- primary_model_id
- fallback_model_ids
- temperature
- response_format
- timeout_ms
- status
```

场景示例：

| 场景 | scene_code | 模型要求 |
| --- | --- | --- |
| H5 活动页文案 | `h5_page_copy` | 中文文案能力强 |
| 短视频脚本改写 | `social_video_script` | 创意强、JSON 输出稳定 |
| 客户跟进总结 | `customer_followup_summary` | 快、便宜、稳定 |
| 装修问答 | `decoration_qa` | 准确性高、低幻觉 |
| 图片素材分析 | `marketing_asset_vision` | 支持 vision |

业务代码调用方式：

```ts
aiGateway.chat({
  scene: "social_video_script",
  messages,
  responseFormat: "json",
});
```

业务代码不应直接判断 DeepSeek、OpenAI、通义千问或其他供应商。供应商选择、模型选择、fallback 和日志记录由 `aiGateway` 负责。

调用日志建议：

```text
ai_call_logs
- id
- tenant_id
- scene_code
- provider_code
- model_code
- status
- duration_ms
- prompt_tokens
- completion_tokens
- total_tokens
- error_code
- created_at
```

注意：

- Provider 和模型配置是平台级。
- `ai_call_logs.tenant_id` 用于租户用量归因，可为空表示平台级任务。
- `prompt_tokens / completion_tokens / total_tokens` 由 `aiGateway` 归一化，不同供应商字段不一致时在 gateway 层适配。
- 如果供应商未返回 token，用量字段允许为空；后续可做文本长度估算，但估算值不能作为真实计费依据。
- 租户 MVP 阶段不允许自带 API Key。
- 租户可配置业务偏好，但不能改变平台安全策略。

MVP 建议：

- 保留当前 DeepSeek 配置兼容。
- 抽象统一 `aiGateway`。
- 支持多个 provider 配置。
- 支持按 `scene_code` 选择 primary model。
- 支持失败 fallback。
- admin 系统配置页可切换 provider/model。
- 记录 `ai_call_logs`。
- 统计每个租户、场景、模型的 token 用量。

#### 4.3.2 摄像头模块的配置与数据分离

摄像头模块必须区分：

```text
腾讯云 SIP 接入配置 = 平台级配置
摄像头设备绑定关系 = 租户级业务数据
```

SIP 配置：

- 所有租户共用同一套 SIP 参数。
- 存储在环境变量或平台级 `system_settings`。
- `tenant_id = null`。
- 租户管理员不可见，也不需要知道。
- 由平台运维人员统一管理。

设备数据：

- `project_cameras` 必须包含 `tenant_id`。
- 租户管理员只能看到本公司设备。
- 设备编码与腾讯云平台同步。
- 设备归属关系由本地 `tenant_id` 确定。

租户创建设备流程：

```text
租户管理员在后台添加摄像头
-> 后端读取平台级 SIP 配置
-> 调用腾讯云 API 创建设备
-> 获取设备编码
-> 写入 project_cameras，并绑定 tenant_id
-> 租户管理员将设备编码配置到摄像头硬件
```

租户查询设备流程：

- `/admin/cameras` 必须通过 `tenant_id` 过滤。
- 租户之间无法互查设备。
- 平台超管查看全量设备必须走 `/platform/cameras`。

数据隔离示例：

```sql
-- 错误：不允许只按设备编码查询租户设备
select *
from public.project_cameras
where device_code = '99958005371320000001';

-- 正确：必须带租户过滤
select *
from public.project_cameras
where tenant_id = '当前租户ID'
  and device_code = '99958005371320000001';
```

### 4.4 入口保持兼容

第一版建议继续使用统一入口：

```text
admin.goodcms.cn
h5.goodcms.cn
当前小程序
```

不建议第一版就做每个装修公司的独立域名。

租户识别优先级：

1. 登录态中的 `tenant_id`。
2. H5 页面 slug 反查 `tenant_id`。
3. 小程序客户登录态反查客户所属 `tenant_id`。
4. 未来再支持子域名或邀请码绑定租户。

### 4.5 主键策略

当前系统大多数核心表已经使用 UUID 主键，这是多租户共享表模式下更合适的做法。

原则：

- 新增业务表必须使用 UUID 主键。
- 不建议新增自增整数作为公开业务对象 ID。
- 对外接口、H5 链接、小程序跳转参数继续使用 UUID 或业务 slug。
- 对租户可见的编号可以单独设计租户内流水号，例如 `project_no`，但不能作为权限判断依据。

原因：

- 降低 ID 遍历和跨租户枚举风险。
- 避免暴露平台整体业务量。
- 便于跨库、异步任务、数据同步场景扩展。

### 4.6 未来开放 API 的租户识别

MVP 阶段，admin、小程序、H5 都通过登录态或页面 slug 隐式识别租户。

如果未来开放 API 给租户自己的系统调用，需要新增 API Token 机制：

```text
tenant_api_tokens
- id
- tenant_id
- name
- token_hash
- scopes
- status
- expires_at
- created_at
```

推荐规则：

- API Token 在签发时绑定 `tenant_id`。
- 服务端通过 token 反查租户，不信任客户端直接传入的 `tenant_id`。
- 如果需要 `X-Tenant-ID`，只能作为校验辅助，必须与 token 绑定租户一致。
- 开放 API 走独立权限 scope，例如 `openapi.customer.read`。

第一版不做开放 API，但表结构和服务边界要避免把 `tenant_id` 写死为只能来自员工登录态。

## 5. 数据库改造方案

### 5.1 新增租户表

```sql
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  contact_name text null,
  contact_phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

建议状态：

```text
active
suspended
archived
```

### 5.2 默认租户回填

迁移第一步创建默认租户：

```text
默认租户：gooes_default
名称：当前装修公司
```

所有现有数据统一回填到默认租户，保证现有生产业务不受影响。

默认租户建议通过环境变量配置：

```text
DEFAULT_TENANT_SLUG=gooes_default
```

必要时再支持：

```text
DEFAULT_TENANT_ID=xxx
```

推荐优先使用 `DEFAULT_TENANT_SLUG`，因为不同环境的 UUID 不一致，而 slug 更适合做初始化和迁移识别。

典型环境：

| 环境 | DEFAULT_TENANT_SLUG |
| --- | --- |
| 本地开发 | `dev_default` |
| 测试环境 | `staging_default` |
| 生产环境 | `prod_default` |

使用边界：

- 可用于默认租户初始化。
- 可用于历史数据回填。
- 可用于单租户兼容期的迁移脚本。
- 不允许作为新业务请求的运行时兜底。
- 新业务必须从登录态、H5 slug、share token、ticket 等可信上下文获得 `tenant_id`。
- 获取不到 `tenant_id` 时应返回错误，而不是自动写入默认租户。

### 5.3 第一批必须加 tenant_id 的表

核心身份与业务表：

- `employees`
- `customers`
- `projects`
- `properties`
- `departments`
- `posts`
- `roles`
- `employee_roles`
- `role_permissions`
- `employee_permission_overrides`

核心业务表：

- `payments`
- `project_logs`
- `project_log_comments`
- `customer_follow_ups`
- `customer_follow_up_comments`
- `expense_requests`
- `project_acceptances`
- `project_acceptance_items`
- `project_acceptance_actions`
- `project_acceptance_open_tickets`

营销与 H5：

- `marketing_campaigns`
- `marketing_campaign_projects`
- `marketing_h5_pages`
- `marketing_leads`
- `customer_project_log_shares`
- `customer_project_log_share_instances`

摄像头与视频：

- `project_cameras`
- `social_video_transcriptions`
- `social_video_scripts`

配置和审计：

- `system_settings`
- `system_setting_audit_logs`
- `ops_script_runs`
- `notifications`

### 5.4 外键和唯一约束调整

多租户后，很多唯一约束不能继续全局唯一。

示例：

```text
departments.code
posts.code
roles.code
customers.phone
marketing_h5_pages.slug
```

应调整为租户内唯一：

```sql
unique (tenant_id, code)
unique (tenant_id, phone)
unique (tenant_id, slug)
```

注意：

- `permissions.code` 仍然建议全局唯一。
- `tenants.slug` 应全局唯一。
- H5 页面如果使用全局 URL `/p/:slug`，则 `slug` 仍需要全局唯一；如果改成 `/t/:tenantSlug/p/:slug`，则可租户内唯一。

第一版建议：

```text
H5 slug 继续全局唯一
后续再升级为 /t/:tenantSlug/p/:slug
```

## 6. 后端改造方案

### 6.1 AuthContext 增加 tenant 信息

当前 `AuthContext` 需要增加：

```ts
tenantId: string | null;
tenantName: string | null;
tenantSlug: string | null;
tenantStatus: string | null;
isPlatformAdmin: boolean;
```

员工登录后：

```text
auth.users.id
-> employees.user_id
-> employees.tenant_id
-> tenants
```

客户登录后：

```text
auth.users.id
-> customers.user_id
-> customers.tenant_id
-> tenants
```

### 6.2 租户查询边界

所有 repository 查询必须显式接收 `tenantId`。

推荐模式：

```ts
repository.list({
  tenantId: authContext.tenantId,
  ...
});
```

不要在 service 中散落：

```ts
.eq("tenant_id", authContext.tenantId)
```

应沉到 repository 或统一查询工具中，便于审计。

### 6.2.1 异步任务中的租户上下文

不能假设所有业务都发生在 HTTP 请求内。worker、定时任务、消息通知、短信回调、H5 提交后的后续处理，都可能脱离当前请求上下文。

风险：

```text
HTTP 请求中有 AuthContext.tenantId
-> 创建异步任务时未保存 tenantId
-> worker 执行时没有租户上下文
-> 查询失败，或误用默认租户，或产生跨租户数据风险
```

原则：

- 创建异步任务时必须持久化 `tenant_id`。
- worker 执行任务时从任务记录主动加载 `tenant_id`。
- 定时任务按 `tenant_id` 分批处理，不使用“默认租户”兜底。
- 通知、短信、H5 线索跟进、视频转写、统计汇总都必须带租户上下文。

建议所有异步任务表增加：

```sql
tenant_id uuid not null references tenants(id)
```

典型影响范围：

- `notifications`
- 短信发送任务
- `social_video_transcriptions`
- `social_video_scripts`
- H5 线索后续跟进任务
- 工序验收短信 ticket
- `ops_script_runs`
- 平台统计汇总任务

对于平台级任务，例如汇总所有租户指标，需要显式标记：

```text
scope = platform
```

并且只能由平台超管或平台 worker 执行。

### 6.3 禁止默认全局查询

需要逐步替换这类代码：

```ts
SupabaseDB.from("customers").select("*")
```

改成：

```ts
customerRepository.list({ tenantId, ...query })
```

对于仍必须直接查表的临时路径，至少要有：

```ts
.eq("tenant_id", authContext.tenantId)
```

### 6.4 防止漏加 tenant 条件

这是多租户改造最高风险点之一。仅靠人工 code review 和 `rg` 排查不够可靠。

理想方案：

```text
统一数据访问层
-> repository 方法必须显式接收 tenantId
-> tenantId 缺失直接抛错
-> 所有业务表查询由 repository 统一拼 tenant 条件
```

如果后续引入 ORM 或查询构造层，可以增加全局租户拦截器：

```text
当前请求上下文 tenantId
-> 自动为租户表追加 tenant_id = currentTenantId
-> 平台超管查询必须显式声明 bypassTenantScope
```

当前 Fastify + Supabase Client 技术栈没有天然的全局查询拦截器，因此 MVP 阶段建议采用三层防护：

1. **Repository 参数约束**
   - 核心 repository 方法统一要求传入 `tenantId`。
   - 不允许 service 直接操作核心业务表。

2. **测试约束**
   - 核心 service 方法增加接口测试或集成测试。
   - 使用两个租户的数据和 token 调用接口，断言互不可见。

3. **静态排查脚本**
   - 增加脚本扫描 `from("customers") / from("projects") / from("employees")` 等直接查询。
   - 发现新增直接查询时，要求说明是否已加租户过滤。

平台级接口例外：

```text
/platform/*
```

必须显式标记为平台超管能力，不允许复用普通 admin 查询路径绕过租户过滤。

### 6.5 平台超管接口单独命名

平台超管接口建议统一前缀：

```text
/platform/tenants
/platform/tenants/:id
/platform/tenant-metrics
```

租户业务后台仍使用：

```text
/admin/customers
/admin/projects
/customers
/projects
```

不要让普通 admin 接口通过参数传 `tenant_id`，否则容易被伪造跨租户访问。

### 6.6 RLS 策略

当前后端大量使用 Supabase admin client，RLS 不能作为唯一防线。

建议分两层：

1. 后端代码层强制 tenant 过滤，这是 MVP 必须做的。
2. 后续逐步补 Supabase RLS，作为防御层。

第一版不要依赖 RLS 完成租户隔离，否则改造面会更大。

## 7. Admin 改造方案

### 7.1 租户内 admin

当前 admin 后台继续作为租户内后台。

登录后 `/api/auth/me` 或后端 `/admin/auth/me` 应返回：

```json
{
  "tenant": {
    "id": "tenant-id",
    "name": "某某装饰",
    "slug": "demo",
    "status": "active"
  },
  "employee": {},
  "roles": [],
  "permissions": []
}
```

admin 前端使用方式：

- 顶部展示当前公司名称。
- 所有业务页面不传 `tenant_id`。
- 后端根据登录态自动隔离。

### 7.2 平台超管后台

建议在同一个 admin 应用中新增平台管理区域。

仅 `platform_admin` 可见：

```text
/platform/tenants
/platform/tenants/new
/platform/tenants/:id
/platform/usage
```

第一版平台能力：

- 创建租户。
- 创建租户管理员员工。
- 停用租户。
- 查看租户基础用量：
  - 员工数
  - 客户数
  - 项目数
  - H5 页面数
  - 摄像头数

### 7.3 Admin 页面影响

以下页面主要依赖后端隔离，前端改动较小：

- 客户
- 项目
- 员工
- 组织架构
- 权限
- 费用审批
- 工地监控
- 营销活动
- 自媒体脚本

前端主要新增：

- 顶部租户名展示。
- 平台超管入口。
- 租户停用时提示。
- 无租户登录态时强制退出或提示账号未绑定公司。

## 8. 微信小程序端改造方案

### 8.1 小程序端不直接选择租户

第一版不建议让客户或员工在小程序中手动选择装修公司。

小程序端租户识别应来自登录态：

员工端：

```text
手机号 / 微信登录
-> 匹配 employees.user_id 或 phone
-> 得到 tenant_id
```

客户侧：

```text
微信登录 / 手机号绑定
-> 匹配 customers.user_id 或 phone
-> 得到 tenant_id
```

### 8.2 客户手机号跨租户问题

同一个手机号可能在多家装修公司都是客户。

因此多租户后，不能继续用全局唯一手机号匹配客户。

推荐规则：

```text
手机号 + tenant_id 唯一
```

如果小程序登录时只有手机号、没有租户上下文，会出现歧义。

解决方案：

1. 客户通过项目邀请、短信、H5 页面进入时带 `tenant_slug` 或 ticket。
2. ticket 校验后确定租户。
3. 如果手机号命中多个租户，展示“请选择服务公司”。

第一版建议优先使用 ticket / 项目邀请路径，避免让客户主动选择。

如果确实命中多家公司，必须进入公司选择态，不能默认选择第一家。

推荐登录响应：

```json
{
  "mode": "select_tenant",
  "tenants": [
    {
      "tenant_id": "tenant-a",
      "tenant_name": "A装饰",
      "customer_id": "customer-a",
      "project_count": 1,
      "latest_project_name": "绿城花园装修"
    },
    {
      "tenant_id": "tenant-b",
      "tenant_name": "B装饰",
      "customer_id": "customer-b",
      "project_count": 2,
      "latest_project_name": "万科城装修"
    }
  ]
}
```

小程序展示：

```text
请选择你要查看的装修公司

A装饰
绿城花园装修 · 1个项目

B装饰
万科城装修 · 2个项目
```

客户选择后调用：

```http
POST /customer/auth/select-tenant
```

请求：

```json
{
  "tenant_id": "tenant-a",
  "customer_id": "customer-a"
}
```

后端校验：

- 当前登录用户确实绑定该 `customer_id`，或手机号已验证且匹配该客户。
- `customer.tenant_id = tenant_id`。
- `tenant.status = active`。
- 该客户状态允许进入客户门户。

校验通过后，后端签发带租户上下文的客户会话：

```json
{
  "tenant_id": "tenant-a",
  "customer_id": "customer-a"
}
```

后续客户接口不再信任小程序直接传入的 `tenant_id`，只读取服务端会话或 token 中的租户上下文。

切换公司：

- 小程序“我的”页提供“切换装修公司”。
- 清除当前客户租户上下文。
- 回到公司选择页。

不建议：

- 不自动选择最近创建的公司。
- 不自动选择项目最多的公司。
- 不把多家公司的客户档案合并成一条。
- 不允许前端只传 `tenant_id` 就切换，必须后端校验客户归属。

### 8.3 未归属客户的处理

如果一个需要装修的客户登录后，不属于任意一家装修公司，不应强行归入默认租户，也不应创建到某个装修公司的 `customers` 表。

推荐进入平台访客态：

```text
微信 / 手机号登录
-> 查 customers.user_id 或 phone
-> 命中 0 个租户客户
-> 进入平台访客态
```

平台访客态不能访问：

- 项目列表。
- 施工日志。
- 工序验收。
- 摄像头。
- 租户客户资料。

平台访客态可以访问：

- 完善装修需求。
- 预约咨询。
- 选择城市、小区、面积、预算。
- 查看平台公开案例或公开活动。
- 提交装修需求。

建议新增平台线索表：

```text
platform_leads
- id
- user_id
- phone
- name
- city
- community
- area
- budget
- description
- source
- status
- assigned_tenant_id
- assigned_at
- created_at
```

流转规则：

```text
平台访客提交装修需求
-> 创建 platform_leads
-> 平台超管手动分配
-> 写入 assigned_tenant_id
-> 在目标 tenant 下创建 customers
-> 通知目标租户管理员
-> 客户再次登录进入该装修公司的客户态
```

注意：

- `platform_leads` 是平台级数据，不属于任何租户业务表。
- 分配前，租户管理员不能看到该线索。
- 分配后，目标租户只能看到转入后的客户或线索副本。
- 不允许使用默认租户承接未归属客户，否则会污染租户数据边界。

MVP 分配机制：

- 只做平台超管手动分配。
- 平台超管在平台后台查看 `platform_leads`。
- 选择目标租户后执行分配。
- 分配成功后，在目标租户下关联已有客户或创建新客户。
- 给目标租户管理员发送站内信。
- 如果短信配置可用，可以同时发送短信提醒。

分配后的客户去重规则：

```text
platform_lead.phone + target_tenant_id
-> 查询 customers
```

如果目标租户已存在相同手机号客户：

- 不重复创建 `customers`。
- 将 `platform_leads.assigned_customer_id` 关联到已有客户。
- 追加客户来源记录，例如 `source = platform_assigned` 或新增客户来源明细。
- 记录本次分配动作和分配人。
- 通知租户管理员“已有客户收到新的平台线索”。

如果目标租户不存在相同手机号客户：

- 创建新的 `customers`。
- 写入 `tenant_id = target_tenant_id`。
- `source = platform_assigned`。
- 将 `platform_leads.assigned_customer_id` 关联到新客户。
- 通知租户管理员“有新客户线索待跟进”。

建议 `platform_leads` 增加字段：

```text
assigned_customer_id
assigned_by_employee_id
assigned_note
```

### 8.3.1 平台线索分配细则

阶段 4 和阶段 5 实施平台线索分配时，后端必须把分配逻辑设计为原子操作。

接口建议：

```http
POST /platform/leads/:id/assign
```

请求：

```json
{
  "tenant_id": "target-tenant-id",
  "assigned_note": "客户所在区域适合分配给该装修公司"
}
```

后端执行步骤：

#### 步骤 1：查重

根据 `platform_leads.phone` 在目标租户的 `customers` 表中查找：

```text
customers.tenant_id = target_tenant_id
customers.phone = platform_leads.phone
```

#### 步骤 2：分支处理

情况 A：客户已存在

- 不创建新的 `customers` 记录。
- 将 `platform_leads.assigned_customer_id` 绑定到已存在的 `customer_id`。
- 为该客户追加新的线索来源记录：
  - 来源：`platform_lead`
  - 关联：`platform_lead_id`
  - 分配时间：`assigned_at`
- 推荐使用独立日志表记录来源明细，例如 `customer_sources`，不要只覆盖 `customers.source`。
- `customers.source` 保留客户首次来源，不被平台再次分配覆盖。
- 目的：保证客户 360° 视图完整，让租户知道该客户被平台再次推荐触达。

情况 B：客户不存在

- 在目标租户的 `customers` 表中创建新客户。
- 新客户字段来自 `platform_leads`：
  - 姓名
  - 电话
  - 城市
  - 小区
  - 面积
  - 预算
  - 装修需求描述
- 写入 `tenant_id = target_tenant_id`。
- 写入来源：`platform_lead` 或 `platform_assigned`。
- 将新生成的 `customer_id` 写入 `platform_leads.assigned_customer_id`。
- 目的：完成从平台公海线索到租户私域客户的转化。

#### 步骤 3：线索状态流转

分配完成后，更新 `platform_leads`：

```text
status = assigned
assigned_tenant_id = target_tenant_id
assigned_customer_id = customer_id
assigned_at = now()
assigned_by_employee_id = 当前平台超管员工 ID
assigned_note = 分配备注
```

原始 `platform_leads` 数据必须完整保留，用于：

- 平台与租户对账。
- 平台线索转化率分析。
- 问题排查。
- 分配审计。

#### 步骤 4：日志审计

建议新增：

```text
platform_lead_assign_logs
- id
- platform_lead_id
- target_tenant_id
- assigned_customer_id
- action
- dedupe_result
- operator_employee_id
- note
- created_at
```

`dedupe_result` 建议：

```text
existing_customer
created_customer
already_assigned
```

必须记录的动作：

- 查重结果。
- 创建客户。
- 绑定已有客户。
- 状态流转。
- 重复提交命中幂等。

#### 步骤 5：幂等性

分配接口必须幂等。

规则：

- 如果 `platform_leads.status = assigned` 且 `assigned_tenant_id` 与本次请求一致，直接返回已分配结果。
- 如果已分配给其他租户，拒绝重复分配，除非后续明确支持“重新分配”流程。
- 客户创建和 `platform_leads` 状态更新必须在同一个事务内完成。
- 不允许因网络重试创建重复客户。

#### 步骤 6：通知机制

分配成功后，无论是绑定已有客户还是创建新客户，都应通知目标租户管理员。

站内信必做，短信可在租户短信配置可用时发送。

统一通知文案：

```text
平台为您分配了一条来自【地区】的新线索：【客户姓名】【手机号】，请及时跟进。
```

通知记录必须带：

```text
tenant_id
platform_lead_id
assigned_customer_id
notification_scene = platform_lead_assigned
```

租户 admin 展示建议：

1. 客户详情页增加“线索来源时间线”
   - 展示首次来源。
   - 展示每次平台分配记录。
   - 展示分配时间、分配人、来源线索详情、备注。

2. 租户线索/客户列表增加标记
   - 如果平台线索绑定的是已有客户，显示“老客户新线索”。
   - 如果平台线索创建了新客户，显示“平台新线索”。
   - 租户管理员可以按这两个标记筛选。

3. 客户 360° 视图中的来源规则
   - `customers.source` 表示首次来源。
   - `customer_sources` 表示后续所有触达来源。
   - 平台分配、H5 表单、电话咨询、手动录入都应进入来源时间线。

后续增强：

- 按城市、区域、服务范围自动分配。
- 按租户容量或线索转化率分配。
- 支持租户拒收或退回平台线索。
- 支持平台线索分配审计和超时提醒。

### 8.4 小程序接口兼容

小程序请求体和返回结构尽量不新增 `tenant_id`。

后端通过 token 自动识别租户。

例如：

```http
GET /customer/projects
```

后端实际过滤：

```text
customers.user_id = 当前用户
customers.tenant_id = 当前租户
projects.tenant_id = 当前租户
```

### 8.5 小程序需新增的能力

员工端：

- 登录后缓存 tenant 信息。
- “我的”页面显示所属公司。
- 如果账号未绑定租户，显示“账号未绑定公司，请联系管理员”。

客户侧：

- 从短信、H5、项目邀请进入时保存 tenant 上下文。
- 客户绑定手机号时，如果匹配多个租户，需要展示选择或通过 ticket 自动确认。
- 客户未命中任何租户时，进入平台访客态，只展示装修需求提交和公开内容。
- 客户项目、施工日志、验收、摄像头均按租户隔离。

### 8.6 装修公司员工拓客路径：直绑定

装修公司员工通过分享小程序码、H5 活动页、报价表单等方式拓展客户时，客户扫码或点击链接后应直接绑定到该公司，不需要进入平台分配流程。

适用场景：

- 员工分享小程序码给潜在客户。
- 员工分享 H5 活动页。
- 员工分享报价或预约表单。
- 租户自己投放的二维码或广告链接。

#### 8.6.1 租户识别方式

小程序码建议携带分享短码：

```text
scene = share_token
```

后端通过 `share_token` 反查：

```text
tenant_id
share_employee_id
source
expires_at
```

H5 链接建议携带：

```text
https://h5.goodcms.cn/p/springsale?share_token=xxx
```

页面加载后缓存分享上下文：

```text
tenant_id
tenant_slug
share_employee_id
source
```

#### 8.6.2 后端行为

客户登录或注册后：

1. 校验分享上下文有效。
2. 反查目标租户。
3. 如果目标租户状态不是 `active`，拒绝绑定。
4. 在目标租户下按手机号查找客户。
5. 如果客户已存在：
   - 不重复创建客户。
   - 追加 `customer_sources`。
   - 记录本次员工分享触达。
6. 如果客户不存在：
   - 自动创建 `customers`。
   - 写入 `tenant_id = 分享租户`。
   - 写入首次来源，例如 `employee_share`、`h5_campaign`、`quote_form`。
7. 创建线索或来源记录并关联分享员工 ID。
8. 通知目标租户管理员和分享员工。

重要规则：

- 如果该手机号已在其他租户存在，不影响本次绑定。
- 同一个客户手机号允许同时成为多家装修公司的客户。
- 本链路不进入 `platform_leads`。
- 前端传入的 `tenant_id` 不可信，必须通过后端签发的 `share_token` 或可信页面 slug 校验。

#### 8.6.3 推荐数据结构

建议新增员工分享上下文表：

```text
tenant_share_links
- id
- tenant_id
- share_employee_id
- source
- target_type
- target_id
- token
- status
- expires_at
- created_at
```

过期策略：

- MVP 可先不强制过期，便于员工长期使用固定二维码。
- 表结构保留 `expires_at`。
- 后续可对活动页、报价表单、临时推广码设置过期时间。
- 如果 `expires_at` 已过期，后端拒绝绑定并提示链接已失效。

建议客户来源记录支持：

```text
customer_sources
- id
- tenant_id
- customer_id
- source
- source_detail
- source_employee_id
- related_type
- related_id
- created_at
```

#### 8.6.4 与平台分配路径的区别

| 对比维度 | 员工分享路径 | 平台分配路径 |
| --- | --- | --- |
| 租户归属 | 直接绑定到分享员工所属租户 | 先进入平台公海，再由平台分配 |
| 适用场景 | 员工主动拓客、租户自投放 | 平台统一获客、平台活动 |
| 数据表 | `customers` + `customer_sources` | `platform_leads` + 分配后 `customers` |
| 是否需要平台超管 | 不需要 | 需要 |
| 是否允许同手机号跨租户 | 允许 | 允许 |
| 通知对象 | 租户管理员 + 分享员工 | 租户管理员 |

#### 8.6.5 通知

直绑定成功后建议通知：

- 分享员工：你分享的客户已提交联系方式，请及时跟进。
- 租户管理员：员工拓客新增一条客户线索。

通知记录必须带：

```text
tenant_id
customer_id
source_employee_id
notification_scene = employee_share_customer_bound
```

## 9. H5 改造方案

### 9.1 H5 页面归属租户

`marketing_h5_pages` 必须增加 `tenant_id`。

H5 访问：

```text
https://h5.goodcms.cn/p/springsale
```

后端根据 `slug` 查询：

```text
slug -> page -> tenant_id
```

表单提交线索时写入：

```text
marketing_leads.tenant_id
marketing_leads.page_id
```

### 9.2 H5 表单提交

H5 提交线索时不信任前端传入的 `tenant_id`。

正确流程：

```text
H5 slug
-> 后端查询 page
-> 得到 tenant_id
-> 创建 tenant_id 下的 lead/customer
```

如果 H5 带小程序短期 token：

```text
token -> customer_id -> tenant_id
```

也必须和页面 `tenant_id` 一致，否则拒绝。

### 9.3 H5 页面 slug 策略

MVP 建议继续全局唯一：

```text
/p/:slug
```

后续可升级：

```text
/t/:tenantSlug/p/:slug
```

升级后好处：

- 不同装修公司可以使用相同活动路径。
- SEO 和品牌识别更清晰。
- 后续支持独立域名更自然。

## 10. 租户创建流程

平台超管创建租户：

```text
输入公司名称、slug、管理员手机号
-> 创建 tenants
-> 创建默认部门
-> 创建默认岗位
-> 创建默认角色
-> 创建租户管理员员工
-> 绑定 auth user 或等待手机号登录绑定
```

默认初始化数据：

- 默认部门：总经办、销售部、设计部、工程部、财务部。
- 默认岗位：沿用当前 `EmployeePostCode` 字典。
- 默认角色：
  - 租户管理员
  - 客户经理
  - 设计师
  - 项目经理 / 监理
  - 财务
- 默认权限模板：从当前内置角色复制。

### 10.1 租户模板版本管理

租户初始化不能只做一次性脚本。后续标准部门、岗位、角色、权限模板升级时，需要能对已存在租户做增量升级。

建议新增模板版本表：

```text
tenant_templates
- id
- code
- version
- name
- payload
- status
- created_at

tenant_template_applications
- id
- tenant_id
- template_code
- template_version
- status
- applied_at
- error_message
```

使用方式：

1. 平台维护默认模板，例如 `decoration_company_standard@v1`。
2. 创建租户时记录应用的模板版本。
3. 模板升级到 v2 时，平台超管可发起“租户模板升级任务”。
4. 升级任务只做增量补齐，不覆盖租户已自定义的名称、角色权限和组织结构。

MVP 可以先不做完整 UI，但 migration 和租户初始化服务应保留模板版本字段。

## 11. 实施阶段

### 阶段 0：规划和防护

目标：不改业务行为，先建立改造边界。

任务：

1. 新建 `feature/multi-tenant` 分支。
2. 新增本文档。
3. 列出所有业务表和必须租户化字段。
4. 增加后端开发规则：新增业务表必须考虑 `tenant_id`。
5. 增加核心 service/repository 的租户隔离测试计划。
6. 增加直接 Supabase 查询扫描脚本，优先覆盖 `customers / projects / employees`。
7. 梳理所有定时任务、worker、通知、短信、视频转写和 H5 后续处理逻辑，明确每个异步链路如何传递 `tenant_id`。
8. 搭建性能测试环境，对核心接口执行基准压测，锁定改造前性能基线。

性能基线要求：

- 在阶段 2 开始前，选定 `main` 分支一个稳定提交作为基线版本。
- 使用接近生产结构的数据量进行测试。
- 至少覆盖：
  - `GET /customers`
  - `GET /projects`
  - `GET /employees`
  - 项目详情接口
  - 客户详情接口
- 记录指标：
  - 平均响应时间
  - P95
  - P99
  - 错误率
  - 数据库慢查询日志
- 阶段 2 完成后，使用相同测试环境、相同数据规模、相同压测脚本重新测试。
- 性能对比以 P95 和 P99 为主要判断指标，平均响应时间只做参考。

验收：

- 文档评审通过。
- 分支可持续从 `main` 合并。

### 阶段 1：默认租户和身份上下文

目标：现有系统仍单租户运行，但数据已有租户归属。

任务：

1. 新增 `tenants` 表。
2. 创建默认租户。
3. `employees` 增加 `tenant_id` 并回填。
4. `customers / projects / properties` 增加 `tenant_id` 并回填。
5. `AuthContext` 增加 tenant 字段。
6. admin 登录态返回 tenant 信息。

验收：

- 现有 admin、小程序、H5 功能不变。
- 登录后可获得当前 `tenantId`。
- 现有数据全部属于默认租户。

### 阶段 2：核心业务隔离

目标：客户、项目、员工三大核心模块完成租户隔离。

任务：

1. customer repository/service 全部加 tenant 过滤。
2. project repository/service 全部加 tenant 过滤。
3. employee/organization/role 全部加 tenant 过滤。
4. 创建、更新时自动写入 `tenant_id`。
5. ID 访问必须校验数据属于当前租户。
6. 编写双租户集成测试：
   - 使用 A/B 两个租户 token。
   - 创建同名客户、项目、员工。
   - 调用列表和详情接口，断言只能看到本租户数据。
7. 对核心列表接口做性能检查，确认新增 `tenant_id` 过滤后索引命中正常。

验收：

- A 租户无法通过 ID 访问 B 租户客户、项目、员工。
- 列表接口只返回本租户数据。
- 创建数据自动归属本租户。
- 项目、客户列表 API 完成性能基准测试。
- 在模拟 10 个租户、每租户 10 万条项目/客户级数据时，核心列表接口响应时间相比单租户基线增加不超过 10%。
- 如果达不到指标，必须补充 `(tenant_id, created_at)`、`(tenant_id, status)`、`(tenant_id, owner_id)` 等复合索引后再继续扩大改造范围。
- 未完成性能对比测试或测试未达标时，不进入阶段 3。

### 阶段 3：业务模块租户化

目标：把当前主要业务闭环全部隔离。

任务：

1. 费用审批租户化。
2. 工序验收租户化。
3. 施工日志和评论租户化。
4. 摄像头绑定租户化。
5. 任务中心租户化。
6. 自媒体脚本租户化。

验收：

- 所有员工端业务列表只显示本租户数据。
- 所有详情接口不能跨租户访问。
- 待办、统计、首页数据按租户统计。

### 阶段 4：营销、H5、线索租户化

目标：每家装修公司可以独立配置营销活动和 H5 页面。

任务：

1. H5 页面增加 `tenant_id`。
2. H5 slug 查询关联租户。
3. 营销活动、线索、页面 builder 全部租户化。
4. 线索去重改为租户内去重。
5. H5 表单提交按页面租户写入。

验收：

- 不同租户的营销活动互不可见。
- H5 页面提交的线索进入正确租户。
- 同手机号在不同租户可分别成为线索或客户。

### 阶段 5：平台超管能力

目标：支持平台运营人员管理多个装修公司。

任务：

1. admin 新增 `/platform/tenants`。
2. 支持创建租户。
3. 支持创建租户管理员。
4. 支持停用租户。
5. 支持基础用量统计。

验收：

- 平台超管能创建新装修公司。
- 新租户管理员能登录并只看到本公司空数据。
- 停用租户后，该租户员工不能继续操作。

### 阶段 6：分析只读库和平台数据洞察

目标：作为 2.0 后续规划，在不影响主业务库性能和租户隔离安全的前提下，支持平台级经营分析和租户报表。

MVP 阶段不实施独立分析库。
MVP 阶段不做复杂 ETL 或 CDC 开发。

MVP 统计策略：

- 租户内报表基于主库查询。
- 所有统计必须带 `tenant_id`。
- 高频统计字段增加复合索引，例如 `(tenant_id, created_at)`、`(tenant_id, status)`。
- 平台级全局指标不做实时复杂聚合。
- 如果确实需要平台概览，使用定时任务写入汇总表。

平台汇总表示例：

```text
platform_tenant_daily_metrics
- id
- tenant_id
- metric_date
- customer_count
- project_count
- lead_count
- active_employee_count
- created_at
```

定时任务：

```text
每天/每小时按 tenant_id 聚合关键指标
-> 写入汇总表
-> 平台看板读取汇总表
```

这样可以避免平台看板直接在主业务表做跨租户实时大聚合。

长期建议后续引入：

建议后续引入：

```text
业务主库
-> ETL / 定时任务 / CDC
-> 分析只读库或数据仓库
-> 平台运营看板 / 租户经营报表
```

分析数据可以保留 `tenant_id`，但对租户侧报表仍只能返回本租户聚合结果。

典型场景：

- 平台运营查看全局租户活跃度。
- 平台查看各租户客户数、项目数、H5 线索数。
- 平台查看各租户短视频识别时长和 AI 脚本生成用量。
- 平台查看各租户 AI token 消耗和模型调用成本。
- 租户查看本公司月度线索转化、项目进度、费用趋势。
- 后续做套餐计费、用量计费、运营预警。

MVP 不建议直接在主业务接口里做复杂跨租户聚合。

原因：

- 跨租户聚合容易绕开业务权限边界。
- 大查询会影响业务库。
- 分析指标口径会频繁变化，独立分析层更适合迭代。

## 11.1 优先级调整

| 优先级 | 任务 | 说明 |
| --- | --- | --- |
| P0 | 阶段 0：规划和防护 | 建立改造边界，避免后续新增代码继续扩大债务 |
| P0 | 阶段 1：默认租户和身份上下文 | 多租户地基，必须先完成 |
| P0 | 阶段 2：核心业务隔离 | 客户、项目、员工是最高风险模块 |
| P0 | 客户手机号跨租户匹配策略 | 直接影响小程序客户登录和项目查看体验 |
| P1 | 阶段 3：其他业务模块租户化 | 按费用、验收、日志、摄像头、任务中心推进 |
| P1 | 阶段 4：营销 / H5 / 线索租户化 | 业务增长链路需要尽快隔离 |
| P2 | 阶段 5：平台超管能力 | 商业化必需，但可在核心隔离后推进 |
| P2 | 平台指标汇总表 | MVP 如需平台概览，优先用定时汇总表 |
| 2.0 | 阶段 6：分析只读库架构 | 后续为平台运营和租户报表打基础 |

## 12. 测试重点

必须补充租户隔离测试清单。

核心测试：

1. A 租户员工不能访问 B 租户客户详情。
2. A 租户员工不能访问 B 租户项目详情。
3. A 租户管理员不能看到 B 租户员工。
4. A 租户 H5 线索不会进入 B 租户。
5. 同手机号可在 A/B 两个租户分别存在。
6. 小程序客户从 A 租户短信进入，只能看到 A 租户项目。
7. 平台超管可以看租户列表，但租户管理员不能访问平台接口。
8. 租户停用后，员工登录和接口访问被拦截。

## 13. 主要风险

### 13.1 数据串租

这是最高风险。

解决：

- 后端代码层强制 tenant 过滤。
- 关键接口增加跨租户访问测试。
- repository 层统一封装租户查询。

### 13.2 旧代码漏加 tenant_id

当前有不少 controller/service 直接调用 Supabase。

解决：

- 先从核心模块改造。
- 新增 code review 规则。
- 使用 `rg "from(\"customers\")|from(\"projects\")|from(\"employees\")"` 定期检查。

### 13.3 客户手机号匹配歧义

同一手机号可能属于多个装修公司。

解决：

- 登录态和邀请 ticket 优先带租户。
- 手机号只在租户内唯一。
- 多租户命中时需要选择公司或通过 ticket 自动确认。

### 13.4 系统配置混用

短信、腾讯云、H5 配置如果继续全局共享，会导致租户品牌和通知错误。

解决：

- 配置读取支持租户覆盖。
- 默认平台配置只作为兜底。

## 14. 推荐 MVP 范围

第一版不要追求完整 SaaS 商业化，只做可安全承载多装修公司的基础能力。

MVP 包含：

- 默认租户。
- 新租户创建。
- 租户管理员登录。
- 员工、客户、项目租户隔离。
- H5 页面和线索租户隔离。
- 小程序客户项目按租户隔离。

MVP 不包含：

- 套餐计费。
- 独立域名。
- 每租户独立数据库。
- 完整用量计费。
- 租户自助注册。
- 复杂组织审批模板市场。

## 14.1 开发启动前待确认

建议研发和产品团队在启动阶段 1 开发前，先确认以下产品细节：

1. 客户已存在时，租户端“老客户新线索”的打标与展示逻辑
   - 在客户列表展示，还是只在客户详情展示。
   - 是否进入租户线索列表。
   - 是否需要待跟进状态。
   - 是否支持租户管理员筛选“老客户新线索”。
   - 是否需要单独提醒客户负责人。

2. 平台访客态小程序页面的具体交互设计
   - 未归属客户登录后的首页展示。
   - 装修需求表单字段。
   - 是否展示公开案例、公开活动、平台介绍。
   - 提交需求后的成功态。
   - 需求提交后是否允许修改。
   - 分配到租户后的提示和进入路径。

## 15. 推荐下一步

建议下一步在 `feature/multi-tenant` 分支执行：

1. 创建分支。
2. 新增 `tenants` migration。
3. 给 `employees / customers / projects / properties` 加 `tenant_id` 并回填默认租户。
4. 修改 `AuthorizationService`，让 `AuthContext` 带 tenant。
5. 先只改客户和项目列表接口，验证隔离方式。

完成阶段 1 后，再决定是否扩大到组织权限和 H5。
