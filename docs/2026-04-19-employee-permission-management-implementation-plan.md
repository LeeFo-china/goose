# 员工权限管理完整落地执行方案

日期：2026-04-19

## 当前执行状态

截至 2026-04-19，以下阶段已经落地：

1. `@gooes/domain` 权限值域与权限码常量已补齐
2. 权限系统基础表 migration 已落远端 Supabase
3. `roles / permissions / employee-permissions` 基础接口已接通
4. 以下资源已开始接入权限校验与范围控制：
   - `customers`
   - `employees`
   - `projects`
   - `expense-requests`
   - `project-referrals`

当前仍处于“第一轮接入”阶段。

已完成的重点：

- 接口访问已经不再只校验“是否登录”
- `employees` 已按 `employee.read/create/update` 接入
- `customers` 已按 `customer.read/create/update` 接入
- `projects` 已按 `project.read/create/update` 接入
- `expense-requests` 已按查看、提交、审批、支付等动作接入
- `project-referrals` 已按查看、管理、支付接入

当前限制：

- 还没有把所有现有业务资源全部切入统一权限体系
- 数据范围策略是 v1 版本，已可用，但后续仍可继续细化
- 还没有补完整的前端权限管理后台页面

## 背景

当前仓库已经具备员工登录和非常粗粒度的角色字段：

- 员工表有 `role` / `status`，见 [types/database.ts](/Users/leefo/Public/work/gooes/types/database.ts:152)
- `@gooes/domain` 已定义员工角色值域 `admin | employee | finance`，见 [packages/domain/src/employee.ts](/Users/leefo/Public/work/gooes/packages/domain/src/employee.ts:1)
- JWT 已经携带 `roles`，见 [utils/jwt.ts](/Users/leefo/Public/work/gooes/utils/jwt.ts:5)
- `plugins/auth.ts` 已经完成“是否登录”的校验，见 [plugins/auth.ts](/Users/leefo/Public/work/gooes/plugins/auth.ts:1)

但现状还不是一套正式的员工权限系统。

主要问题：

1. 只有“登录鉴权”，没有“访问授权”
2. 只有 `employees.role`，没有权限码、权限模板、员工级覆盖
3. 路由没有绑定权限要求，资源 CRUD 基本都是直接暴露
4. 没有数据范围模型，无法表达“只能看自己”“只能看本部门”“可看全部”
5. 部门、岗位只是组织结构，不是权限结构
6. 当前 `admin | employee | finance` 粒度太粗，无法支撑菜单级、按钮级、动作级权限

因此，现有数据结构只能支撑非常粗的角色分流，不能支撑正式的权限管理。

---

## 一、目标

本次方案目标：

1. 支持员工登录后的正式访问授权
2. 支持菜单级、接口级、动作级权限控制
3. 支持数据范围控制
4. 支持角色模板授权
5. 支持员工级权限覆盖
6. 保持与当前 `employees.role` 兼容，避免一次性打断现有业务
7. 所有稳定值域统一收口到 `@gooes/domain`
8. 保持符合当前项目分层规范：
   - controller 只处理 HTTP
   - service 处理业务编排
   - repository / gateway 直接访问 Supabase / SQL / RPC

---

## 二、核心结论

## 1. 不建议只扩充 `employees.role`

继续只往 `employees.role` 里加值，例如：

- `project_manager`
- `hr`
- `designer_manager`

这种做法很快会失控。

原因：

1. 角色会越来越多
2. 角色和权限会强耦合
3. 无法表达“同角色不同权限”
4. 无法表达数据范围
5. 前后端都会充满 if role === xxx 的硬编码

所以，`employees.role` 只能保留为“系统级粗身份”，不能继续充当完整权限模型。

## 2. 最佳实践是“系统角色 + 业务角色模板 + 权限码 + 数据范围”

建议采用四层模型：

1. `employees.role`
   继续保留，用于系统级粗身份和兼容现有逻辑

2. `roles`
   业务角色模板，例如：
   - 设计主管
   - 项目经理
   - 财务专员
   - 市场主管

3. `permissions`
   稳定权限点，例如：
   - `project.read`
   - `project.create`
   - `project.update`
   - `employee.read`
   - `expense_request.approve_manager`

4. `access_scope`
   数据范围，例如：
   - `self`
   - `department`
   - `assigned`
   - `all`

这套模型可以同时解决“能不能访问”和“能看多少数据”两个问题。

## 3. 当前仓库应采用“兼容式演进”，不要推倒重来

建议保留：

- `employees.role`
- 现有 JWT 结构
- 现有 `plugins/auth.ts`

