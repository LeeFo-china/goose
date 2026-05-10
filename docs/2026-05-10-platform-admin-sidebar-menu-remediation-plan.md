# 平台超管左侧菜单整改方案

## 1. 背景

当前 `18637605353` 已调整为纯平台超管：

- `employees.tenant_id = null`
- 仅保留全局角色 `platform_admin`
- 不再拥有默认装修公司的租户角色

但 admin 左侧菜单仍按普通租户员工的菜单结构展示，平台超管可以看到：

- 客户
- 项目
- 员工
- 组织架构
- 角色
- 权限点
- 费用审批
- 营销活动
- 自媒体脚本
- 工地监控
- 运维脚本
- 系统配置

这会带来两个问题：

1. 认知错误：平台超管看起来仍像某家装修公司的员工。
2. 操作风险：无租户身份进入租户业务页时，容易出现空数据、查询失败或误以为正在查看默认装修公司。

## 2. 设计原则

### 2.1 平台模式与租户模式必须分离

平台超管默认进入“平台管理模式”，只能看到平台级能力。

租户业务数据必须通过明确的“进入租户视角”动作打开，不能默认使用某个历史默认租户。

### 2.2 菜单按当前身份生成

侧边栏不应只是“有权限就展示”，还应判断当前 session 是否有 `tenant`：

- `roles` 包含 `platform_admin` 且 `tenant = null`：平台模式。
- `tenant != null`：租户业务模式。
- 未来若支持平台超管代入某租户，应有明确的 `acting_tenant` 或 `impersonation` 状态。

防御性约定：

- 后端生成 session 时，`session.tenant` 必须直接来自 `employee.tenant_id ?? null`，不能从默认租户推导。
- 前端判断平台模式时，应优先识别 `platform_admin`，避免历史 token 或混合角色导致误入租户菜单。
- 若历史账号仍同时存在 `platform_admin` 和租户身份，应优先按平台模式处理，直到完成账号数据清理。

### 2.3 平台超管不直接进入租户业务菜单

平台超管可以管理租户、线索、平台配置、审计、运维。

但不能在未选择租户时直接进入客户、项目、费用审批、营销活动等租户业务页面。

## 3. 推荐菜单结构

### 3.1 平台超管默认菜单

平台超管左侧建议只显示以下菜单：

```text
平台概览          /dashboard

平台运营
  平台租户        /platform/tenants
  平台线索        /platform/leads
  平台审计        /platform/audit-logs

平台配置
  系统配置        /settings
  自媒体脚本      /social-video

运维
  运维脚本        /ops
```

说明：

- `平台概览` 继续使用 `/dashboard`，但展示平台工作台。
- `平台租户` 是核心入口，用于创建、停用、查看租户详情。
- `平台线索` 用于平台公海线索分配。
- `平台审计` 用于平台操作追踪。
- `系统配置` 在平台超管模式下默认展示平台级配置，例如短信、AI、腾讯云 IoT Video、存储等。
- `自媒体脚本` 当前涉及 AI Provider、Apify、腾讯云 ASR 等平台能力，可先保留在平台菜单中。
- `运维脚本` 只应平台超管可见。

### 3.2 平台超管默认隐藏菜单

以下菜单应在平台超管默认模式下隐藏：

```text
客户
项目
员工
组织架构
角色
权限点
费用审批
营销活动
工地监控
```

原因：

- 这些都是租户内业务能力。
- 当前平台超管没有 `tenant_id`，直接打开没有业务上下文。
- 后续如需查看某租户业务，应先从租户详情进入“租户视角”。

### 3.3 普通租户员工菜单

普通租户员工继续显示原租户业务菜单：

```text
概览
客户
项目
员工
组织架构
角色
权限点
费用审批
营销活动
自媒体脚本
工地监控
系统配置
```

是否显示具体菜单仍由权限码控制。

## 4. 未来“进入租户视角”设计

平台超管如果需要排查某家装修公司的业务数据，不建议直接复用自己的平台 token 访问租户页面。

推荐新增显式入口：

```text
平台租户详情
  -> 进入租户视角
```

进入后顶部应显示醒目标识：

```text
平台超管正在查看：某某装饰
```

并提供退出动作：

```text
退出租户视角
```

### 4.1 技术建议

后端 session 可增加：

```json
{
  "tenant": null,
  "acting_tenant": {
    "id": "tenant-id",
    "name": "某某装饰",
    "slug": "demo"
  },
  "roles": ["platform_admin"]
}
```

前端业务页判断：

- 普通租户员工：使用 `tenant`
- 平台超管代入：使用 `acting_tenant`
- 平台超管未代入：禁止进入租户业务页

第一版可以先不做代入能力，只隐藏租户业务菜单。

## 5. 顶部栏整改

