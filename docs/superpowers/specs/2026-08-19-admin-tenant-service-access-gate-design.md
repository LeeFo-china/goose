# Admin 租户服务访问统一承接设计

**日期：** 2026-08-19  
**状态：** 已确认，待实施计划  
**范围：** Gooes Admin 与 API；不修改 orange 仓库

## 1. 背景与现状

开发环境账号 `19000005001` 可以正常登录并取得租户会话，但普通业务接口返回：

- HTTP `402`
- 错误码 `TENANT_SERVICE_ACCESS_EXPIRED`
- 文案“租户服务访问已到期”

同一账号通过现有员工 bootstrap 得到的权威服务访问状态却是：

- `access_status = service_blocked`
- `access_mode = service_blocked`
- `access_level = none`
- 标题“尚未开通平台技术服务”
- 可用动作“申请试用”“购买正式服务”

计费、试用和服务购买相关的 `recovery` 接口仍然可访问。说明后端已经具备与
Admin 相关的 `session / recovery / read / write` 四类访问边界，但 Admin 目前只检查登录会话，
没有在 Console Shell 层消费租户服务访问状态。结果是用户可以进入每个菜单，随后
在各页面分别看到同一个 402 错误，且“已到期”文案无法准确表达“尚未开通、审核中、
等待生效、试用到期”等不同状态。

## 2. 目标

1. 租户服务不可用时，由 Admin Console 统一承接，不再由各业务页面重复提示。
2. 使用权威服务访问摘要展示准确状态，不根据通用 402 文案猜测业务状态。
3. 保留试用、购买、计费、刷新状态和退出登录等恢复能力。
4. 按权限展示恢复动作：有权限的租户管理员可以自助处理，普通员工联系企业管理员。
5. 宽限期继续允许只读访问，而不是误导到完全阻断页面。
6. 平台员工和平台管理员不受租户服务门禁影响。
7. 后端继续作为最终授权边界，前端门禁只改善导航与错误体验。

## 3. 非目标

- 不改变租户服务状态的数据库判定规则。
- 不修改 `session / recovery / read / write` 的后端授权语义。
- 不为本功能引入缓存、队列、Redis 或新依赖。
- 不重新设计技术服务商品、订单或支付领域模型。
- 不修改 orange 仓库；小程序现有 bootstrap 契约保持兼容。
- 不用前端页面替代 API 权限校验。

## 4. 方案选择

### 方案 A：保留各页面错误提示

改动最小，但用户会反复进入不可用页面，服务状态文案不准确，所有新页面还必须重复
实现同样的判断。否决。

### 方案 B：任何 402 都直接跳转

可快速止住重复提示，但首次页面仍会发出无效业务请求；如果没有恢复路由白名单，
购买和试用页面也会被跳转，容易形成重定向循环。只作为运行时兜底，不作为主门禁。

### 方案 C：Shell 预检 + 统一承接页 + 402 兜底

在 Console Layout 渲染业务内容前取得服务访问摘要；不可进入工作台时统一承接，
宽限期进入只读工作台；运行期间状态变化再由全局请求客户端处理 402。该方案能够
复用后端现有访问分级，并同时解决首次导航和运行时状态变化问题。

**决定：采用方案 C。**

## 5. 总体架构

```text
登录 / Admin 会话
        |
        v
GET /employee/service-access  (tenantServiceAccess=session)
        |
        +-- 平台身份 ------------------------------> 正常 Console
        |
        +-- workspace_available -------------------> 正常 Console
        |
        +-- grace_period --------------------------> 只读 Console + 全局横幅
        |
        +-- service_blocked / expired /
        |   pending_review / scheduled ------------> /service-access
        |
        +-- hard_blocked --------------------------> /service-access

运行中的业务请求若返回 402 + TENANT_SERVICE_ACCESS_EXPIRED
        |
        v
客户端单次 replace 到 /service-access，服务状态页和恢复请求不参与跳转
```

## 6. 后端接口设计

### 6.1 新接口

新增：

```http
GET /employee/service-access
```

路由配置：

```ts
{ tenantServiceAccess: "session" }
```

控制器只负责读取租户认证上下文、调用 service、包装 `ResponseHandler.success`。
业务状态继续由现有 `employeeServiceAccessService` 和
`tenantServiceAccessService` 计算，不复制数据库访问或状态优先级逻辑。

### 6.2 Admin 专用响应投影

接口返回 Admin 专用的轻量投影，而不是完整员工 bootstrap：

