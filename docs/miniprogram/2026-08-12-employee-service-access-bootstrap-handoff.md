# 员工登录服务状态承接页对接

日期：2026-08-12

## 结论

Gooes 已把统一服务访问摘要接入现有 `GET /employee/bootstrap`。Orange 登录后不再通过
402/403、首页空数据或 toast 推测服务状态，只需读取 `response.data.service_access`。

本次不新增第二条登录同步接口，不创建 ¥0 试用订单，也不改变现有试用申请、详情和正式购买
接口。Orange 仓库由小程序团队自行修改；Gooes 只提供本契约和新的 Domain 制品。

## 接口与路由门禁

```http
GET /employee/bootstrap
```

该路由现在属于 `tenantServiceAccess: "session"`：有效员工即使处于 `pending_review`、
`scheduled`、`expired`、`service_blocked` 或 `hard_blocked`，也能拿到业务状态摘要。

后端仍执行以下安全边界：

- 服务状态在首页权限检查与数据加载之前解析；
- blocked 状态不读取 dashboard、task、personalization，也不启动首页预热；
- 每次 bootstrap 都重新读取数据库时钟下的服务事实，旧首页缓存不能掩盖到期或停用；
- 正式合同、已支付待开通服务永远优先于历史试用状态；
- 宽限期只允许 read 路由，write 仍稳定返回 `TENANT_SERVICE_READ_ONLY`；
- 租户非 active 时始终为 `hard_blocked`。

旧响应字段继续存在。blocked 状态固定返回：

```ts
{
  home_stats: null,
  home_mode: 'defer',
  task_summary: null,
  tasks_mode: 'defer',
  personalization: emptyPayload,
  projects_mode: 'defer',
  projects: null,
  customers_mode: 'defer',
  customers: null,
}
```

## `service_access` 返回契约

类型来自 `@gooes/domain@1.16.0`：

```ts
type EmployeeServiceAccessSummary = {
  can_enter_workspace: boolean;
  readonly: boolean;
  access_mode:
    | 'paid'
    | 'paid_onboarding'
    | 'trial'
    | 'grace'
    | 'legacy'
    | 'service_blocked'
    | 'hard_blocked';
  access_level: 'read_write' | 'read_only' | 'none';
  access_status:
    | 'workspace_available'
    | 'pending_review'
    | 'scheduled'
    | 'grace_period'
    | 'expired'
    | 'service_blocked'
    | 'hard_blocked';
  trial_id: string | null;
  trial_status: PlatformServiceTrialStatus | null;
  starts_at: string | null;
  ends_at: string | null;
  title: string;
  message: string;
  primary_action: EmployeeServiceAccessAction | null;
  secondary_action: EmployeeServiceAccessAction | null;
  evaluated_at: string;
};

type EmployeeServiceAccessAction = {
  key:
    | 'enter_workspace'
    | 'enter_readonly_workspace'
    | 'view_trial'
    | 'apply_trial'
    | 'purchase_service'
    | 'contact_platform'
    | 'refresh';
  label: string;
  path: string | null;
};
```

Orange 应以 action key 做 exhaustive switch。`path` 仅作为已知小程序内部路径使用，不要把它
实现为任意远程 URL 跳转。

## 登录导航规则

建议把 `src/services/auth_navigation.ts` 的员工成功分支统一改为：

1. 完成员工 session/identity 建立；
2. 只调用 `ensureEmployeeBootstrap()`；
3. 读取 `bootstrap.service_access`；
4. 按下面矩阵 reLaunch，不捕获业务拒绝后继续进入首页。

| `access_status` | 登录后落点 | 行为 |
| --- | --- | --- |
| `workspace_available` | `/pages/index/index` | 直接进入工作台 |
| `grace_period` | 新增服务状态承接页 | 必须由用户点击“只读进入工作台”后进入首页 |
| `pending_review` | 新增服务状态承接页 | 展示审核中，允许查看详情/刷新 |
| `scheduled` | 新增服务状态承接页 | 展示 `starts_at`，允许查看详情/刷新 |
| `expired` | 新增服务状态承接页 | 引导购买正式服务，可查看历史试用 |
| `service_blocked` | 新增服务状态承接页 | 按后端 action 展示申请试用、购买或联系平台 |
| `hard_blocked` | 新增服务状态承接页 | 不进入工作台，联系平台/刷新 |

宽限期不能因为 `can_enter_workspace=true` 就自动进入首页。其含义是“用户明确确认后可只读
进入”，不是“登录自动放行”。承接页应在本次 session 保存一次明确确认，避免返回首页时再次
重定向；重新登录或服务状态变化后重新确认。

承接页刷新使用现有：

```ts
EmployeeBootstrapService.getBootstrap({ force: true })
```

刷新后重新执行同一个纯导航函数，禁止页面各自拼接状态。

## Action 路径