当前顶部栏对平台超管仍显示：

```text
未分配部门 · 未分配岗位
未绑定租户
```

这对平台超管不友好。

建议改为：

```text
固始
平台超管 · 平台管理模式

[平台账号] [platform_admin] [退出]
```

普通租户员工仍显示：

```text
员工姓名
部门 · 岗位

[租户名称] [权限数量] [退出]
```

## 6. 前端落地方案

### 6.1 平台模式判断

建议统一封装判断函数，避免多个组件各写一套判断：

```ts
export function isPlatformOnlySession(session: AdminSession | null | undefined) {
  return Boolean(
    session?.roles.includes("platform_admin") &&
      (!session.tenant || session.tenant.id === null),
  );
}
```

说明：

- 当前纯平台超管 `tenant = null`，该判断成立。
- 如果 session 中出现 `platform_admin + tenant` 的混合历史状态，建议产品上仍优先按平台模式处理；工程上可先在后端清理数据，或在前端增加更强策略：

```ts
const isPlatformOnlyMode = session.roles.includes("platform_admin");
```

最终建议以后端数据清理为准，前端保留兼容判断。

### 6.2 重构菜单配置

当前文件：

```text
apps/admin/components/layout/admin-nav.tsx
```

不建议把菜单配置继续写死在 `admin-nav.tsx`。建议抽到独立文件：

```text
apps/admin/components/layout/menu-config.ts
```

菜单配置拆成两组，并保留后续权限过滤能力：

```ts
type MenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: string | null;
};

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

const platformNavGroups = [
  {
    label: "平台运营",
    items: [
      { href: "/dashboard", label: "平台概览" },
      { href: "/platform/tenants", label: "平台租户", permission: null },
      { href: "/platform/leads", label: "平台线索", permission: null },
      { href: "/platform/audit-logs", label: "平台审计", permission: null },
    ],
  },
  {
    label: "平台配置",
    items: [
      { href: "/settings", label: "系统配置" },
      { href: "/social-video", label: "自媒体脚本" },
    ],
  },
  {
    label: "运维",
    items: [
      { href: "/ops", label: "运维脚本" },
    ],
  },
];

const tenantNavGroups = [
  {
    label: "业务",
    items: [
      { href: "/dashboard", label: "概览" },
      { href: "/customers", label: "客户" },
      { href: "/projects", label: "项目" },
      { href: "/expenses", label: "费用审批" },
      { href: "/marketing", label: "营销活动" },
      { href: "/cameras", label: "工地监控" },
    ],
  },
  {
    label: "组织",
    items: [
      { href: "/employees", label: "员工" },
      { href: "/organization", label: "组织架构" },
      { href: "/roles", label: "角色" },
      { href: "/permissions", label: "权限点" },
    ],
  },
  {
    label: "工具",
    items: [
      { href: "/social-video", label: "自媒体脚本" },
      { href: "/settings", label: "系统配置" },
    ],
  },
];
```

`AdminNav` 内部做过滤：

```ts
const visibleGroups = rawGroups
  .map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      !item.permission || hasPermission(item.permission),
    ),
  }))
  .filter((group) => group.items.length > 0);
```

第一版 `platform_admin` 可以默认看到平台菜单，后续如果平台角色再细分，可复用 `permission` 字段。

### 6.3 AdminNav 入参调整

当前：

```ts
<AdminNav roles={session.roles} />
```

建议改为：

```ts
<AdminNav session={session} />
```

`AdminNav` 内部判断：

```ts
const isPlatformOnlyMode = isPlatformOnlySession(session);
```

然后：

- `isPlatformOnlyMode = true`：使用 `platformNavGroups`
- 否则：使用 `tenantNavGroups`

### 6.4 路由保护

菜单隐藏只是体验优化，不能替代路由保护。

不建议只做静默 `redirect`，否则用户手动访问收藏 URL 时会困惑。

推荐做法：

1. 菜单层隐藏租户业务入口。
2. 页面层阻断直接访问。
3. 展示明确提示，而不是无说明跳回首页。

```ts
function TenantAccessGuard({ session, children }: PropsWithChildren<{ session: AdminSession | null }>) {
  if (isPlatformOnlySession(session)) {
    return (
      <AccessDeniedPanel
        title="当前为平台管理模式"
        description="平台超管不能直接访问租户业务页面，请先从平台租户进入指定租户视角。"
        actionText="返回平台工作台"
        actionHref="/dashboard"
      />
    );
  }

  return children;
}
```

适用页面：

```text
/customers
/projects
/employees
/organization
/roles
/permissions
/expenses
/marketing
/cameras
```

后端已经通过 `authContext.tenantId` 做数据隔离，前端保护主要是减少误操作和错误体验。

### 6.5 顶部栏分支