```ts
type AdminTenantServiceAccess = {
  accessStatus:
    | "workspace_available"
    | "pending_review"
    | "scheduled"
    | "grace_period"
    | "expired"
    | "service_blocked"
    | "hard_blocked";
  accessMode: TenantServiceAccessMode;
  accessLevel: "read_write" | "read_only" | "none";
  canEnterWorkspace: boolean;
  readonly: boolean;
  startsAt: string | null;
  endsAt: string | null;
  evaluatedAt: string;
  title: string;
  message: string;
  primaryAction: AdminServiceAccessAction | null;
  secondaryAction: AdminServiceAccessAction | null;
};

type AdminServiceAccessAction = {
  key:
    | "enter_workspace"
    | "enter_readonly_workspace"
    | "view_trial"
    | "apply_trial"
    | "purchase_service"
    | "contact_tenant_admin"
    | "contact_platform"
    | "refresh";
  label: string;
};
```

响应中不返回小程序页面路径。Admin 根据 action key 映射本地路由或交互，避免 API
与 Next.js 路径耦合，也避免错误复用 `/packageEmployees/...` 等小程序路径。

### 6.3 权限投影

- `billing.service_trial.apply`：允许展示并执行“申请试用”。
- `billing.service_trial.read`：允许查看当前或历史试用状态。
- `billing.service_order.create`：允许展示并执行“购买正式服务”。
- `billing.service_order.read`：允许查看租户自己的技术服务订单。
- 不具备恢复操作权限时，将主操作投影为“联系企业管理员”。
- `hard_blocked` 不开放购买、试用或普通计费操作，只允许联系平台、刷新和退出。

该权限投影只控制页面动作可见性。对应 service 和 RPC 仍必须执行后端权限校验。

### 6.4 性能边界

接口只读取服务访问事实和当前员工权限，不加载首页统计、任务、项目、客户或个性化数据。
不使用完整 `/employee/bootstrap`，避免每次 Console 导航触发无关查询和预热。
服务访问查询保持单次、有限字段访问，不新增列表或无上限查询。

### 6.5 Admin 购买跳转接口

实施核查发现，现有 `/billing/service-orders` 是微信小程序 JSAPI 支付接口，要求当前
JWT 携带微信 `openid`；Admin Web 的 `admin_web` JWT 不包含该支付身份，不能直接复用
该 POST 接口完成网页支付。为避免把必然返回 `PAYER_OPENID_REQUIRED` 的按钮交付给用户，
新增：

```http
POST /employee/service-access/purchase-link
```

路由标记为 `tenantServiceAccess: "recovery"`，并校验
`billing.service_order.create`。接口使用现有 `wechatOpenLinkService` 生成短时效小程序
URL Link，目标为既有正式技术服务选购页；试用转正式时，由后端权威摘要注入
`source_trial_id`，不接受客户端传入租户或试用归因。

Admin 可直接分页查看技术服务商品和本租户订单，但真实下单与 JSAPI 支付在小程序内
完成。本期不新增 Native/H5 支付渠道，不放宽 `payer_openid` 数据库约束，也不修改既有
订单、回调和履约模型。

## 7. Admin 路由与门禁

### 7.1 Console Layout 预检

`(console)/layout.tsx` 在取得 Admin 会话后获取服务访问摘要，并把摘要传给客户端
`AdminShell`。`AdminShell` 使用 `usePathname` 判断当前地址是否属于恢复路由：

1. 无会话：保持现状，重定向 `/login`。
2. 平台身份：不查询或忽略租户服务状态，正常渲染平台 Console。
3. `workspace_available`：正常渲染租户 Console。
4. `grace_period`：正常渲染租户 Console，并向 Shell 注入只读状态。
5. 其他不可进入工作台状态：
   - 当前路由属于恢复路由时渲染对应 children；
   - 否则不展示业务 children，渲染统一状态面板并使用 `router.replace` 将地址
     规范到 `/service-access`。

服务访问接口临时不可用时，不应把用户误判成“服务到期”。页面显示可重试的系统错误，
并禁止在未知状态下执行写操作。

Next.js 可能在父级客户端 Shell 决策前构建服务端 page tree，因此该门禁不承诺完全消除
所有被后端拒绝的服务端读取请求；它保证这些页面及其零散错误不会暴露给用户。后端
授权仍是最终边界，运行时 402 兜底负责处理状态在会话期间发生变化的情况。

### 7.2 恢复路由白名单

前端只放行以下恢复范围：

