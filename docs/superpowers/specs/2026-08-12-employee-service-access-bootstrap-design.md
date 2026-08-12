# 员工登录服务状态承接设计

## 背景与问题

Orange 将 `GET /employee/bootstrap` 作为员工登录恢复和首页首屏的唯一同步数据源。当前该路由属于普通租户服务 `read` 路由，统一门禁会在 bootstrap handler 执行前拒绝无正式服务、试用待审核、试用未开始或试用已到期的租户。Orange 的登录导航捕获非账期锁/租户停用错误后仍进入员工首页，首页再次 bootstrap 失败，最终表现为空权限、加载失败或到期 toast。

问题不是登录身份失败，而是会话建立、服务状态承接和业务首页加载复用了同一个会被业务门禁提前拒绝的入口。

## 目标

1. 员工身份确认后始终能从 bootstrap 获得权威 `service_access`，不需要 Orange 拼接试用、合同、订单与订阅状态。
2. 有工作台访问权的租户进入首页；只读宽限期先进入承接页，由员工明确选择只读进入；其他状态停留在承接页并展示后端动作。
3. 保持 `/employee/bootstrap` 旧响应字段兼容，不新增登录后第二条同步请求。
4. 服务访问判定继续使用数据库同一时钟和现有正式服务优先级，不在小程序重复实现规则。
5. Orange 仓库仅作为只读对接参考；Gooes 提供后端实现与交接文档。

## 非目标

- 不修改 Orange 仓库。
- 不改变合同、订单、试用状态机或支付流程。
- 不把积分账期锁并入本次 `service_access`；现有 `TENANT_BILLING_LOCKED` 页面与流程继续独立工作。
- 不新增缓存、队列或第三方依赖。
- 不允许 blocked 状态通过 bootstrap 间接读取首页统计、任务或个性化数据。

## 方案选择

### 方案 A：扩展 `/employee/bootstrap`（采用）

将 bootstrap 标记为 `session` 路由。handler 在首页权限检查和业务数据加载前解析服务访问摘要；blocked 状态只返回身份上下文、profile 与 `service_access`，首页业务字段保持兼容但为空。

优点：保持登录后单请求、复用现有去重缓存、状态与身份天然绑定。缺点：bootstrap 编排需要明确区分承接响应和工作台响应。

### 方案 B：新增 `/employee/service-access`

登录后先请求摘要，再请求 bootstrap。边界更独立，但增加一条同步请求、两套缓存与竞态处理，违背当前首页 bootstrap 收敛方向。

### 方案 C：Orange 组合现有接口

Orange 同时请求 current trial、服务订单和旧订阅状态。短期改动快，但会复制优先级、时间边界和异常状态，长期必然漂移，因此只作为后端上线前的临时方案，不作为正式契约。

## 权威数据流

1. `TenantBaseController` 以 `session` 类别解析有效员工身份与租户上下文，不执行租户服务业务门禁。
2. `EmployeeBootstrapHandler` 调用新的 bootstrap access service。
3. access service 只调用一次 `platform_service_trial_access_facts` RPC。RPC 使用单个数据库时钟快照返回：租户状态、有效合同、已付款待开通订单、旧订阅状态、当前有效试用，以及最近一条试用展示事实。
4. 现有 `TenantServiceAccessService` 继续产生正式服务优先的 `access_mode/access_level`；bootstrap projector 再结合最近试用状态产生面向登录承接的 `access_status`、文案和动作。
5. 只有允许进入工作台的状态才继续检查 dashboard/task 权限并加载首页数据。blocked 状态不得调用 home stats、task summary、personalization 或 deferred prewarm。

优先级保持：`hard_blocked > paid contract > paid_onboarding > active/grace trial > unlocked legacy > service_blocked`。最近试用只解释为什么被阻断，不得覆盖更高优先级的正式访问事实。

## `service_access` 契约

