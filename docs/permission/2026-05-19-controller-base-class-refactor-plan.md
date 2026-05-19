# Controller 基类拆分规划

日期：2026-05-19

## 背景

本轮权限线基础整改已经完成：

- `SupabaseDB.from()` 兼容方法已删除。
- `BaseController` 默认 CRUD 已禁用。
- `createResourceRoutes()` 已要求显式声明 CRUD 注册配置。
- 高风险默认 CRUD 资源已整改。
- `check:permission-boundaries` 已接入 dev 和生产镜像构建 workflow。

下一步不再是堵权限漏洞，而是降低 controller 里重复的鉴权代码，并让新增接口天然选择正确边界。

## 目标

拆分三个更明确的 controller 基类：

- `TenantBaseController`
- `PlatformBaseController`
- `PublicBaseController`

这三个基类只提供上下文和边界工具，不恢复默认 CRUD。

## 基类职责

### TenantBaseController

适用场景：

- 租户后台业务接口
- 员工端接口
- 需要 `tenantId` 的业务接口

能力：

- `getRequiredAuthContext(request)`
- `getRequiredTenantContext(request)`
- `assertPermission(authContext, permissionCode)`
- 常用 `idParamSchema`
- 继续支持 `registerExtraRoutes()`

硬性规则：

- 必须有登录态。
- 必须有租户上下文。
- 访问租户数据必须显式带 `tenant_id`，或先通过业务访问策略校验。

不做的事：

- 不提供默认 CRUD。
- 不替 service/repository 做业务判断。

### PlatformBaseController

适用场景：

- 超管平台接口
- 平台租户管理
- 平台计费中心
- 平台运维、发布、审计
- 平台 AI 配置

能力：

- `getRequiredAuthContext(request)`
- `getRequiredPlatformAdminContext(request)`
- 常用 `idParamSchema`
- 继续支持 `registerExtraRoutes()`

硬性规则：

- 必须有登录态。
- 必须满足 `authContext.isPlatformAdmin === true`。
- 平台接口不能隐式落到租户上下文。

不做的事：

- 不提供默认 CRUD。
- 不允许普通租户角色绕过 service 访问平台数据。

### PublicBaseController

适用场景：

- H5 公开页面
- 公开线索提交
- 分享页、助力页、公开二维码
- 微信登录入口等未登录入口

能力：

- `getOptionalAuthContext(request)`，仅在确实需要时提供。
- share token / ticket / tenant slug 等公开访问边界工具。
- 继续支持 `registerExtraRoutes()`

硬性规则：

- 默认没有登录态。
- 不允许直接访问租户私有数据。
- 访问租户数据必须通过公开 token、share token、ticket、tenant slug + published 状态等边界。

不做的事：

- 不使用 `getAdminClient()` 查询私有数据，除非 service 已完成公开边界校验。

## Controller 分类清单

### 租户业务类

优先迁移到 `TenantBaseController`：

- `customer`
- `employee`
- `departments`
- `payment`
- `expense-requests`
- `expense-request-categories`
- `projects`
- `roles`
- `external-referrers`
- `project-referrals`
- `project-logs`
- `project-log-comments`
- `project-acceptances`
- `posts`
- `properties`
- `department-post-rules`
- `employee-permissions`
- `task-center`
- `project-cameras`
- `tenant-share-links` 的租户侧接口
- `notifications`
- `usage` 的租户侧接口
- `billing` 的租户侧接口
- `social-video` 的租户侧接口
- `ai` 装修问答接口
- `uploads`
- `customer-follow-up-comments`

### 平台业务类

优先迁移到 `PlatformBaseController`：

- `platform-tenants`
- `platform-leads` 的平台管理接口
- `platform-audit-logs`
- `admin-ops`
- `ai-config`
- `permissions`
- `identity-diagnostics`
- `user-auth-events`
- `tenant-devices` 的平台接口
- `usage` 的平台接口
- `billing` 的平台接口
- `marketing-pages` 的平台接口
- `system-settings`

### 公开/混合入口类

需要谨慎拆分，部分接口可能需要拆 controller：

- `wechat`
- `admin-auth`
- `customer-self-service`
- `customer-project-log-shares`
- `marketing-pages`
- `platform-leads` 的公开线索提交接口
- `tenant-share-links` 的公开 token 查询接口
- `projects` 的 `/front/projects` 公开项目接口
- `customer-project-log-shares` 的 `/share-campaigns/*` 公开接口
- `customer-project-log-shares` 的公开 voucher/qrcode 接口

