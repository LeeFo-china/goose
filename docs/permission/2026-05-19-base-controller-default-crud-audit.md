# BaseController 默认 CRUD 权限审计

日期：2026-05-19

## 背景

`createResourceRoutes()` 会为资源自动注册：

- `GET /:resource`
- `GET /:resource/:id`
- `POST /:resource`
- `PATCH /:resource/:id`
- `PUT /:resource/:id`

这些路由默认绑定 `BaseController.list/getById/create/update`。默认实现直接使用 `SupabaseDB.from(this.tableName)`，没有后台登录校验、没有权限点校验，也没有租户边界过滤。

因此后续禁止新增依赖 `BaseController` 默认 CRUD 的资源。已经存在的资源必须逐个迁移为显式 controller + service + repository。

## 本次审计范围

来源文件：

- `apps/api/src/routes/index.ts`
- `apps/api/src/routes/factory.ts`
- `apps/api/src/controllers/BaseController.ts`

当前通过 `createResourceRoutes()` 注册的资源共 15 个。

## 资源分类清单

| 资源 | 数据表 | 类型 | 默认 CRUD 状态 | 风险等级 | 处理建议 |
| --- | --- | --- | --- | --- | --- |
| `customers` | `customers` | 租户核心数据 | 已覆盖 4 个默认方法 | 低 | 保持现状，后续只做基类迁移 |
| `employees` | `employees` | 租户核心数据 | 已覆盖 4 个默认方法 | 低 | 保持现状，后续只做基类迁移 |
| `departments` | `departments` / `tenant_departments` | 租户组织数据 | 已覆盖 4 个默认方法 | 低 | 保持现状，继续推进新版部门模型 |
| `payments` | `payments` | 租户财务数据 | 已覆盖 4 个默认方法 | 已整改 | 第一版通过项目归属校验租户权限 |
| `expense-requests` | `expense_requests` | 租户财务审批 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `expense-request-categories` | `expense_request_categories` | 租户配置 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `projects` | `projects` | 租户核心数据 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `roles` | `roles` | 租户权限配置 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `permissions` | `permissions` | 平台权限字典 | 已覆盖 4 个默认方法，已补登录/平台管理员校验 | 已整改 | 平台权限点管理仅允许平台管理员 |
| `external-referrers` | `external_referrers` | 介绍人/财务相关数据 | 未覆盖，仍走默认 CRUD | 高 | 必须优先迁移，并确认是否需要补 `tenant_id` |
| `project-referrals` | `project_referrals` | 租户财务数据 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `project-logs` | `project_logs` | 租户项目过程数据 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `project-acceptances` | `project_acceptances` | 租户工序验收数据 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `posts` | `posts` | 租户岗位配置 | 已覆盖 4 个默认方法 | 低 | 保持现状 |
| `properties` | `properties` | 租户客户资产数据 | 已覆盖 4 个默认方法 | 低 | 保持现状 |

## 高风险项

### 1. `payments`（已整改）

现状：

- `PaymentController` 已覆盖 `list/getById/create/update`。
- 已新增 `PaymentService` / `PaymentRepository`。
- repository 使用 admin client。
- `payments` 表早期模型仍只有 `project_id`，没有直接 `tenant_id`。

已关闭的风险：

- 后台用户不能再通过默认 CRUD 绕过项目权限查看或修改其它租户项目的收款记录。
- 创建、更新、读取都通过项目归属和项目权限做边界判断。

当前口径：

1. 列表读取使用 `project.read` 的项目可见范围。
2. 单条读取使用 `project.read` 校验项目访问权。
3. 创建和更新使用 `project.update` 校验项目操作权。
4. 收款记录必须关联项目，不允许创建或更新成无项目归属记录。
5. 中期仍建议给 `payments` 表补 `tenant_id`，从项目继承并建索引，避免通过项目 ID 列表过滤带来的性能上限。

### 2. `external-referrers`

现状：

- `ExternalReferrersController` 只继承 `BaseController`。
- `GET/POST/PATCH/PUT /external-referrers` 全部走默认 CRUD。
- `external_referrers` 表当前没有 `tenant_id`。

风险：

- 外部介绍人含手机号、银行卡、微信、支付宝等敏感信息。
- 如果它应该归属租户，现在无法做租户隔离。
- 如果它应该是平台级主档，也缺少平台管理员校验。

建议：

1. 先拍板模型：介绍人是租户私有，还是平台共享主档。
2. 更推荐租户私有：补 `tenant_id`，按租户隔离。
3. 新增 `ExternalReferrerService` / `ExternalReferrerRepository`。
4. 所有接口必须走 `project_referral.manage/read` 或独立权限点。

### 3. `permissions`（已整改）

现状：

- `PermissionsController` 已覆盖默认 CRUD。
- `list/getById/create/update/delete` 已读取 `AuthContext`，并校验 `authContext.isPlatformAdmin`。
- `permissionService` 使用 admin client 访问权限字典。

已关闭的风险：

- 非平台管理员不能再通过权限字典接口读取、创建、更新或删除平台权限点。

当前口径：

1. `permissions` 权限字典管理限制为平台管理员。
2. 租户侧角色配置继续走 `roles`、`employee-permissions` 等租户接口。
3. 租户端不直接维护平台权限字典。

## 后续分阶段执行

### 阶段 1：止血

目标：不再新增默认 CRUD 风险。

- 在 `docs/permission` 明确规范。
- 新增资源不得只继承 `BaseController` 后交给 `createResourceRoutes()`。
- 代码评审中看到没有 `override list/getById/create/update` 的资源 controller，直接退回。

### 阶段 2：修复高风险接口

优先顺序：

1. `external-referrers`

每个资源都必须补：

- controller 只处理 HTTP
- service 做业务权限和租户边界
- repository 使用 admin client
- 错误响应通过 `Errors`

### 阶段 3：基类拆分

建议拆分：

- `TenantBaseController`
- `PlatformBaseController`
- `PublicBaseController`

但不要急着直接替换。先完成高风险资源显式迁移，再逐步抽象。

### 阶段 4：删除兼容层

当所有 `createResourceRoutes()` 资源都不再依赖默认 CRUD 后：

1. 删除或限制 `BaseController.list/getById/create/update`。
2. 删除 `SupabaseDB.from()` 兼容方法。
3. 将 `createResourceRoutes()` 改成只注册显式传入的 handler。

## 验收命令

```bash
rg -n "createResourceRoutes\\(" apps/api/src/routes/index.ts
rg -n "override (list|getById|create|update) =" apps/api/src/controllers -S
rg -n "SupabaseDB\\.from\\(" apps/api/src -S
```

当前验收口径：

- `external-referrers` 是默认 CRUD 高风险遗留项。
- `payments` 默认 CRUD 风险已整改，当前通过项目归属做租户边界。
- `permissions` 平台权限字典鉴权缺口已整改。
- 其它资源已显式覆盖默认 CRUD，但后续仍建议迁移到更清晰的基类结构。