```ts
type EmployeeServiceAccessStatus =
  | "workspace_available"
  | "pending_review"
  | "scheduled"
  | "grace_period"
  | "expired"
  | "service_blocked"
  | "hard_blocked";

type EmployeeServiceAccessActionKey =
  | "enter_workspace"
  | "enter_readonly_workspace"
  | "view_trial"
  | "apply_trial"
  | "purchase_service"
  | "contact_platform"
  | "refresh";

type EmployeeServiceAccessSummary = {
  can_enter_workspace: boolean;
  readonly: boolean;
  access_mode: TenantServiceAccessMode;
  access_level: TenantServiceAccessLevel;
  access_status: EmployeeServiceAccessStatus;
  trial_id: string | null;
  trial_status: PlatformServiceTrialStatus | null;
  starts_at: string | null;
  ends_at: string | null;
  title: string;
  message: string;
  primary_action: {
    key: EmployeeServiceAccessActionKey;
    label: string;
    path: string | null;
  } | null;
  secondary_action: {
    key: EmployeeServiceAccessActionKey;
    label: string;
    path: string | null;
  } | null;
  evaluated_at: string;
};
```

所有枚举进入 `@gooes/domain`，API 与 Orange 正式制品共同消费。路径是后端认可的小程序业务路径；Orange 仍以 action key 做 exhaustive switch，不执行任意远端 URL。

## 状态矩阵

| 权威事实 | `access_status` | 可进入 | 只读 | 主动作 | 次动作 |
| --- | --- | --- | --- | --- | --- |
| paid / paid_onboarding / legacy / active trial | `workspace_available` | 是 | 否 | 进入工作台 | 无 |
| grace trial | `grace_period` | 是 | 是 | 只读进入工作台 | 购买正式服务 |
| latest trial pending_review | `pending_review` | 否 | 否 | 查看申请 | 刷新状态 |
| latest trial scheduled | `scheduled` | 否 | 否 | 查看试用 | 刷新状态 |
| latest trial expired | `expired` | 否 | 否 | 购买正式服务 | 查看试用 |
| latest trial rejected/withdrawn/revoked 或无可用服务 | `service_blocked` | 否 | 否 | 申请试用（有权限且开关开启）或购买正式服务 | 查看历史或联系平台 |
| tenant 非 active | `hard_blocked` | 否 | 否 | 联系平台 | 刷新状态 |
| converted 且正式事实存在 | `workspace_available` | 是 | 否 | 进入工作台 | 无 |
| converted 但正式事实缺失（异常） | `service_blocked` | 否 | 否 | 联系平台 | 刷新状态 |

`can_enter_workspace=true, readonly=true` 表示业务只读路由可访问，但 Orange 必须先展示承接页。员工点击“只读进入工作台”后才进入首页；所有写请求仍由后端以 `TENANT_SERVICE_READ_ONLY` 拒绝。

## Bootstrap 兼容与安全

- 响应新增 required `service_access`。
- `service_access.can_enter_workspace=false` 时：`home_stats=null`、`task_summary=null`、`personalization` 返回空 payload、projects/customers 继续为 defer/null；不得启动后台预热。
- `grace_period` 可构建只读首页所需 read 数据，但 Orange 登录导航仍先进入承接页。
- 首页数据缓存 key 继续绑定 auth user、tenant、employee 和查询模式，TTL 保持 15 秒；但
  `service_access` 必须在每次 bootstrap 请求中先按数据库事实重算，缓存命中时只复用首页数据并
  覆盖为最新访问摘要，避免到期、暂停或正式开通被旧缓存掩盖。强制刷新沿用 `force` 行为。
- RPC malformed、同租户出现多个有效试用、ID/时间/状态绑定不一致均映射脱敏 `DB_ERROR`，不返回原始 PostgREST 细节。
- `platform_service_trial_access_facts` 保持 service-role only、固定 `search_path`、单 SQL statement、分页无关且每类事实 `LIMIT` 有界。