- `/service-access`
- `/billing`
- 登录、退出及 Admin 会话请求
- 承接页内部调用的技术服务试用、商品、订单和支付恢复 API

白名单依据业务语义显式维护，禁止用宽泛前缀让普通业务页面绕过门禁。

### 7.3 防止重定向循环

- `/service-access` 永远不因服务阻断再次跳转自身。
- `recovery` 请求返回普通业务错误时，只在页面内显示，不触发服务到期跳转。
- 全局 402 处理使用 `router.replace`，并为同一轮跳转加去重锁。
- 平台身份、登录页和退出请求不参与租户服务跳转。
- 服务恢复后刷新状态，跳转 `/dashboard`；不自动恢复可能已过期的写操作。

## 8. 统一承接页设计

### 8.1 页面结构

页面保持中后台工作台风格，不使用营销式 Hero、渐变背景或多层嵌套卡片：

- 保留顶部租户名称、当前员工和退出登录。
- 服务阻断时隐藏普通业务导航，只保留“服务状态”和允许访问的“计费账户”。
- 内容区使用单个状态面板，包含状态图标、标题、说明、关键时间和操作区。
- 使用中性色背景；待处理状态使用浅橙色语义，硬阻断使用浅红色语义。
- 主操作突出，次操作保持克制；正文保持 14px，标题不使用大号营销字体。

### 8.2 状态文案和动作

| 状态 | 页面标题 | 主要动作 | 次要动作 |
| --- | --- | --- | --- |
| `pending_review` | 试用申请审核中 | 查看试用 | 刷新状态 |
| `scheduled` | 试用已批准，等待生效 | 查看试用 | 刷新状态 |
| `expired` | 试用服务已到期 | 购买正式服务 | 查看试用/联系管理员 |
| `service_blocked` | 尚未开通平台技术服务 | 申请试用或购买服务 | 联系企业管理员 |
| `hard_blocked` | 企业账号暂不可用 | 联系平台 | 刷新状态 |
| `grace_period` | 服务处于只读宽限期 | 只读进入工作台 | 购买正式服务 |

最终文案以服务访问摘要为准，不直接显示通用 402 的“租户服务访问已到期”。

现有 Admin 登录会拒绝不可用租户。本功能不放宽该安全边界：`hard_blocked` 只处理
已有会话在运行期间转为不可用且仍能取得摘要的情况；无法建立或续期会话时继续执行
现有登录拒绝流程。

### 8.3 权限差异

- 有申请试用权限：显示试用申请表单或当前申请状态。
- 有购买服务权限：显示可购买技术服务商品，并进入已有订单/支付流程。
- 只有读取权限：可以查看试用或订单，但不能提交。
- 无恢复权限：不展示不可执行按钮，显示“请联系企业管理员处理”。

承接页复用现有 `Button`、`Card`、`Badge`、`Alert`、`Dialog` 等 shadcn 组件，
不新增 UI 框架和依赖。

## 9. 恢复操作范围

承接页不是新的计费系统，只为现有恢复能力提供 Admin 入口：

1. 申请试用：调用现有 `/billing/service-trials` recovery 接口。
2. 查看试用：读取当前或历史试用状态。
3. 购买正式服务：分页读取现有 `/billing/service-products` 展示套餐，通过
   `/employee/service-access/purchase-link` 打开既有小程序正式选购页，在小程序内创建
   `/billing/service-orders` 订单并完成 JSAPI 支付。
4. 查看订单：分页读取当前租户技术服务订单。
5. 刷新状态：重新请求 `/employee/service-access`，不依赖前端倒计时猜测。

所有列表使用 `page=1&pageSize=20`，`pageSize` 最大不超过 100。恢复动作必须保持
已有幂等键、金额校验和后端权限边界。

## 10. 只读宽限期

`grace_period` 不进入阻断承接页：

- Shell 顶部固定显示浅橙色全局横幅，说明只读状态和结束时间。
- 导航和读取页面保持可用。
- 已知写操作在 UI 上禁用并解释原因。
- 即使前端遗漏禁用，后端仍返回 `TENANT_SERVICE_READ_ONLY`。
- 全局客户端对该 403 不跳转；应显示统一的只读提示。

首期不要求逐页重写所有按钮。Shell 横幅和统一错误处理先提供一致体验，业务组件在
后续触达时逐步读取 Shell 的 readonly context 以提前禁用写入口。

## 11. 运行时错误处理

扩展统一 Admin backend client：