建议这类 controller 不要直接整体迁移到单一基类，先按路由边界拆文件或拆 class。

## 混合 Controller 拆分原则

混合 controller 是后续最容易再次产生权限边界误判的地方，不建议整体迁移到某一个基类。

拆分时按路由前缀和访问身份先拆 class，再决定继承哪个基类：

| 当前 controller | 当前混合点 | 建议拆分 |
| --- | --- | --- |
| `marketing-pages` | `/platform/marketing-pages`、`/marketing-pages`、`/public/marketing-pages` 混在一起 | 拆成 `PlatformMarketingPagesController`、`TenantMarketingPagesController`、`PublicMarketingPagesController` |
| `billing` | 租户账单和平台计费中心混在一起 | 拆成 `TenantBillingController`、`PlatformBillingController` |
| `usage` | 租户用量和平台用量混在一起 | 拆成 `TenantUsageController`、`PlatformUsageController` |
| `tenant-devices` | 租户设备资产和平台腾讯云设备管理混在一起 | 拆成 `TenantDevicesController`、`PlatformDevicesController` |
| `platform-leads` | 公开线索提交和平台线索管理混在一起 | 拆成 `PublicPlatformLeadsController`、`PlatformLeadsController` |
| `tenant-share-links` | 租户生成链接和公开 token 查询混在一起 | 拆成 `TenantShareLinksController`、`PublicTenantShareLinksController` |
| `customer-project-log-shares` | 客户、员工、公开分享、营销中心接口混在一起 | 先按 `customer` / `employee` / `public` 三组拆，再评估营销中心是否单独拆 |
| `projects` | 后台项目 CRUD、项目成员、`/front/projects` 公开接口混在一起 | 公开项目接口单独拆到 `PublicProjectsController` |
| `uploads` | 后台上传、公开 URL、COS 直传确认混在一起 | 按上传场景保留显式权限和 scene 校验，暂不急于整体继承单一基类 |
| `wechat` | 登录入口、解绑、换绑审批、H5 session 混在一起 | 先维持现状，后续按多端登录重构文档拆 `AuthEntryController` 和员工审批接口 |

拆分后的 controller 命名必须表达边界，不使用只有业务名但无法识别身份边界的名字。

## 迁移优先级

### 阶段 1：平台低风险试点

目标：验证 `PlatformBaseController` 形态。

建议顺序：

1. `platform-audit-logs`
2. `identity-diagnostics`
3. `user-auth-events`
4. `permissions`

原因：

- 都是平台管理员接口。
- 租户上下文较少。
- 风险边界清晰。

验收：

- 接口路径和响应结构不变。
- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `PlatformBaseController` 内只提供鉴权辅助，不接触 Supabase。
- 每个迁移 controller 至少有一个平台管理员上下文入口，例如 `getRequiredPlatformAdminContext(request)`。

### 阶段 2：租户低风险试点

目标：验证 `TenantBaseController` 形态。

建议顺序：

1. `expense-request-categories`
2. `posts`
3. `external-referrers`
4. `payment`

原因：

- 已经完成显式权限边界。
- controller 相对小。
- 适合抽取通用租户上下文方法。

验收：

- 必须要求租户上下文。
- 权限点和 service 逻辑不变。
- 路径和响应结构不变。
- `TenantBaseController` 不替 service 拼业务查询，只提供 `tenantId`、权限和参数校验辅助。
- controller 内不能新增 `tenant_id` 以外的隐式越权查询条件。

### 阶段 3：拆混合 controller

目标：把公开接口和后台接口分开。

候选：

- `marketing-pages`
- `customer-project-log-shares`
- `tenant-share-links`
- `platform-leads`
- `projects` 的公开项目接口

建议：

- 不直接把混合 controller 继承某个基类。
- 先按路由边界拆成 public/platform/tenant controller。
- 拆完后再继承对应基类。

验收：

- 公开接口只继承 `PublicBaseController`。
- 后台接口不再和公开接口共享 controller-level helper。
- 公开接口的 service 方法名必须显式带 public/open/share/token 等语义，避免误用后台 service。

### 阶段 4：迁移租户大 controller

目标：把大型租户 controller 迁移到 `TenantBaseController`，同时保持业务行为不变。

建议顺序：

1. `project-referrals`
2. `project-logs`
3. `project-log-comments`
4. `project-acceptances`
5. `projects`
6. `customer`
7. `employee`

注意：