## Orange 对接

Orange 需要新增服务状态承接页和稳定导航函数：

1. 登录或恢复员工 session 后只调用 `ensureEmployeeBootstrap()`。
2. 读取 `response.data.service_access`。
3. `workspace_available` 直接进入首页。
4. `grace_period` reLaunch 到承接页；点击 `enter_readonly_workspace` 时记录本次 bootstrap 的明确用户确认，再进入首页，不重新推导状态。
5. 其他状态留在承接页，按钮只按 action key 跳转现有试用详情、试用申请或正式购买页。
6. 承接页刷新必须通过 Orange `AuthService.ensureEmployeeBootstrap(..., { force: true })`
   刷新 bootstrap，确保 token 级结果缓存和底层请求缓存一起失效；结果变化后重新执行同一导航函数。
7. 老后端没有 `service_access` 时临时按既有流程处理；开发环境完成联合验证后移除 fallback。
8. 稳定错误码只处理真实请求失败；业务状态不再通过 402/403 异常驱动登录导航。

建议只读改动位置：`src/services/employee_bootstrap.ts`、`src/services/auth_navigation.ts`、`src/services/auth.ts`、`src/app.config.ts`，以及新增员工服务状态页。Orange 团队自行实施，本仓库只提供交接文档。

## 数据库变更

新增 forward migration，原位替换 `platform_service_trial_access_facts(uuid)`，仅扩展 JSON envelope：

- `current_trial` 继续只表示当前 active/grace 访问事实。
- 新增 `latest_trial`，选取同租户最近一条试用，返回 `id/status/starts_at/trial_ends_at/grace_ends_at`。
- scheduled/active/grace 使用数据库时钟派生 effective status；其他终态使用持久状态。
- 维持现有函数签名与 ACL，不新增表或依赖。

迁移必须通过空库 reset、migration list 对齐和真实 SQL 状态矩阵 smoke。远端只能通过既有 dev migration workflow 执行。

## 测试与验收

### API 自动化

- domain enum/action schema 的允许值与拒绝未知值。
- access facts parser 校验 latest trial 的 tenant/id/status/time/all-or-none 事实。
- 访问投影表驱动覆盖全部矩阵，并验证正式服务优先于 latest trial。
- bootstrap controller 真实 route metadata 为 session。
- blocked bootstrap 不调用 dashboard/task/personalization/prewarm；grace 返回 readonly；paid 返回旧首页字段。
- cache/in-flight 重放仍包含相同 service_access。
- authorization 其他 read/write/recovery 路由行为不变。

### 数据库

- fresh `supabase db reset --local`。
- pending_review、scheduled、active、grace_period、expired、converted 六组事实返回正确。
- RPC authenticated/anon 无 execute，service_role 可执行。
- `supabase migration list --local` Local/Remote 对齐。

### Orange 联合验收

- 19900009101 pending_review：承接页“审核中”。
- 19900009102 scheduled：承接页显示开始时间。
- 19900009103 active：直接进入首页。
- 19900009104 grace_period：先承接页，明确点击后只读进入，写操作稳定拒绝。
- 19900009105 expired：承接页引导购买。
- 19900009106 converted：直接进入正式工作台并展示正式购买归因。
- 弱网重试、重复登录、force refresh 不产生重复 bootstrap 或导航循环。

## 发布顺序与回滚

1. 发布兼容新字段的 API。
2. 应用 forward migration。
3. Orange 开发版接入承接页并完成六组联合验收。
4. 发布 Orange。

API 新代码可兼容 migration 尚未应用时的旧 envelope，仅在 `latest_trial` 缺失时退化为 `service_blocked` 通用文案；migration 应用后获得精确状态。回滚应用时可回退 API/Orange，新增 JSON 字段不会破坏旧消费者。数据库不做破坏性删除；若必须回退函数行为，使用新的 forward migration 恢复旧 envelope，不手工修改远端。