- `401 / TOKEN_EXPIRED`：保持现有登录失效流程。
- `402 / TENANT_SERVICE_ACCESS_EXPIRED`：单次跳转 `/service-access`。
- `403 / TENANT_SERVICE_READ_ONLY`：保留当前页面，显示统一只读提示。
- `403 / TENANT_SERVICE_HARD_BLOCKED`：跳转 `/service-access`。
- `TENANT_SERVICE_CAPABILITY_NOT_INCLUDED`：保留页面，显示当前服务不包含该功能。
- 网络或 5xx：显示服务不可用与重试，不伪装成租户服务状态问题。

部分服务端页面没有使用客户端 `requestBackendJson`，因此 Shell 预检是主门禁，
客户端处理只是运行时状态变化的兜底。

## 12. 安全与一致性

- 前端不得根据手机号、租户名称或本地存储推断服务状态。
- 服务访问摘要必须由当前 JWT 对应租户上下文计算，不接受客户端 tenant id。
- 平台身份旁路沿用后端现有平台认证判断，不能由前端 role 字符串单独决定。
- 恢复页面仍受 permission 和 tenant id 约束，禁止跨租户读取试用、商品订单或支付数据。
- Shell 不主动发起普通业务客户端请求；既有服务端页面请求仍由后端访问规则拒绝，
  本功能不为消除这些请求而迁移全部页面或引入新的路由架构。
- 状态刷新后只进入工作台，不重放之前失败的 POST、PATCH、PUT 或 DELETE。

## 13. 测试策略

### 13.1 API 单元和契约测试

- 新接口路由明确标记 `tenantServiceAccess: "session"`。
- 平台身份不会被租户服务状态阻断。
- 每一种服务状态正确投影标题、访问级别和动作。
- `billing.service_trial.apply` 与 `billing.service_order.create` 分别控制动作。
- 无权限员工得到“联系企业管理员”，不得到可执行购买或申请动作。
- 响应不包含小程序路径。
- API 错误均经过 `error-factory.ts`。

### 13.2 Admin 单元和组件测试

- 路由决策覆盖正常、宽限、阻断、硬阻断和恢复路由。
- 平台身份旁路。
- 状态面板按权限渲染动作。
- 402 去重跳转且不形成循环。
- 401 登录失效逻辑保持不变。
- 只读 403 不跳转承接页。
- 网络错误不显示“服务已到期”。

### 13.3 浏览器 smoke

使用开发环境固定账号 `19000005001`：

1. 登录成功后统一进入 `/service-access`。
2. 页面显示权威摘要，而不是普通接口的通用 402 文案。
3. 访问 `/projects` 等普通业务地址会被统一承接。
4. 页面不会循环请求或连续弹出相同提示。
5. 有权限账号可进入试用或购买恢复流程。
6. 普通员工只看到联系企业管理员。
7. 后端恢复服务后点击刷新进入 `/dashboard`。

另验证：

- 宽限期账号可只读进入工作台并看到全局横幅。
- 正常租户行为不变。
- 平台管理员行为不变。
- 登录失效仍返回登录页。

## 14. 发布、观测与回滚

### 发布

1. 先发布 API 轻量状态接口，保持旧 Admin 兼容。
2. 再发布 Admin Shell 门禁、承接页和全局兜底。
3. 开发环境使用固定阻断账号、正常租户和平台账号 smoke。
4. 合并后跟踪 Admin/API 构建和 Auto Deploy Dev。

### 观测

- 记录状态接口失败，不记录敏感会话或完整响应。
- 监控 402 数量是否从各业务页面收敛到统一承接流程。
- 监控 `/service-access` 重定向次数，发现循环时立即停止 Admin 发布。

### 回滚

本功能预计不需要数据库 migration。若 Admin 门禁异常，可回滚 Admin 提交恢复原导航；
API 新增只读接口可暂时保留，不影响旧客户端。后端原有服务访问校验不回滚。

## 15. 验收标准

- 阻断租户不再在每个业务页面分别看到“租户服务访问已到期”。
- `19000005001` 登录后看到准确的统一状态和与权限匹配的动作。
- 试用、购买跳转、计费、刷新和退出等恢复通道可达，普通业务通道不可达。
- 宽限期租户可读不可写，且状态在整个 Console 中一致可见。
- 普通员工不能看到或调用无权限的恢复动作。
- 平台身份、正常租户和登录失效流程无回归。
- API、Admin 类型检查、构建、文件大小门禁、单测和浏览器 smoke 全部通过。
- 所有提交使用正常 hooks，不使用 `--no-verify`。