在此基础上新增：

- 权限表
- 角色模板表
- 员工角色关联表
- 路由授权层
- 数据范围过滤服务

这样改动风险最低。

---

## 三、建议权限模型

## 1. 系统角色 `employees.role`

继续保留当前值域：

- `admin`
- `employee`
- `finance`

职责：

1. 作为系统启动期的粗分流
2. 兼容现有业务逻辑
3. 兼容 JWT 里的 `roles`
4. 作为“默认角色模板分配”的依据

注意：

- 以后不要再往这里继续堆业务岗位
- 业务岗位放到新 `roles` 表

## 2. 业务角色模板 `roles`

建议新增 `roles` 表，存可配置角色模板。

示例：

- 设计师
- 设计主管
- 项目经理
- 项目总监
- 财务审核员
- 行政专员

这些角色不是登录身份，而是授权模板。

## 3. 权限码 `permissions`

建议按 `resource.action` 命名。

示例：

- `dashboard.read`
- `customer.read`
- `customer.create`
- `customer.update`
- `project.read`
- `project.create`
- `project.update`
- `project.delete`
- `employee.read`
- `employee.create`
- `employee.update`
- `employee.permission_manage`
- `expense_request.read`
- `expense_request.create`
- `expense_request.submit`
- `expense_request.approve_manager`
- `expense_request.approve_finance`
- `expense_request.pay`
- `project_referral.read`
- `project_referral.manage`

命名规则必须稳定，不要中英文混用，也不要临时拼。

## 4. 数据范围 `access_scope`

建议收口成稳定值域：

- `self`
- `department`
- `assigned`
- `all`

语义：

- `self`：只能看自己创建 / 自己归属的数据
- `department`：能看本部门数据
- `assigned`：能看指派给自己的数据
- `all`：能看全部数据

这个范围不应该靠前端判断，必须在后端 service/repository 层落实。

## 5. 员工级覆盖

建议支持员工级权限覆盖：

- `allow`
- `deny`

这样可以解决“同岗位个别员工特殊授权”的真实场景。

例如：

- 某位设计主管临时可代审费用单
- 某位财务只能看报销，不能看提成

---

## 四、数据结构设计

## 1. 新增 `roles`

```sql
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

建议 `code` 使用稳定英文值，例如：

- `design_manager`
- `project_manager`
- `finance_reviewer`

## 2. 新增 `permissions`

```sql
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

说明：

- `code` 是单一事实来源
- `module / resource / action` 是为了方便后台管理、前端分组和统计

## 3. 新增 `role_permissions`

```sql
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  access_scope text NOT NULL DEFAULT 'self',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission_id)
);
```

说明：

- 一个角色模板可以拥有多个权限
- 同一个权限在不同角色上可以有不同数据范围

## 4. 新增 `employee_roles`

```sql
CREATE TABLE IF NOT EXISTS public.employee_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, role_id)
);
```

说明：

- 一个员工可以挂多个业务角色模板
- 这比继续扩充 `employees.role` 更合理

## 5. 新增 `employee_permission_overrides`

```sql
CREATE TABLE IF NOT EXISTS public.employee_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  effect text NOT NULL,
  access_scope text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, permission_id)
);
```

说明：

- `effect`：`allow | deny`
- `access_scope`：只有 `allow` 时才有意义
- `deny` 优先级应高于角色模板授权

## 6. `employees.role` 的处理原则

当前不要删除 `employees.role`。

它继续保留，作为：

1. 登录后的系统身份
2. 老逻辑兼容字段
3. 默认角色模板分配依据

例如：

- `admin` 默认绑定 `system_admin`
- `finance` 默认绑定 `finance_base`
- `employee` 默认绑定 `employee_base`

等业务代码全部切换稳定之后，再评估是否弱化其语义。

---

## 五、`@gooes/domain` 需要同步更新的内容

这次权限系统会引入新的稳定值域，必须进 `packages/domain`。

## 1. 新增 `packages/domain/src/permission.ts`

建议新增：

```ts
export const ROLE_STATUS_VALUES = ['active', 'inactive'] as const;
export type RoleStatus = (typeof ROLE_STATUS_VALUES)[number];

export const PERMISSION_STATUS_VALUES = ['active', 'inactive'] as const;
export type PermissionStatus =
  (typeof PERMISSION_STATUS_VALUES)[number];

export const ACCESS_SCOPE_VALUES = [
  'self',
  'department',
  'assigned',
  'all',
] as const;
export type AccessScope = (typeof ACCESS_SCOPE_VALUES)[number];

export const PERMISSION_OVERRIDE_EFFECT_VALUES = [
  'allow',
  'deny',
] as const;
export type PermissionOverrideEffect =
  (typeof PERMISSION_OVERRIDE_EFFECT_VALUES)[number];
```