- 大型 controller 不要一次性重构 service/repository。
- 每次只迁移一个 controller 的基类和上下文 helper。
- 涉及项目归属、客户归属、员工身份的接口必须保留现有访问策略。

验收：

- 现有 admin 页面和接口响应结构不变。
- 租户 A 不能访问租户 B 数据。
- 客户/员工身份接口不因迁移混用后台员工权限。

### 阶段 5：收敛 BaseController

当迁移完成后：

1. `BaseController` 只保留公共 schema 和 `registerExtraRoutes()`。
2. 或改名为 `ControllerBase`，避免误解为 CRUD 基类。
3. 删除旧的 `createSchema/updateSchema` 泛型，如果没有 controller 再依赖。

验收：

- 新增 controller 不再直接继承旧 `BaseController`。
- `BaseController` 内没有任何默认 CRUD 方法。
- `createResourceRoutes()` 后续可按资源显式绑定 controller 方法，不再暗示继承 CRUD。

## 第一批迁移清单

| 优先级 | Controller | 建议基类 | 原因 | 验收重点 |
| --- | --- | --- | --- | --- |
| P0 | `platform-audit-logs` | `PlatformBaseController` | 平台只读接口，边界最清晰 | 平台管理员校验不变 |
| P0 | `identity-diagnostics` | `PlatformBaseController` | 只给超管排查身份数据 | 普通租户无法访问 |
| P0 | `user-auth-events` | `PlatformBaseController` | 平台审计类接口 | 查询条件和分页不变 |
| P0 | `permissions` | `PlatformBaseController` | 已完成平台强校验 | 默认 CRUD 不恢复 |
| P1 | `expense-request-categories` | `TenantBaseController` | 租户基础配置，体量小 | tenant scope 不变 |
| P1 | `posts` | `TenantBaseController` | 已完成部门岗位重构相关整改 | tenant scope 不变 |
| P1 | `external-referrers` | `TenantBaseController` | 已修复租户私有边界 | 不能跨租户读写 |
| P1 | `payment` | `TenantBaseController` | 已用项目归属约束租户边界 | 项目访问策略不变 |
| P2 | `billing` | 拆分后迁移 | 平台和租户混合 | 先拆 controller |
| P2 | `usage` | 拆分后迁移 | 平台和租户混合 | 先拆 controller |
| P2 | `marketing-pages` | 拆分后迁移 | 平台、租户、公开混合 | 公开接口不能混后台 helper |
| P2 | `tenant-devices` | 拆分后迁移 | 平台设备和租户设备混合 | 腾讯云平台能力单独隔离 |

## 新增接口规则

后续新增 controller 必须先回答三个问题：

1. 这是租户接口、平台接口，还是公开接口？
2. 数据边界来自 `tenantId`、`isPlatformAdmin`，还是公开 token/ticket？
3. 是否需要新增权限点，还是复用已有权限点？

禁止：

- 新 controller 直接继承 `BaseController` 后暴露默认 CRUD。
- controller 内直接依赖 Supabase RLS 判断后台业务权限。
- 公开接口直接查询租户私有数据。

## 验收命令