平台模式下不应继续渲染部门、岗位、租户名称。

建议 `AdminShell` 增加分支：

```ts
if (isPlatformOnlySession(session)) {
  return (
    <PlatformAdminShellHeader
      name={session.employee.name}
      roles={session.roles}
    />
  );
}
```

平台顶部栏展示：

```text
固始
平台超管 · 平台管理模式

[平台账号] [platform_admin] [退出]
```

租户员工顶部栏继续展示：

```text
员工姓名
部门 · 岗位

[租户名称] [权限数量] [退出]
```

## 7. 后端影响

第一版菜单整改不需要后端改造。

但后端需要遵守一个前提：

```ts
session.tenant = employee.tenant_id ?? null;
```

不得因为 `DEFAULT_TENANT_ID` 或历史默认装修公司而给平台超管补一个默认 tenant。

需要后端配合的是后续“进入租户视角”能力：

- 需要明确 `acting_tenant` 的授权模型。
- 需要审计平台超管代入行为。
- 需要所有租户业务接口识别 `acting_tenant`，且只允许 `platform_admin` 使用。

该能力不建议和本次菜单整改一起做。

## 8. 历史数据一致性风险

`18637605353` 已经从默认装修公司解绑，但历史业务表中仍可能存在该员工 ID：

- 项目创建人
- 客户负责人
- 费用申请操作人
- 操作日志 actor
- 审计日志 actor

这不影响本次菜单整改，因为平台超管不再直接参与租户业务流程。

但在阶段 4 “进入租户视角”之前，建议做一次数据一致性梳理：

- 确认平台超管是否仍作为某些租户业务记录的负责人。
- 若存在，业务上应转交给真实租户员工。
- 平台超管历史操作记录可以保留，只用于审计。
- 平台超管后续不应再作为客户、项目、费用等租户业务的负责人或处理人。

## 9. 实施步骤

### 阶段 1：菜单分流

目标：平台超管默认只看到平台菜单。

Todo：

- [ ] `AdminNav` 入参从 `roles` 调整为完整 `session`。
- [ ] 新增 `menu-config.ts`。
- [ ] 新增 `platformNavGroups`。
- [ ] 新增 `tenantNavGroups`。
- [ ] 新增统一的 `isPlatformOnlySession` 判断。
- [ ] 平台模式下隐藏租户业务菜单。
- [ ] 普通租户员工菜单保持现状。

验收：

- 平台超管登录后左侧只显示平台级菜单。
- 普通员工登录后左侧仍显示租户业务菜单。

### 阶段 2：顶部栏平台模式优化

目标：顶部栏不再显示“未分配部门 / 未绑定租户”。

Todo：

- [ ] `AdminShell` 判断平台模式。
- [ ] 平台模式显示 `平台超管 · 平台管理模式`。
- [ ] 平台模式 badge 显示 `平台账号`、`platform_admin`。
- [ ] 平台模式不渲染部门、岗位、租户名称。
- [ ] 租户员工顶部栏保持当前逻辑。

验收：

- 平台超管顶部栏语义清楚。
- 普通租户员工顶部栏不受影响。

### 阶段 3：租户业务页前端保护

目标：平台超管未进入租户视角时，不直接打开租户业务页。

Todo：

- [ ] 梳理租户业务路由清单。
- [ ] 增加统一的 `TenantAccessGuard` 或等价服务端保护组件。
- [ ] 对业务页面增加平台模式阻断提示。
- [ ] 若用户手动访问 `/customers`、`/projects` 等页面，展示“当前为平台管理模式，请先选择租户”。
- [ ] 提供返回平台工作台按钮。

验收：

- 平台超管手动输入租户业务 URL 不再看到空业务页，也不会被无说明地跳转。
- 普通租户员工访问不受影响。

### 阶段 4：租户视角设计

目标：后续支持平台超管排查租户业务数据。

Todo：

- [ ] 在租户详情页设计“进入租户视角”按钮。
- [ ] 后端设计 `acting_tenant` 上下文。
- [ ] 记录代入审计日志。
- [ ] 顶部栏显示当前查看的租户和退出入口。
- [ ] 在开发前完成平台超管历史业务数据一致性梳理。

验收：

- 平台超管进入租户视角前后状态清晰。
- 所有代入行为可审计。

## 10. 推荐 MVP

本次建议先做阶段 1 和阶段 2，并紧接着做阶段 3。

原因：

- 能立即解决“平台超管看起来属于默认装修公司”的问题。
- 不涉及后端状态机和代入租户权限模型。
- 改动范围集中在 admin layout 和 nav，风险较低。
- 阶段 3 可以避免用户通过浏览器历史、收藏夹或直接输入 URL 进入租户业务页。

阶段 4 属于平台巡检和运维增强能力，建议单独设计和开发。