## 2. 权限码常量建议也放进 domain

因为权限码会同时出现在：

- 后端 schema
- 后端 authorize 中间件
- 前端菜单显隐
- 前端按钮显隐
- 管理后台授权配置

所以建议把稳定权限码一并收口：

```ts
export const PERMISSION_CODE_VALUES = [
  'dashboard.read',
  'customer.read',
  'customer.create',
  'customer.update',
  'project.read',
  'project.create',
  'project.update',
  'project.delete',
  'employee.read',
  'employee.create',
  'employee.update',
  'employee.permission_manage',
  'expense_request.read',
  'expense_request.create',
  'expense_request.submit',
  'expense_request.approve_manager',
  'expense_request.approve_finance',
  'expense_request.pay',
  'project_referral.read',
  'project_referral.manage',
] as const;
```

## 3. 建议补配置映射

例如：

```ts
export const AccessScopeConfig = {
  self: { label: '仅自己' },
  department: { label: '本部门' },
  assigned: { label: '指派范围' },
  all: { label: '全部数据' },
};
```

## 4. 需要同步更新导出

需要更新：

- `packages/domain/src/index.ts`
- `packages/domain/src/shared.ts`

---

## 六、后端落地设计

## 1. 鉴权层拆分

当前 `plugins/auth.ts` 只负责：

- token 是否存在
- token 是否有效

建议继续保留这层，只负责“认证”。

然后新增“授权层”：

- `plugins/authorization.ts`
- 或 `utils/auth/authorize.ts`

职责：

1. 从 `request.user.sub` 找到当前员工
2. 读取员工角色模板和权限
3. 合并员工级覆盖
4. 生成 `request.authContext`

建议结构：

```ts
type RequestAuthContext = {
  authUserId: string;
  employeeId: string | null;
  systemRole: 'admin' | 'employee' | 'finance' | null;
  roleCodes: string[];
  permissions: Array<{
    code: string;
    scope: 'self' | 'department' | 'assigned' | 'all';
  }>;
};
```

## 2. 路由声明权限要求

建议新增声明式能力，不要在 controller 里到处手写 if。

例如：

```ts
@Get('/projects')
@RequirePermissions(['project.read'])
async listProjects() {}
```

或者在路由注册里声明：

```ts
fastify.get('/projects', {
  preHandler: [authorize('project.read')],
}, controller.list);
```

如果一个接口需要多个权限，应支持：

- `allOf`
- `anyOf`

但 v1 先支持单权限即可。

## 3. 数据范围必须落在 service/repository

不能只做“有无权限”的路由拦截。

还必须做“查多少数据”的过滤。

例如 `project.read`：

- `self`：只能看自己负责 / 自己创建的项目
- `department`：只能看本部门员工负责的项目
- `assigned`：只能看分配给自己的项目
- `all`：看全部

建议新增：

- `services/access-policy.ts`

职责：

1. 解析当前用户某权限的最大可用范围
2. 生成查询过滤条件
3. 给各业务 service 调用

示例：

```ts
const projectScope = accessPolicy.getScope(authContext, 'project.read');
const filters = accessPolicy.buildProjectFilters(authContext, projectScope);
```

## 4. 权限计算优先级

建议固定优先级：

1. `admin` 系统角色可直接全放行
2. 员工级 `deny` 优先级最高
3. 员工级 `allow` 次之
4. 多角色模板权限取并集
5. 同一权限出现多个范围时，取最大范围

范围优先级建议：

```text
self < assigned < department < all
```

## 5. 缓存建议

权限查询会频繁发生，建议做短缓存。

可选方式：

1. 进程内缓存 30~60 秒
2. Redis 缓存
3. JWT 不直接固化细权限，只缓存身份，权限仍以后端实时计算为准

当前项目先做进程内短缓存即可，不建议第一版把全部权限写进 JWT。

原因：

- 权限变更后 JWT 不会立刻失效
- 很容易出现“前端刚改角色，接口还没生效”的问题

---

## 七、前端对接原则

前端只能做“显示层权限”，不能代替后端授权。

前端应做：

1. 菜单显隐
2. 按钮显隐
3. 页面内禁止操作提示

后端必须做：

1. 接口访问拦截
2. 数据范围过滤
3. 非法操作拒绝

前端需要的最小接口能力：