当前后端只返回下列已存在路径：

| action | path |
| --- | --- |
| `enter_workspace` / `enter_readonly_workspace` | `/pages/index/index` |
| `view_trial` | `/packageEmployees/pages/platformServiceTrialDetail/index?id=<trial_id>`；没有 ID 时为试用列表 |
| `apply_trial` | `/packageEmployees/pages/platformServiceTrialApply/index` |
| `purchase_service` | `/packageEmployees/pages/platformServicePaymentSmoke/index` |
| `contact_platform` / `refresh` | `null`，由承接页执行本地交互 |

从试用详情进入购买时，Orange 继续使用现有逻辑透传：

```text
source_trial_id=<trial_id>
```

## 推荐改动位置（Orange 只读核对）

- `src/services/employee_bootstrap.ts`
  - response type 增加 required `service_access`；
  - 保留现有 force/dedup 能力。
- `src/services/auth_navigation.ts`
  - employee bootstrap 成功后调用统一导航函数；
  - 删除“非账期异常仍 switchTab 首页”的业务状态 fallback。
- `src/services/auth.ts`
  - session 恢复复用相同导航结果，不再额外 probe 首页接口。
- `src/pages/index/hooks/useEmployeeHomeBootstrap.ts`
  - 首页只处理 `workspace_available` 或已明确确认的 `grace_period`；
  - 不再把服务状态显示成“首页加载失败”。
- `src/app.config.ts`
  - 注册新的员工服务状态承接页。
- 新增承接页
  - 展示后端 `title/message/starts_at/ends_at`；
  - 按 action key 渲染主次按钮；
  - pending 操作保留按钮尺寸，不产生重复导航。

以上路径仅供 Orange 团队定位，本任务没有修改 Orange 工作区。

## 兼容和失败处理

- API 首次兼容发布期间，如果老环境确实没有 `service_access`，Orange 可临时沿用旧导航；
  开发环境联合验收通过后应删除 fallback。
- `service_access` 是成功响应内的业务事实，不应转成异常或 toast。
- 请求失败仍按稳定错误码和脱敏 Request-ID 处理；不得记录 token、OpenID、支付签名或原始
  PostgREST 错误。
- `contact_platform` 的 `path=null` 不代表失败，由 Orange 使用现有客服/联系平台交互。

## 联合验收矩阵

| 账号 | 预期状态 | 关键验收 |
| --- | --- | --- |
| `19900009101` | `pending_review` | 不进入首页；查看申请、force 刷新正常 |
| `19900009102` | `scheduled` | 不进入首页；展示后端开始时间 |
| `19900009103` | `workspace_available` + trial | 直接进入工作台 |
| `19900009104` | `grace_period` | 先承接页；明确点击后只读进入；写操作稳定拒绝 |
| `19900009105` | `expired` | 不进入空首页；主动作进入正式购买 |
| `19900009106` | `workspace_available` + converted history | 正式服务优先，直接进入工作台 |

另需验证：重复登录、弱网重试、force refresh、试用刚到期、正式付款刚完成、租户刚暂停时，
不会出现旧状态缓存、重复导航或首页空权限。

## Domain 制品

本次新增 Domain 导出：

- `EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES`
- `EMPLOYEE_SERVICE_ACCESS_ACTION_VALUES`
- `EmployeeServiceAccessActionSchema`
- `EmployeeServiceAccessSummarySchema`
- 对应 TypeScript types

由于 `1.15.0` 已正式交付，本次必须使用 `@gooes/domain@1.16.0`，禁止生成同版本不同内容的
tgz。交付时同时提供 tgz 的 SHA-256；Orange 在 `package.json` 与 lockfile 中均指向新制品。

- 本机交付文件：`/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.16.0.tgz`
- SHA-256：`a23ad1e4bb77704797a41f76a3b2755d3077a88b1e4e04af8e25aa74eb0aa848`
- Orange-owned 安装命令：

```bash
pnpm add "/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.16.0.tgz"
```

安装后应运行 Orange 的 `check:gooes-domain`、Domain smoke、typecheck、文件大小检查、平台
服务商品 smoke 与开发构建，并确认 `package.json` 和 `pnpm-lock.yaml` 都指向 1.16.0 tgz。

## 发布顺序

1. Gooes API 发布兼容代码；
2. 通过 migration workflow 应用 `20260812070956_add_employee_service_access_bootstrap.sql`；
3. 发布 `@gooes/domain@1.16.0` tgz + SHA；
4. Orange 安装新 Domain、实现承接页和导航；
5. 使用六组开发账号完成真机联合回归；
6. Orange 独立提交并进入其合并流程。

数据库只能通过 migration 应用。回滚 API/Orange 时，新 JSON 字段对旧消费者兼容；数据库函数
如需回退，必须再建 forward migration，禁止远端手工 DDL/DML。