每次迁移一个 controller 后至少执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
```

如果涉及数据库访问方式，还要执行：

```bash
rg -n "SupabaseDB\\.getClient\\(" apps/api/src -S
rg -n "SupabaseDB\\.from\\(" apps/api/src -S
```

## CI 卡点

当前已有 `check:permission-boundaries` 接入 dev 和生产镜像构建 workflow。后续拆基类时，CI 必须继续卡住以下问题：

- 新增 `SupabaseDB.from()`。
- 新增 `SupabaseDB.getClient()`。
- 新增未显式传入第三个参数的 `createResourceRoutes()`。
- 恢复 `BaseController` 默认 CRUD。

如果阶段迁移过程中发现 CI 没有覆盖某类权限线问题，优先增强 `scripts/check-permission-boundaries.ts`，再继续迁移业务 controller。

## 第一批建议

下一步建议先实现 `PlatformBaseController`，并迁移 `platform-audit-logs` 作为最小试点。

试点完成后，再迁移 `identity-diagnostics` 和 `user-auth-events`。这三个完成后，再决定是否继续批量迁移平台接口。

## 执行记录

### 2026-05-19 阶段 1 试点

已完成：

- 新增 `PlatformBaseController`。
- `PlatformBaseController` 只提供 `getRequiredAuthContext()`、`assertPlatformAdmin()`、`getRequiredPlatformAdminContext()`。
- 迁移 `platform-audit-logs` 到 `PlatformBaseController`。
- 保持 `platformAuditLogService.list()` 的平台管理员校验不变，形成 controller + service 双层校验。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续迁移 `identity-diagnostics`。
- 再迁移 `user-auth-events`。
- 两个只读平台排查类 controller 完成后，再迁移 `permissions`。

### 2026-05-19 阶段 1 收口

已完成：

- 迁移 `identity-diagnostics` 到 `PlatformBaseController`。
- 迁移 `user-auth-events` 到 `PlatformBaseController`。
- 迁移 `permissions` 到 `PlatformBaseController`。
- 删除 `permissions` controller 内重复的局部 `getRequiredAuthContext()` 和 `assertPlatformAdmin()`。
- `permissions` 保留显式 CRUD override，不恢复 `BaseController` 默认 CRUD。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 进入平台写操作类 controller：`platform-tenants`、`ai-config`。
- 这两类会修改平台配置或租户状态，迁移时需要逐接口确认请求体校验和审计记录不变。

### 2026-05-19 平台写操作试点

已完成：

- 迁移 `platform-tenants` 到 `PlatformBaseController`。
- 列表、创建、详情、更新、停用、启用接口统一使用 `getRequiredPlatformAdminContext()`。
- 保持 `platformTenantService` 内的平台管理员校验不变。
- 保持租户创建初始化、租户状态更新、审计日志记录逻辑不变。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 迁移 `ai-config`。
- `ai-config` 是平台 AI 供应商、模型、场景路由配置入口，迁移时需要确认新增/更新接口的请求体验证不变。

### 2026-05-19 平台 AI 配置入口迁移

已完成：

- 迁移 `ai-config` 到 `PlatformBaseController`。
- 平台 AI 配置查询、供应商新增/更新、模型新增/更新、场景路由新增/更新接口统一使用 `getRequiredPlatformAdminContext()`。
- 保持 `AiProviderPayloadSchema`、`UpdateAiProviderPayloadSchema`、`AiModelPayloadSchema`、`UpdateAiModelPayloadSchema`、`AiSceneRoutePayloadSchema`、`UpdateAiSceneRoutePayloadSchema` 请求体验证不变。
- 保持 `aiConfigService` 内平台管理员校验和平台审计日志记录逻辑不变。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 迁移 `admin-ops`。
- `admin-ops` 涉及运维脚本、微服务健康、版本发布，需要先确认现有平台管理员校验是否每个入口都一致。

### 2026-05-19 运维入口迁移

已完成：

- 迁移 `admin-ops` 到 `PlatformBaseController`。
- 统一使用 `getRequiredPlatformAdminContext()` 获取平台管理员上下文。
- 删除 `assertOpsPermission()`，不再允许非平台管理员通过 `system.ops.*` 或 `system.release.*` 权限点访问运维发布入口。
- 保持运维脚本、微服务健康、版本发布、创建 tag、回滚 tag、发布 dispatch 的请求体验证和 service 调用不变。

特别说明：

- `admin-ops` 已明确为纯平台管理员入口。
- 运维脚本、微服务健康、版本发布、创建 tag、回滚 tag、发布 dispatch 都属于平台级高危能力，不下放给租户权限点体系。
- `system.ops.*` 和 `system.release.*` 后续如果仍保留，应只用于前端旧菜单兼容或未来独立的低危运维读权限，不再作为当前 `/admin/ops/*` API 的准入依据。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 迁移 `system-settings`。
- `system-settings` 同时支持平台配置和租户配置，需要先确认平台配置与租户覆盖配置的边界，不能直接套纯平台管理员口径。

### 2026-05-19 System Settings 边界核查

已完成：

- 核查 `system-settings` controller、service、repository、migration 和 admin 页面调用方式。
- 确认 `system-settings` 是平台配置与租户短信覆盖配置的混合入口。
- 形成独立核查文档：[System Settings 权限边界核查](./2026-05-19-system-settings-boundary-audit.md)。

结论：

- 暂不建议直接把 `system-settings` 改成纯 `getRequiredPlatformAdminContext()`。
- 直接收紧会导致租户侧“自有短信通道”配置无法读取和保存。
- 后续应先补 `TenantBaseController`，再拆 `/platform/system-settings` 和 `/tenant/system-settings`。

下一步建议：

- 先实现 `TenantBaseController`。
- 用 `expense-request-categories` 或 `posts` 做低风险租户 controller 试点。
- Tenant 基类稳定后，再回头拆 `system-settings`。

### 2026-05-19 Tenant 基类试点

已完成：

- 新增 `TenantBaseController`。
- `TenantBaseController` 只提供 `getRequiredAuthContext()`、`assertTenantContext()`、`getRequiredTenantContext()`、`assertPermission()`。
- 迁移 `expense-request-categories` 到 `TenantBaseController`。
- `expense-request-categories` controller 统一使用 `getRequiredTenantContext()`，进入 service 前必须具备租户上下文。
- 保持 `expenseRequestCategoryService` 内权限点校验、费用分类编码/名称唯一性校验和 repository 调用不变。

特别说明：

- `TenantBaseController` 不允许无租户上下文的平台管理员直接访问租户业务接口。
- 这与平台接口的 `PlatformBaseController` 明确分离，避免平台账号在没有选定租户时误读租户业务数据。
- 如果未来需要平台代租户操作，应设计显式的“选择目标租户”接口，不应复用普通租户 controller。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续迁移低风险租户 controller：`posts`。
- 再迁移 `external-referrers` 和 `payment`。

### 2026-05-19 Posts 租户 Controller 迁移

已完成：

- 迁移 `posts` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 和 `accessPolicyService` 依赖。
- 岗位列表、创建、详情、更新接口统一使用 `getRequiredTenantContext()`。
- 保持 `postsService` 内岗位编码生成、部门存在校验、岗位名称校验和 repository 调用不变。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 迁移 `external-referrers`。
- 再迁移 `payment`。

### 2026-05-19 External Referrers 租户 Controller 迁移

已完成：

- 迁移 `external-referrers` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 外部介绍人列表、详情、创建、更新接口统一使用 `getRequiredTenantContext()`。
- 保持 `externalReferrerService` 内租户上下文校验、`project_referral.read` / `project_referral.manage` 权限校验和 repository 租户过滤不变。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 迁移 `payment`。

### 2026-05-19 Payment 租户 Controller 迁移

已完成：

- 迁移 `payment` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 收款列表、详情、创建、更新接口统一使用 `getRequiredTenantContext()`。
- 保持 `paymentService` 内项目可见性、`project.read` / `project.update` 权限校验和项目归属访问策略不变。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

阶段结论：

- 第一批低风险租户 controller 已完成：`expense-request-categories`、`posts`、`external-referrers`、`payment`。
- `TenantBaseController` 形态可继续推广到更大的租户业务 controller。

下一步建议：

- 迁移 `roles` 和 `employee-permissions` 前先核查权限模型。
- 或先迁移较独立的 `notifications`、`task-center`，继续扩大低风险样本。

### 2026-05-19 Notifications 租户 Controller 迁移

已完成：

- 迁移 `notifications` 到 `TenantBaseController`。
- 删除 controller 内直接 `authorizationService` 依赖。
- 通知列表、未读汇总、标记已读接口统一使用 `getRequiredTenantContext()`。
- 保持 `notificationService` 内按当前 `employeeId` 查询和标记本人通知的逻辑不变。

特别说明：

- `notifications` 虽然 service 当前以 `employeeId` 为主边界，但接口属于租户后台个人通知能力。
- controller 层要求租户上下文后，平台超管无租户身份不能直接访问租户通知接口。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 迁移 `task-center`。

### 2026-05-19 Task Center 租户 Controller 迁移

已完成：

- 迁移 `task-center` 到 `TenantBaseController`。
- 删除 controller 内直接 `authorizationService` 依赖。
- 待办列表、待办汇总接口统一使用 `getRequiredTenantContext()`。
- 保留 `task_center.read` 或 `dashboard.read` 的入口权限判断。
- 保持 `taskCenterService` 内按租户、员工、业务权限点构建客户跟进、施工日志、费用申请、工序验收待办的逻辑不变。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

阶段结论：

- 个人通知和待办中心两个低风险租户入口已完成迁移。
- 下一组涉及权限模型，不建议直接迁移。

下一步建议：

- 先核查 `roles` / `employee-permissions` 权限模型并形成文档。
- 确认角色、权限点、员工权限覆盖的租户边界后，再迁移 controller。

### 2026-05-19 Roles / Employee Permissions 权限模型核查

已完成：

- 核查 `roles` controller、service、repository、schema、migration 和 admin 角色管理页。
- 核查 `employee-permissions` controller、service、repository 和 admin 员工角色弹窗。
- 形成独立核查文档：[Roles / Employee Permissions 权限模型核查](./2026-05-19-roles-employee-permissions-boundary-audit.md)。

结论：

- `roles` 可以先迁移到 `TenantBaseController`。
- `employee-permissions` 需要分口径处理：`/auth/me/permissions` 保留普通 auth 口径，员工授权接口使用租户上下文。
- `permissionService` 中普通员工授权接口不应保留平台管理员跨租户绕过逻辑。

下一步建议：

- 先迁移 `roles`。
- 再迁移 `employee-permissions`，并同步收紧目标员工租户校验。

### 2026-05-19 Roles 租户 Controller 迁移

已完成：

- 迁移 `roles` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 和 `accessPolicyService` 依赖。
- 角色列表、详情、创建、更新、角色权限绑定接口统一使用 `getRequiredTenantContext()`。
- 保留 `employee.permission_manage` 权限判断。
- 保持 `permissionService` 内租户角色上下文、角色编码生成、角色权限绑定逻辑不变。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 迁移 `employee-permissions`，保留 `/auth/me/permissions` 普通 auth 口径，并收紧员工授权接口的目标员工租户校验。

### 2026-05-19 Employee Permissions 租户 Controller 迁移

已完成：

- 迁移 `employee-permissions` 到 `TenantBaseController`。
- `/auth/me/permissions` 保留普通 `getRequiredAuthContext()`，支持平台管理员和租户员工读取自身权限上下文。
- 员工权限详情、员工角色绑定、员工权限覆盖新增和删除接口统一使用 `getRequiredTenantContext()`。
- 员工授权类接口保留 `employee.permission_manage` 权限判断。
- `permissionService` 新增目标员工租户校验，员工授权、权限覆盖、权限上下文查询必须确认目标员工属于当前租户。
- 删除普通员工授权接口中的平台管理员跨租户绕过逻辑。

特别说明：

- 平台超管后续如需跨租户查看或调整员工权限，应新增独立平台接口，不再复用租户员工授权接口。
- 当前改动不影响 `/auth/me/permissions`，避免平台超管后台读取自身登录上下文时被租户上下文拦截。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

阶段结论：

- `roles` 和 `employee-permissions` 这一组租户权限管理入口已完成 controller 基类迁移。
- 员工授权路径已形成 controller 入口校验和 service 目标员工租户校验两层边界。

下一步建议：

- 继续迁移仍继承 `BaseController` 的租户业务 controller，优先选择 `expense-requests` 或 `projects` 前先做业务边界核查。

### 2026-05-19 Expense Requests 权限边界核查与迁移

已完成：

- 核查费用申请 controller、service、repository、schema。
- 形成独立核查文档：[Expense Requests 权限边界核查](./2026-05-19-expense-requests-boundary-audit.md)。
- 迁移 `expense-requests` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 列表、详情、审批模板、审批候选人、待办、统计、创建、修改、提交、审批、驳回、撤回、登记打款接口统一使用 `getRequiredTenantContext()`。
- `expenseRequestService` 新增 `requireTenantId()`，费用申请业务不再使用平台管理员无租户兼容口径。
- 保留原有 `expense_request.read`、`expense_request.create`、`expense_request.submit`、`expense_request.approve_manager`、`expense_request.approve_finance`、`expense_request.pay` 权限判断。

特别说明：

- `expense-requests` 是租户后台费用审批能力，平台超管跨租户查看或管理费用申请需要后续新增独立平台接口。
- 本次没有改小程序端和 admin 端接口路径，仅收紧后端租户上下文边界。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续迁移 `projects` 前先做专项边界核查，重点关注项目成员、客户、工地日志、验收、设备等关联资源。

### 2026-05-19 Projects 权限边界核查与迁移

已完成：

- 核查项目 controller、service、repository、项目成员 service、项目成员 repository、schema。
- 形成独立核查文档：[Projects 权限边界核查](./2026-05-19-projects-boundary-audit.md)。
- 迁移 `projects` 到 `TenantBaseController`。
- 后台租户项目接口统一使用 `getRequiredTenantContext()`。
- 公开项目展示接口保持公开口径，不新增后台登录要求。
- 项目列表、详情、创建、更新、删除、项目成员、创建项目候选客户和员工接口保留原有权限点判断。
- `projectMemberService` 补项目和员工同租户校验，防止跨租户绑定项目成员。
- 设计师、工程负责人同步到 `project_members` 时带入租户校验。

特别说明：

- `projects` controller 当前仍包含较多 Supabase 查询和序列化逻辑，后续可以拆到 service / repository，但本次只做权限边界收紧。
- 公开项目接口仍依赖 `visibility_status` 和项目状态控制展示，不属于后台租户接口。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查并迁移 `project-logs`，以项目 `tenant_id` 和 `project.read` / `project.update` 作为核心边界。

### 2026-05-19 Project Logs 权限边界核查与迁移

已完成：

- 核查项目日志 controller 和 schema。
- 形成独立核查文档：[Project Logs 权限边界核查](./2026-05-19-project-logs-boundary-audit.md)。
- 迁移 `project-logs` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 项目日志列表、详情、创建、更新、按项目查询、日历查询统一使用 `getRequiredTenantContext()`。
- 项目查询和项目日志查询必须带当前租户 `tenantId`。
- 保留 `project.read` 和 `project_log.create` 权限判断。

特别说明：

- `project-logs` 当前仍未拆 service / repository，本次只收紧权限边界。
- 公开项目日志展示不在该 controller 中，本次不改变公开项目接口。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查并迁移 `project-log-comments`，评论应以日志、项目和租户三者归属为核心边界。

### 2026-05-19 Project Log Comments 权限边界核查与迁移

已完成：

- 核查项目日志评论 controller 和 schema。
- 形成独立核查文档：[Project Log Comments 权限边界核查](./2026-05-19-project-log-comments-boundary-audit.md)。
- 迁移 `project-log-comments` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 保留客户评论链路的客户身份和项目归属校验。
- 员工评论链路在访问项目日志时使用 `getRequiredTenantContext()`。
- 员工评论链路增加员工租户必须等于日志 `tenant_id` 的显式校验。

特别说明：

- `project-log-comments` 是员工和客户混合入口，不能整体强制租户员工上下文。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查并迁移 `project-acceptances`，该模块同时涉及员工、客户、整改回复和验收状态流转，需要先做专项边界核查。

### 2026-05-19 Project Acceptances 权限边界核查与迁移

已完成：

- 核查工序验收 controller、service、repository、open ticket repository、schema。
- 形成独立核查文档：[Project Acceptances 权限边界核查](./2026-05-19-project-acceptances-boundary-audit.md)。
- 迁移 `project-acceptances` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 员工后台验收接口统一使用 `getRequiredTenantContext()`。
- 模板读取也要求租户上下文，避免平台登录态直接访问租户业务入口。
- 客户确认 / 疑问接口保持客户身份和 open ticket 口径。
- `projectAcceptanceService` 新增 `requireTenantId()`，员工操作不再使用平台管理员无租户兼容口径。

特别说明：

- `project-acceptances` 是员工和客户混合入口，不能整体强制租户员工上下文。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查并迁移 `project-cameras`，设备和项目归属应以项目租户、设备租户和摄像头绑定关系作为核心边界。

### 2026-05-19 Project Cameras 权限边界核查与迁移

已完成：

- 核查项目摄像头 controller、service、repository、租户设备 repository、schema。
- 形成独立核查文档：[Project Cameras 权限边界核查](./2026-05-19-project-cameras-boundary-audit.md)。
- 迁移 `project-cameras` 到 `TenantBaseController`。
- 员工侧 `resolveActor()` 改为必须具备租户上下文。
- 绑定项目选项和项目摄像头分组接口先要求租户上下文，再计算项目可见范围。
- 客户查看摄像头和客户获取播放参数接口保持客户身份口径。

特别说明：

- `project-cameras` 是员工和客户混合入口，不能整体强制租户员工上下文。
- 平台设备运维能力应继续走平台设备接口，不应复用租户项目摄像头接口。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查并迁移 `tenant-share-links` 或 `tenant-devices`。如果优先项目相关链路，建议先处理 `tenant-share-links`；如果优先设备资产链路，建议先处理 `tenant-devices`。

### 2026-05-19 Tenant Share Links 权限边界核查与迁移

已完成：

- 核查租户分享链接 controller、service、repository、schema 和绑定 RPC。
- 形成独立核查文档：[Tenant Share Links 权限边界核查](./2026-05-19-tenant-share-links-boundary-audit.md)。
- 迁移 `tenant-share-links` 到 `TenantBaseController`。
- 创建分享链接和分享链接列表接口统一使用 `getRequiredTenantContext()`。
- service 从 `assertTenantId()` 改为 `assertTenantContext()`，平台管理员无租户上下文不能直接创建或查看租户员工分享链接。
- 公开 token 详情接口保持 public 口径。

特别说明：

- `tenant-share-links` 是员工和公开分享混合入口，不能整体强制后台租户上下文。
- 微信绑定链路仍通过 `wechat` controller 调用 RPC，后续如调整需要单独形成微信小程序对接文档。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查并迁移 `tenant-devices`，该模块同时包含租户设备资产和平台设备运维接口，需要按平台侧 / 租户侧拆清边界。

### 2026-05-19 Tenant Devices 权限边界核查与迁移

已完成：

- 核查租户设备资产 controller、service、repository、schema 和项目摄像头绑定关系。
- 形成独立核查文档：[Tenant Devices 权限边界核查](./2026-05-19-tenant-devices-boundary-audit.md)。
- 迁移 `tenant-devices` 到 `TenantBaseController`。
- 租户设备资产接口统一使用 `getRequiredTenantContext()`。
- 租户侧 service 改为接收 controller 已校验的 `AuthContext`，不再重复用 `authUserId` 读取上下文。
- service 增加 `assertTenantDeviceAccess()`，统一校验员工身份、权限点和租户上下文。
- 平台设备运维接口保留平台管理员校验和审计日志。

特别说明：

- `tenant-devices` 当前是平台侧和租户侧混合 controller，后续可以拆成 `tenant-devices` 和 `platform-devices` 两个 controller。
- 租户侧设备权限当前复用 `project.read` / `project.update`，后续可升级为独立设备权限点。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查并迁移 `departments` / `department-post-rules`，组织架构是租户侧基础权限数据，建议优先收紧。

### 2026-05-19 Departments / Department Post Rules 权限边界核查与迁移

已完成：

- 核查部门 controller、部门岗位规则 controller、service、repository 和 schema。
- 形成独立核查文档：[Departments / Department Post Rules 权限边界核查](./2026-05-19-departments-boundary-audit.md)。
- 迁移 `departments` 到 `TenantBaseController`。
- 迁移 `department-post-rules` 到 `TenantBaseController`。
- 删除两个 controller 内重复的 `authorizationService` 依赖。
- 部门 CRUD 和批量启用统一使用 `getRequiredTenantContext()`。
- 部门岗位规则接口统一使用 `getRequiredTenantContext()`。
- 部门岗位规则读取保留 `employee.read` 权限点，修改保留 `employee.update` 权限点。

特别说明：

- `departments` 当前仍直接访问 Supabase，后续可以继续拆 service / repository。
- 旧 `departments` 表仍是兼容层，主模型应继续以 `tenant_departments` 为准。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查 `properties` 或 `customer`。如果按基础资料链路推进，建议先处理 `properties`。

### 2026-05-19 Properties 权限边界核查与迁移

已完成：

- 核查房产 controller、service 和 schema。
- 形成独立核查文档：[Properties 权限边界核查](./2026-05-19-properties-boundary-audit.md)。
- 迁移 `properties` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 房产列表、详情、创建、更新统一使用 `getRequiredTenantContext()`。
- 创建房产时写入确定的 `tenant_id`，不再允许空租户写入。

特别说明：

- `properties` 当前仍有部分 Supabase 访问在 controller 内，后续可以继续拆 service / repository。
- 客户详情下的房产接口在 `customer` controller 中，后续处理客户模块时需要一起核查。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查 `project-referrals` 或 `customer-follow-up-comments`。如果继续按客户基础资料链路推进，建议先处理 `project-referrals`。

### 2026-05-19 Project Referrals 权限边界核查与迁移

已完成：

- 核查项目介绍费 controller、service、repository 和 schema。
- 形成独立核查文档：[Project Referrals 权限边界核查](./2026-05-19-project-referrals-boundary-audit.md)。
- 迁移 `project-referrals` 到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 列表、详情、创建、更新、按项目查询、登记支付统一使用 `getRequiredTenantContext()`。
- service 新增 `requireTenantId()`，不再允许平台管理员无租户上下文进入租户介绍费业务。
- 列表在 `project_referral.read` scope 为 `all` 时，先收敛到当前租户项目 ID。
- 登记支付补充项目可访问范围校验。

特别说明：

- `project_referrals` 表当前没有冗余 `tenant_id`，租户边界依赖项目归属。
- 本次没有修改小程序端代码。

验收：

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。

下一步建议：

- 继续核查 `customer-follow-up-comments`，它和客户跟进、客户归属边界相关，范围比完整 `customer` controller 更小。