1. 获取当前登录员工权限上下文
2. 获取角色模板列表
3. 获取权限树
4. 给员工分配角色
5. 给员工做权限覆盖

建议新增：

- `GET /auth/me/permissions`
- `GET /roles`
- `GET /permissions`
- `POST /employees/:id/roles`
- `POST /employees/:id/permission-overrides`

---

## 八、执行顺序

建议按这个顺序落地，风险最低。

## 第一阶段：定义 domain

先做：

1. `packages/domain/src/permission.ts`
2. `index.ts` / `shared.ts` 导出
3. 权限码常量和范围枚举

原因：

- domain 必须成为值域单一事实来源
- 后续 migration、schema、前端都会依赖它

## 第二阶段：数据库 migration

新增：

1. `roles`
2. `permissions`
3. `role_permissions`
4. `employee_roles`
5. `employee_permission_overrides`

并补：

1. check constraint
2. unique index
3. 必要的外键
4. `updated_at` trigger

## 第三阶段：repository 层

新增：

1. `repositories/roles.ts`
2. `repositories/permissions.ts`
3. `repositories/employee-permissions.ts`

职责：

1. 查员工角色模板
2. 查权限列表
3. 聚合员工最终权限

## 第四阶段：service 层

新增：

1. `services/authorization.ts`
2. `services/access-policy.ts`

职责：

1. 生成最终权限上下文
2. 解析权限码
3. 计算有效数据范围
4. 产出业务查询过滤条件

## 第五阶段：controller / route 层

新增：

1. `controllers/roles/index.ts`
2. `controllers/permissions/index.ts`
3. `controllers/employee-permissions/index.ts`

并新增：

1. `authorize()` 预处理器
2. `RequirePermissions` 装饰器或路由元数据

## 第六阶段：切业务资源

优先把这些高风险资源切到新权限体系：

1. `employees`
2. `projects`
3. `payments`
4. `expense-requests`
5. `project-referrals`

不要一开始就试图全量改完。

---

## 九、最小可落地版本

如果你想先快速上线 v1，建议只做这些：

1. 保留 `employees.role`
2. 新增 `permissions`
3. 新增 `role_permissions`
4. 不先做自定义 `roles` 表，直接把 `employees.role` 当模板键
5. 新增统一 `authorize(permissionCode)`
6. 新增基础数据范围 `self | all`

这种做法更快，但它是过渡态。

长期最佳实践仍然是：

- `employees.role` 做系统身份
- `roles` 做业务角色模板

---

## 十、验收标准

权限系统上线前，至少满足：

1. 未登录访问非白名单接口会被拒绝
2. 已登录但无权限访问接口会返回 403
3. 同一权限在不同角色模板上能配置不同数据范围
4. 员工级 `deny` 能覆盖角色模板授权
5. `admin` 可直接访问全部后台管理资源
6. 前端可通过 `/auth/me/permissions` 获取当前权限上下文
7. `project.read` 等资源查询能按数据范围正确过滤
8. 权限修改后，短时间内即可在接口层生效

---

## 十一、当前项目中的关键注意事项

## 1. 不要把权限判断散落到 controller

当前项目 controller 应只处理 HTTP。

权限判断建议：

- 简单“能不能访问”：在 preHandler / authorize 层
- 数据范围过滤：在 service 层

## 2. 不要让前端决定数据范围

前端最多做显示控制。

真正的数据限制必须在后端执行。

## 3. 不要把部门或岗位直接当权限

部门和岗位可以作为授权依据的一部分，但不能直接替代权限码。

正确关系应是：

```text
员工 -> 角色模板 -> 权限码 -> 数据范围
员工 -> 部门/岗位 -> 业务过滤辅助条件
```

## 4. 不要把细权限直接固化进 JWT

JWT 只保留：

- auth user id
- openid
- 系统角色

细权限建议从数据库实时聚合并短缓存。

---

## 十二、结论

当前仓库的数据结构不能直接支撑一套完整的员工权限管理系统，只能支撑非常粗的角色分流。

最佳落地方案不是继续扩充 `employees.role`，而是：

1. 保留 `employees.role` 做系统级粗身份
2. 新增 `roles`
3. 新增 `permissions`
4. 新增 `role_permissions`
5. 新增 `employee_roles`
6. 新增 `employee_permission_overrides`
7. 新增后端授权层和数据范围过滤层
8. 把稳定值域统一下沉到 `@gooes/domain`

如果按这个方案执行，当前项目可以逐步演进到：

- 后端接口可授权
- 前端菜单可显隐
- 数据访问可限域
- 员工可做个性化授权

这是当前代码基础上风险最低、也最符合长期维护的方案。
