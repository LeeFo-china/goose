# 平台技术服务试用运营管理设计

**日期：** 2026-08-10

**状态：** 方案已确认，待书面评审

**适用范围：** Gooes API、Admin、Domain 与 Supabase migration；Orange 仅作为小程序对接方

## 1. 执行结论

平台技术服务新增独立的“试用申请与授权”业务域，支持两种来源：

1. 装企在小程序自主申请，平台运营人员审核；
2. 平台运营人员在 Admin 主动为指定装企开通。

试用不是支付交易，不创建 0 元技术服务订单，不写收入、退款、微信支付或微信履约数据，也不通过修改旧租户积分订阅状态伪造正式服务。

首版采用“独立试用记录 + 规则快照 + 统一访问判定层”模型：

- 试用记录负责申请、审核、生效、延期、撤销、到期和转正式；
- 默认试用 30 天，结束后提供 7 天只读宽限期；
- 标准试用只包含系统功能和在线使用指导；
- 陪跑试用可以生成轻量运营跟进任务，但不生成正式付费实施工单；
- 正式购买仍进入现有技术服务商品、订单、支付、实施、验收和退款链路；
- 租户冻结、停用和风控状态始终高于试用授权；
- 所有关键操作使用幂等、乐观锁和不可变审计事件。

Admin 在现有“平台运营 → 平台技术服务”页面增加第四个 Tab“试用管理”，让申请、审批、跟进、到期和转正式处在同一个运营工作台内，同时保持试用与付费订单的数据边界。

## 2. 背景与当前事实

当前平台技术服务已经具备：

- 正式 1 年、2 年、3 年套餐及版本化发布；
- 租户服务订单、普通微信支付和待支付订单取消；
- 支付后实施工单、履约记录、附件、客户验收、退款和微信履约上报；
- Admin 的服务订单、实施工单、退款申请和套餐管理页面；
- 平台运营人员与 `platform.*` 权限体系；
- 旧租户积分订阅的 `active / past_due / locked / canceled` 状态及请求锁定校验。

当前缺口是：

1. 没有试用申请、审核、授权、延期、撤销和转正式的数据模型；
2. 没有平台主动开通试用和运营跟进能力；
3. 没有到期提醒、只读宽限期和重复试用控制；
4. 现有 `tenant_billing_subscriptions` 只表达旧积分计费锁定，不能承载完整试用生命周期；
5. 现有 `tenant_entitlements` 受数据库约束，仅承载 `custom_support_branding` 品牌权益，不能直接复用为整个平台试用；
6. 现有正式技术服务订单尚未形成统一的租户系统服务可用期事实，试用上线前必须明确访问判定与正式服务的衔接，不能用继续保留试用状态掩盖该缺口。

### 2.1 生产上线前置条件

正式服务访问期不是第三阶段才处理的可选优化，而是试用开放生产前的前置条件。本项目在阶段一先补齐最小正式服务访问事实：

- 已支付、未退款且处于交付中的技术服务订单，提供 `paid_onboarding` 访问；
- 客户验收后，按既有技术服务方案生成正式合同期，首购从 `accepted_at` 起算，续费按当前有效期顺延；
- 退款、合同到期或明确的服务访问终止通过受控命令同步调整访问事实；
- 试用转正式后由 `paid_onboarding` 或正式合同期承接访问，不能继续依赖试用放行；
- 上述事实进入统一访问判定并通过 dev smoke 后，才能在生产开启试用申请或主动开通。

阶段三负责把这些事实进一步抽象成通用权益治理，不负责补救阶段一缺失的访问连续性。

## 3. 目标

本项目实现以下目标：

1. 租户管理员或被授权员工可以提交和撤回试用申请；
2. 平台人员可以审核、拒绝或主动开通试用；
3. 平台人员可以配置试用类型、期限、功能范围、开始时间和跟进人；
4. 系统可以稳定判断试用中、只读宽限期和已到期访问能力；
5. 平台可以延期、撤销和例外批准重复试用，并完整审计；
6. 陪跑试用具备轻量运营跟进，不污染正式实施工单；
7. 正式支付成功后可以可靠记录试用转化来源；
8. 平台可以查看申请量、活跃试用、即将到期和转正式情况；
9. 所有列表分页，默认 `page=1&pageSize=20`，`pageSize` 最大为 `100`；
10. 规则调整只影响后续新试用，已生效记录使用不可变规则快照。

## 4. 非目标

首版不包含：

- 把试用包装成 0 元商品或 0 元订单；
- 为试用调用微信支付、退款或发货信息管理接口；
- 试用结束后自动删除、归档或迁移租户业务数据；
- 为标准试用自动创建服务器部署、上门培训或正式实施工单；
- 建设通用 CRM、销售漏斗、外呼系统或复杂审批引擎；
- 按用户设备、iOS、Android 或 HarmonyOS 设置不同试用规则；
- 把品牌权益专用 `tenant_entitlements` 直接扩展成全平台通用权益中心；
- 在本期彻底替换旧积分订阅或重构全部租户授权逻辑；
- 修改 Orange 仓库内容。

通用权益中心和正式服务合同期统一治理可以作为后续项目，但首版的数据与 service 接口应保留平滑迁移空间。

## 5. 已确认的业务规则

### 5.1 试用来源

`source` 取值：

```text
tenant_application | platform_grant
```

- `tenant_application`：装企在小程序提交，必须经过平台审核；
- `platform_grant`：平台运营人员主动开通，必须填写原因并留下操作者；
- 两种来源使用同一试用记录、状态机和访问判定，不复制两套实现。

### 5.2 试用类型

`trial_type` 取值：

```text
standard | guided
```

- 标准试用：系统功能和在线使用指导；
- 陪跑试用：在标准试用基础上分配平台跟进人并生成轻量跟进任务；
- 陪跑任务不等于正式实施工单，不进入付费履约、客户验收或微信履约状态机；
- 服务器专属部署、上门培训和年度运维仍属于正式套餐服务。

### 5.3 默认期限

- 默认试用 30 天；
- 默认只读宽限期 7 天；
- 默认在结束前 7 天、3 天、1 天提醒；
- 审批或主动开通时可以调整试用天数和开始时间；
- 普通审核必须处于已发布规则的边界内：试用 1～60 天、宽限期 0～14 天、计划开始时间不晚于当前时间后 30 天；
- `platform.service_trial.override` 可以突破业务默认值，但数据库仍限制试用不超过 365 天、宽限期不超过 30 天，且必须填写例外原因；
- 默认最多延期 1 次、每次不超过 30 天；规则设置可以下调该上限，突破上限需要 override；
- 规则配置不得写死在应用代码中；
- 已生效试用保存审批时的期限、宽限期和功能范围快照，平台修改默认规则不会追溯改变历史记录。

### 5.4 申请权限

- 租户管理员默认可以申请；
- 其他员工只有取得 `billing.service_trial.apply` 权限后才能申请和撤回本人租户的申请；
- 普通员工可以按产品要求查看试用状态，但不能代表企业提交或撤回；
- 小程序复用租户档案和营业执照资料，不要求重复录入企业名称、统一社会信用代码或注册地址；
- 申请只补充试用目的、预计使用人数、预计项目数量和主要联系人。

### 5.5 重复与并发申请

- 同一租户同一时间最多一条待审核申请；
- 同一租户同一时间最多一条待生效、试用中或宽限期记录；
- 已有有效正式服务时不能提交试用申请；
- 待审核申请可以由原申请人或具备同权限的当前租户员工撤回；
- 被拒绝后默认 30 天内不能再次自主申请；
- 同一企业默认只享受一次试用；重复试用只能由具备高权限的平台人员例外批准，并填写原因；
- 企业级重复判断使用已核验统一社会信用代码的规范化摘要，不得仅依赖手机号或租户 ID；
- 租户缺少已核验企业身份时可以查看试用说明，但申请和平台主动开通都返回 `SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED`，引导先完成营业执照核验；
- 平台人员不能用 override 绕过企业身份缺失。确需修正企业归属时，应先通过租户入驻/档案的受控流程合并或补正企业身份并保留审计；
- 提交、审批和主动开通 RPC 必须按企业身份摘要取得事务锁，避免同一企业通过两个租户并发获得试用；
- 被拒绝冷却期从 `reviewed_at` 起算，并使用该申请保存的冷却期快照；撤回申请不进入冷却期，但受接口频控和同一待审核记录约束；
- 已有有效正式服务时，租户申请和平台主动开通均拒绝。override 只能批准历史重复试用，不能给已有正式服务的租户叠加试用。

### 5.6 转正式

- 客户在试用任意阶段均可选择正式套餐并创建服务订单；
- 创建订单或拉起 `wx.requestPayment` 不代表已转正式；
- 只有后端确认微信支付成功后，才写入转化订单和转化时间；
- 重复支付回调不得重复转换或重复生成实施工单；
- 转化记录保留原试用来源、跟进人和规则快照，用于归因统计；
- `pending_review / scheduled / active / grace_period / expired` 在付款成功后转为 `converted`，未开始或已结束的申请不再继续生效；
- `rejected / withdrawn / revoked` 保留原终态以忠实记录历史决定，但可以写入 `converted_service_order_id`、`converted_at` 和 `formal_purchase_attributed` 事件用于归因；
- 支付确认 RPC 在确认订单并幂等创建实施工单的同一事务中尝试写试用转化；正常归因必须原子提交，历史归因冲突不得回滚已确认的资金事实，而应写异常审计并等待平台核对；
- 创建正式服务订单时在 `tenant_service_orders.source_trial_id` 固化转化来源。小程序从试用页面购买时可以提交 `trial_id`，后端必须校验同租户和可归因状态；未提交时后端只自动绑定当前唯一的 `active / grace_period` 试用，不从多条历史记录猜测；
- 支付回调只消费订单已经固化的 `source_trial_id`。没有绑定来源的订单可以正常成交，但不计入具体试用转化；
- 同一试用同一时间只允许一张未关闭的服务订单绑定 `source_trial_id`。已绑定订单关闭后可以重新选择套餐；首张绑定订单支付成功后，后续续费订单不再绑定该试用；
- 支付确认以资金事实为最高优先级：归因正常时在同一事务更新试用；已归因同一订单视为幂等；若历史异常显示已归因其他订单，仍确认本次付款并创建唯一实施工单，同时写转化异常审计供平台核对，不能因营销归因冲突拒绝已成功的微信付款；
- 付款确认后立即由 `paid_onboarding` 访问承接，客户验收后切换为正式合同期。只有确认全额退款、合同到期、平台硬封禁，或受控服务终止命令写入 `service_access_terminated_at` 后才撤回对应访问；单独的 `service_status=canceled` 不足以终止已付费访问。

## 6. 生命周期

### 6.1 持久化状态

```text
pending_review | scheduled | active | grace_period | expired
| rejected | withdrawn | revoked | converted
```

中文映射：

| 状态 | 含义 |
| --- | --- |
| `pending_review` | 装企已提交，等待平台审核 |
| `scheduled` | 已批准，尚未到开始时间 |
| `active` | 试用中，可按范围读写 |
| `grace_period` | 试用结束后的只读宽限期 |
| `expired` | 宽限期结束，不再提供业务访问 |
| `rejected` | 平台拒绝申请 |
| `withdrawn` | 装企撤回待审核申请 |
| `revoked` | 平台提前撤销待生效或生效中的试用 |
| `converted` | 正式支付已确认，试用转为正式服务来源 |

“即将到期”和“已逾期”属于基于时间计算的展示字段，不作为新的持久化状态。

### 6.2 状态转换

```text
装企申请：pending_review
  ├─ 撤回 → withdrawn
  ├─ 拒绝 → rejected
  ├─ 批准 → scheduled / active
  └─ 正式支付确认 → converted

平台主动开通：scheduled / active

scheduled
  ├─ 到开始时间 → active
  ├─ 平台撤销 → revoked
  └─ 正式支付确认 → converted

active
  ├─ 试用结束 → grace_period
  ├─ 平台延期 → active（更新结束时间并写事件）
  ├─ 平台撤销 → revoked
  └─ 正式支付确认 → converted

grace_period
  ├─ 宽限期结束 → expired
  ├─ 平台例外延期 → active
  ├─ 平台撤销 → revoked
  └─ 正式支付确认 → converted

expired
  └─ 正式支付确认 → converted

rejected / withdrawn / revoked
  └─ 正式支付确认 → 保留原状态，只记录正式购买归因
```

### 6.3 时间判定原则

所有期限均按持续时长计算：一天等于 24 小时，时间统一存储为 UTC `timestamptz`，Admin 和小程序按用户时区展示。边界采用左闭右开：

```text
scheduled: now < starts_at
active: starts_at <= now < trial_ends_at
grace_period: trial_ends_at <= now < grace_ends_at
expired: now >= grace_ends_at
```

访问控制必须直接比较数据库时间与 `starts_at`、`trial_ends_at`、`grace_ends_at`，不能依赖定时任务先把状态更新成功。

状态归档任务负责：

- 将到期记录规范化为 `grace_period` 或 `expired`；
- 发送幂等提醒；
- 更新运营统计的可查询事实。

即使任务延迟，访问判定仍必须按时间窗口返回正确能力。

延期仅允许 `active` 或 `grace_period`。新的结束时间按 `max(trial_ends_at, database_now) + extension_duration` 计算，必须严格大于数据库当前时间；若已进入宽限期，则立即恢复 `active`，并以新的 `trial_ends_at + grace_days_snapshot` 重算完整宽限期。`expired` 不允许延期，只能按重复试用规则重新开通。

数据库持久化状态用于审计，API、`available_actions`、唯一性检查和访问控制统一使用数据库函数计算的 `effective_status`。创建或审批新试用的 RPC 在企业锁和租户锁内先把时间已到的旧记录规范化，再检查唯一性，避免归档任务延迟导致状态分叉或永久阻塞。

## 7. 服务访问判定

新增统一的租户服务访问判定 service，例如 `TenantServiceAccessService`。它只编排领域事实，不直接在 controller 查询表。

判定优先级：

1. 租户冻结、停用、归档或命中平台风控：进入 `hard_blocked`；
2. 有效正式合同期或已支付交付中的 `paid_onboarding`：正常使用；
3. 有效试用：按试用范围读写；
4. 试用宽限期：按试用范围只读；
5. 旧积分订阅状态不是 `locked`：沿用现有访问；
6. 其他情况：进入 `service_blocked`，只允许登录、查看服务状态、套餐、订单、购买和支付等恢复入口。

这里明确采用迁移口径：有效正式服务、`paid_onboarding` 和有效试用可以覆盖旧积分订阅的 `locked`，但不能覆盖租户停用或平台风控。后续旧积分订阅下线时删除兼容分支，不改变试用和正式服务语义。

建议统一返回：

```json
{
  "mode": "trial",
  "access_level": "read_write",
  "source": "tenant_application",
  "starts_at": "2026-08-10T08:00:00.000Z",
  "ends_at": "2026-09-09T08:00:00.000Z",
  "grace_ends_at": "2026-09-16T08:00:00.000Z",
  "scope": {
    "version": 1,
    "capabilities": ["core.projects", "core.customers", "core.employees"]
  },
  "reason": null
}
```

`mode` 建议支持：

```text
paid | paid_onboarding | trial | grace | legacy | service_blocked | hard_blocked
```

### 7.1 路由访问矩阵

受租户上下文保护的路由必须显式声明访问类别，未声明的新写路由默认按 `write` 处理：

| 类别 | grace | service_blocked | hard_blocked | 示例 |
| --- | --- | --- | --- | --- |
| `session` | 允许 | 允许 | 允许 | 登录态检查、退出、获取平台联系说明；不返回租户业务数据 |
| `recovery` | 允许 | 允许 | 拒绝 | 试用状态、正式套餐、服务订单、创建订单、继续支付、取消待支付订单 |
| `read` | 允许 | 拒绝 | 拒绝 | 客户、项目、员工和文件的只读列表/详情；仅限试用范围 |
| `write` | 拒绝 | 拒绝 | 拒绝 | 新增、编辑、删除、状态流转、上传业务附件；仅限试用范围 |
| `public_or_callback` | 不适用 | 不适用 | 不适用 | 微信回调、公开 visitor 接口，由各自鉴权控制 |

`hard_blocked` 不能创建订单、继续支付或读取租户数据，需要由平台解除冻结或风控后恢复。不能只按 HTTP 方法推断类别，controller 注册时使用明确元数据。阶段一实施前生成现有租户路由清单并逐项归类；门禁测试要求所有需要租户上下文的路由都有分类。旧 `allowedWhenBillingLocked` 只作为迁移输入，完成映射后由统一访问判定取代。

### 7.2 试用范围结构

试用范围使用版本化结构，不保存任意字符串：

```json
{
  "version": 1,
  "capabilities": ["core.projects", "core.customers", "core.employees"]
}
```

- capability 必须来自 Domain 发布的后端允许列表；
- 标准和陪跑模板只能选择允许列表内的能力；
- scope 同时作用于 `read` 和 `write`，宽限期再把所有 capability 降为只读；
- 支付配置、平台级设置、增值权益和其他独立付费商品不因试用自动开放；
- 删除或改名 capability 时必须保留旧版本解释器，直到所有引用快照过期或迁移完成；
- 阶段一实施计划必须根据现有路由盘点给出 v1 capability 与路由的完整映射，不能由前端自行维护。

## 8. 数据模型

所有数据库变更必须通过 `supabase/migrations/` 完成。禁止手工修改远端开发库。

### 8.1 `platform_service_trial_policies`

保存当前平台默认试用规则：

- `id`；
- `default_trial_days`，默认 30；
- `default_grace_days`，默认 7；
- `max_trial_days`，默认 60；
- `max_grace_days`，默认 14；
- `max_schedule_ahead_days`，默认 30；
- `max_extension_count`，默认 1；
- `max_extension_days`，默认 30；
- `reminder_days`，默认 `[7, 3, 1]`；
- `reapply_cooldown_days`，默认 30；
- `allow_repeat_application`，默认 false；
- 标准与陪跑试用的默认 `scope`；
- `version`、更新人、更新时间。

平台通常只有一条有效规则。修改规则使用 `expected_version`，并写平台审计日志。试用记录保存完整规则快照，因此不要求为每次修改建立可变外键依赖。

### 8.2 `tenant_service_trials`

核心字段：

- `id`、`tenant_id`；
- `enterprise_identity_hash`，申请或主动开通时从已核验统一社会信用代码生成规范化摘要；
- `source`、`trial_type`、`status`；
- `application_reason`、`expected_user_count`、`expected_project_count`；
- `contact_name`、`contact_phone`；
- `grant_reason`，平台主动开通或例外批准时必填；
- `requested_by_employee_id`、`requested_at`；
- `reviewed_by_employee_id`、`reviewed_at`、`review_reason`；
- `starts_at`、`trial_ends_at`、`grace_ends_at`；
- `scope_snapshot`、`policy_snapshot`；
- `assignee_employee_id`；
- `extension_count`；
- `converted_service_order_id`、`converted_at`；
- `revoked_by_employee_id`、`revoked_at`、`revoke_reason`；
- `version`、`created_at`、`updated_at`。

约束：

- `trial_ends_at > starts_at`；
- `grace_ends_at >= trial_ends_at`；
- 总试用时长不超过 365 天，宽限期不超过 30 天；
- `scope_snapshot` 和 `policy_snapshot` 必须是合法 JSON 对象或数组；
- 审批、拒绝、撤销、撤销试用和转正式字段与状态保持一致；
- 同一租户仅允许一条 `pending_review`；
- 同一租户仅允许一条 `scheduled / active / grace_period`；
- 转正式订单通过 `(converted_service_order_id, tenant_id)` 复合外键或等价受控 RPC 保证属于同一租户；
- `version > 0`。

索引至少覆盖：

- `(status, created_at DESC, id DESC)`；
- `(tenant_id, created_at DESC, id DESC)`；
- `(assignee_employee_id, status, updated_at DESC)`；
- `(trial_ends_at, status)`；
- `(grace_ends_at, status)`；
- 申请和生效状态的部分唯一索引。

统一社会信用代码规范化为去空格、转大写后的固定文本，再使用数据库稳定摘要函数得到 `enterprise_identity_hash`，试用表不复制完整证照号码。RPC 对该摘要使用事务级 advisory lock，并在锁内查询历史试用。缺少已核验统一社会信用代码时不得创建或批准试用；后续证照补正不能静默改变既有试用身份，只能由平台受控合并并审计。

### 8.3 `tenant_service_trial_events`

不可变审计事件，记录：

- 试用、租户和事件类型；
- 操作人身份；
- 原值和新值；
- 操作原因；
- 幂等键、Request-ID；
- 创建时间。

事件至少包括：

```text
applied | withdrawn | approved | rejected | activated | entered_grace
| expired | extended | revoked | assigned | converted
```

事件表禁止更新和删除业务历史，只允许受控 RPC 插入。

### 8.4 `tenant_service_trial_followups`

陪跑试用和运营跟进记录：

- `trial_id`、`tenant_id`；
- 跟进类型、摘要、结果；
- `next_follow_up_at`；
- 创建人和创建时间；
- 可选状态 `pending / completed / canceled`。

跟进记录是运营事实，不修改试用授权状态。列表必须分页；Admin 详情默认只取最近记录并提供分页加载。

### 8.5 `tenant_service_trial_commands`

保存写命令幂等结果：

- `scope_key`、可选 `tenant_id`、`idempotency_key`、`command_type`；
- 请求摘要、关联试用 ID；
- 业务结果摘要和 HTTP 语义；
- 创建时间、过期时间。

`scope_key` 必须非空：租户命令使用 `tenant:<tenant_id>`，平台全局规则使用 `platform:service_trial_policy`。唯一 `(scope_key, idempotency_key)`，禁止依赖 nullable `tenant_id` 实现全局唯一。同键同请求在 90 天保留期内返回原业务结果；同键不同请求或不同资源返回 `SERVICE_TRIAL_IDEMPOTENCY_CONFLICT`。命令结果只保存恢复交互所需的非敏感字段，不保存完整手机号、Token 或附件签名 URL。

### 8.6 正式服务访问事实

阶段一同步落实既有总体方案中的：

- `tenant_service_contracts`：租户当前正式服务合同状态和截止时间；
- `tenant_service_contract_periods`：每张已验收订单贡献的不可变服务期；
- `tenant_service_orders.source_trial_id`：订单创建时固化的可选试用来源，使用 `(source_trial_id, tenant_id)` 复合外键；
- `tenant_service_orders.service_access_terminated_at`：受控退款/终止事务确认访问结束的时间；
- 支付确认后的 `paid_onboarding` 通过已支付、尚未全额退款且 `service_access_terminated_at IS NULL` 的技术服务订单派生，不另造免费订单。
- `source_trial_id` 建立部分唯一索引：`WHERE source_trial_id IS NOT NULL AND payment_status <> 'closed'`。未支付订单关闭后释放重新选套餐；一旦支付成功，即使后来退款，该试用也已经发生过正式购买归因，后续订单不能再次绑定。

支付确认、客户验收生成合同期、续费顺延、退款调整合同期必须使用受控事务命令。该部分不是试用业务表，但属于试用生产放行的依赖。

`tenant_service_contracts` 最小字段与约束：

- `id`、`tenant_id`、`service_family='platform_technical_service'`；
- `status: active | suspended | expired | canceled`；
- `service_start_at`、`service_end_at`；
- `last_period_id`、`version`、创建和更新时间；
- 唯一 `(tenant_id, service_family)`；
- `service_end_at > service_start_at`，有效状态与时间字段一致。

`tenant_service_contract_periods` 最小字段与约束：

- `contract_id`、`tenant_id`、`service_order_id`；
- `starts_at`、`ends_at`、`term_years`；
- `status: active | adjusted | voided`；
- 原始时间、调整后时间、调整原因和关联退款 ID；
- 唯一 `service_order_id`，复合外键保证合同、订单和租户一致。

验收事务按数据库时间计算：

```text
base = max(current_contract.service_end_at, accepted_at)
period.starts_at = base
period.ends_at = base + order.term_years
```

首购没有有效合同期时 `base=accepted_at`；续费从当前有效 `service_end_at` 顺延。支付成功到验收完成之间，只要订单保持已支付、尚未全额退款且 `service_access_terminated_at IS NULL`，就提供 `paid_onboarding`。退款审核中不提前撤回访问，只有渠道退款成功后由退款确认事务调整：

- 验收前全额退款：`paid_onboarding` 结束，不生成合同期；
- 验收后全额退款：对应 period 标记 `voided`，在事务内重算后续合同区间；
- 部分退款：不自动按金额比例缩短时间，必须由平台退款决定同时给出明确的服务期调整结果；
- `service_status=canceled` 但未退款、未写 `service_access_terminated_at`：进入人工异常状态，不得静默撤回访问，平台处理完成前保持现有访问并产生告警；
- 平台确认合同解除或其他无需退款的访问终止时，必须通过独立受控命令写 `service_access_terminated_at`、原因和审计事件，随后 `paid_onboarding` 才结束。

合同期重算不得覆盖原始时间，调整前后值写不可变事件。所有正式访问读取同一 repository/service，不允许试用模块自行推导另一套期限。

## 9. 原子命令与并发

以下操作应通过受控数据库 RPC 或等效事务命令完成：

- 提交申请；
- 撤回申请；
- 审批或拒绝；
- 平台主动开通；
- 延期；
- 撤销；
- 支付成功后标记转正式。

统一要求：

- 写请求携带 UUID 幂等键；
- 状态变更携带 `expected_version`；
- RPC 对试用或租户加行锁；
- 先校验租户、员工、权限和当前状态，再产生任何外部副作用；
- 状态更新与事件写入同事务提交；
- 同一幂等键重放返回同一业务结果；
- 跨资源复用幂等键返回稳定冲突，不能误操作其他试用；
- 支付回调的转正式命令按服务订单和试用建立唯一约束，保证恰好一次归因。

## 10. Admin 信息架构

### 10.1 页面位置

现有路径 `/platform/service-orders` 的 Tab 调整为：

```text
服务订单 | 实施工单 | 退款申请 | 试用管理
```

技术服务套餐继续位于 `/platform/service-products`，只负责正式套餐、价格、范围、条款和发布版本，不承载试用申请。

### 10.2 列表结构

沿用现有 `PlatformListPageShell`、Tabs、筛选栏、表格和分页模式。

顶部使用紧凑指标，不堆叠大面积卡片：

- 待审核；
- 试用中；
- 7 天内到期；
- 本月转正式。

筛选：

- 企业名称、联系人或手机号关键词；
- 状态；
- 来源；
- 试用类型；
- 跟进人；
- 申请时间；
- 到期时间范围。

列表字段：

- 装企；
- 申请来源；
- 试用类型；
- 申请时间；
- 试用周期；
- 剩余时间；
- 状态；
- 跟进人；
- 转化状态；
- 操作。

列表接口必须一次返回展示所需的租户和跟进人摘要，禁止逐行 N+1 查询。

### 10.3 详情与操作

点击行打开右侧详情 Sheet，按以下顺序展示：

1. 企业概况和当前状态；
2. 申请信息；
3. 试用范围和期限；
4. 跟进记录；
5. 状态与审计时间线。

页面主操作为“主动开通试用”。行级操作按后端 `available_actions` 展示：

- 查看；
- 审批 / 拒绝；
- 延期；
- 撤销；
- 分配跟进人；
- 记录跟进；
- 引导购买正式套餐。

审批表单一次完成：

- 标准或陪跑试用；
- 立即或定时开始；
- 试用天数；
- 功能范围；
- 跟进人；
- 对客说明和内部备注。

拒绝、延期、撤销和重复试用必须填写原因。重要操作使用确认 Dialog，不通过原生浏览器确认框。

### 10.4 试用规则设置

试用管理页提供“试用规则”入口，仅具备高权限的人员可操作。设置项包括：

- 默认试用天数；
- 默认宽限期；
- 提醒节点；
- 重复申请冷却期；
- 是否允许租户重复自主申请；
- 标准和陪跑试用默认范围。

保存前展示“只影响以后新开的试用，不影响已生效记录”的明确提示。

## 11. 权限模型

平台新增：

| 权限 | 能力 |
| --- | --- |
| `platform.service_trial.read` | 查看试用列表、详情和统计 |
| `platform.service_trial.review` | 审批或拒绝租户申请 |
| `platform.service_trial.manage` | 主动开通、分配跟进人和记录跟进 |
| `platform.service_trial.override` | 延期、提前撤销、重复试用和修改默认规则 |

租户新增：

| 权限 | 能力 |
| --- | --- |
| `billing.service_trial.apply` | 提交和撤回本租户试用申请 |
| `billing.service_trial.read` | 查看本租户试用状态与历史摘要 |

默认授权：

- 平台超级管理员拥有全部平台试用权限；
- 平台综合运营默认拥有 read、review、manage，不默认拥有 override；
- 租户管理员默认拥有 apply 和 read；
- 普通租户员工默认不拥有 apply 或 read；租户管理员可以通过既有角色管理显式授予，且不能因此看到跨租户数据。

Admin 菜单、页面、按钮和 API 都必须校验权限。前端隐藏按钮不是安全边界。

平台写命令使用以下 AND 组合，不以 `override` 单独替代基础岗位权限：

| 命令 | 所需权限 |
| --- | --- |
| 常规批准 / 拒绝 | `review` |
| 审批时同时指定跟进人，或批准陪跑试用 | `review + manage` |
| 越过规则默认边界批准 | `review + override` |
| 越界审批同时指定跟进人或批准陪跑试用 | `review + manage + override` |
| 常规主动开通 | `manage` |
| 历史重复主动开通或越过规则边界 | `manage + override` |
| 分配跟进人、记录跟进 | `manage` |
| 规则内延期 | `manage + override` |
| 提前撤销试用 | `manage + override` |
| 修改平台默认规则 | `manage + override` |

企业身份缺失和已有有效正式服务属于不可 override 的业务边界。数据库 365 天试用、30 天宽限期硬上限也不可 override。

审核接口只有在操作者同时具备 `manage` 时才接受非空 `assignee_employee_id` 或 `trial_type=guided`；否则返回权限错误，不能静默忽略字段。仅有 `review` 的人员可以批准标准试用，跟进人由后续具备 `manage` 的人员分配。

## 12. API 契约方向

以下路径作为最终契约，保持在现有技术服务 billing 域。请求和响应字段进入 Domain 包；实施中如发现现有路由注册的硬冲突，必须先修订本规格并重新评审，不能由前后端各自改名。

### 12.1 租户员工接口

```text
GET  /billing/service-trials?page=1&pageSize=20
GET  /billing/service-trials/current
GET  /billing/service-trials/applications/:id
POST /billing/service-trials/applications
POST /billing/service-trials/applications/:id/withdraw
```

提交申请示例：

```json
{
  "application_reason": "希望评估项目和客户协同能力",
  "expected_user_count": 8,
  "expected_project_count": 3,
  "contact_name": "张经理",
  "contact_phone": "13800000000",
  "idempotency_key": "uuid-v4"
}
```

联系方式必须经过后端格式校验，响应和日志按现有隐私规则脱敏。

现有 `POST /billing/service-orders` 请求新增可选 `source_trial_id`。小程序从试用记录进入购买时传递该 ID；后端只把它作为待校验归因线索，订单金额、套餐和访问资格仍以后端事实为准。

撤回请求：

```json
{
  "idempotency_key": "uuid-v4",
  "expected_version": 1,
  "reason": "申请信息需要修改"
}
```

### 12.2 平台接口

```text
GET  /platform/billing/service-trials
GET  /platform/billing/service-trials/summary
GET  /platform/billing/service-trials/:id
POST /platform/billing/service-trials
POST /platform/billing/service-trials/:id/review
POST /platform/billing/service-trials/:id/extend
POST /platform/billing/service-trials/:id/revoke
POST /platform/billing/service-trials/:id/assign
GET  /platform/billing/service-trials/:id/follow-ups
POST /platform/billing/service-trials/:id/follow-ups
GET  /platform/billing/service-trial-policy
PUT  /platform/billing/service-trial-policy
```

主动开通：

```json
{
  "tenant_id": "uuid",
  "trial_type": "standard",
  "starts_at": "2026-08-11T00:00:00.000Z",
  "trial_days": 30,
  "grace_days": 7,
  "scope": {
    "version": 1,
    "capabilities": ["core.projects", "core.customers"]
  },
  "assignee_employee_id": null,
  "reason": "目标客户产品评估",
  "idempotency_key": "uuid-v4"
}
```

审核：

```json
{
  "decision": "approved",
  "expected_version": 1,
  "idempotency_key": "uuid-v4",
  "reason": "企业资料和试用目标符合要求",
  "trial_type": "guided",
  "starts_at": "2026-08-11T00:00:00.000Z",
  "trial_days": 30,
  "grace_days": 7,
  "scope": {
    "version": 1,
    "capabilities": ["core.projects", "core.customers"]
  },
  "assignee_employee_id": "uuid"
}
```

`decision=rejected` 时只接受 `decision`、`expected_version`、`idempotency_key` 和必填 `reason`，不得悄悄保存授权参数。

延期：

```json
{
  "extension_days": 15,
  "expected_version": 3,
  "idempotency_key": "uuid-v4",
  "reason": "客户正在完成第二轮项目评估"
}
```

撤销：

```json
{
  "expected_version": 4,
  "idempotency_key": "uuid-v4",
  "reason": "企业主动终止试用"
}
```

分配跟进人：

```json
{
  "assignee_employee_id": "uuid-or-null",
  "expected_version": 2,
  "idempotency_key": "uuid-v4"
}
```

新增跟进记录：

```json
{
  "follow_up_type": "phone",
  "summary": "已完成首轮使用回访",
  "result": "customer_evaluating",
  "next_follow_up_at": "2026-08-18T02:00:00.000Z",
  "idempotency_key": "uuid-v4"
}
```

规则更新携带完整规则对象、`expected_version`、`idempotency_key` 和 `reason`，采用整体替换语义，避免并发局部 PATCH 产生互相矛盾的边界。

所有成功写响应返回最新试用/规则资源、`idempotent` 和 `available_actions`；创建接口返回 200 以保持现有 API 响应风格，重复重放也返回 200。错误统一包含稳定错误码和 Request-ID。

平台列表统一支持 `page`、`pageSize`、`keyword`、`status`、`source`、`trialType`、`assigneeEmployeeId` 和时间范围筛选。租户历史列表只返回当前租户数据并支持 `page`、`pageSize`、`status`。

### 12.3 响应动作

试用详情和当前状态返回：

```json
{
  "available_actions": {
    "withdraw": { "enabled": false, "disabled_reason": "申请已通过" },
    "review": { "enabled": false, "disabled_reason": "当前状态不可审核" },
    "extend": { "enabled": true, "disabled_reason": null },
    "revoke": { "enabled": true, "disabled_reason": null },
    "purchase": { "enabled": true, "disabled_reason": null }
  }
}
```

Admin 和小程序只根据后端动作结果控制交互，不自行复制完整状态机。

## 13. 稳定错误码

建议至少提供：

| 错误码 | HTTP | 含义 |
| --- | ---: | --- |
| `SERVICE_TRIAL_NOT_FOUND` | 404 | 试用不存在或不属于当前租户 |
| `SERVICE_TRIAL_APPLICATION_PENDING` | 409 | 已有待审核申请 |
| `SERVICE_TRIAL_ACTIVE_EXISTS` | 409 | 已有待生效或生效中的试用 |
| `SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE` | 409 | 已有有效正式服务 |
| `SERVICE_TRIAL_REAPPLY_COOLDOWN` | 409 | 尚处重复申请冷却期 |
| `SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED` | 409 | 缺少已核验企业身份 |
| `SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE` | 403 | 重复试用需要高权限 |
| `SERVICE_TRIAL_ACTION_NOT_ALLOWED` | 409 | 当前状态不允许操作 |
| `SERVICE_TRIAL_VERSION_CONFLICT` | 409 | 数据版本已变化 |
| `SERVICE_TRIAL_IDEMPOTENCY_CONFLICT` | 409 | 幂等键被其他资源使用 |
| `SERVICE_TRIAL_SCOPE_REQUIRED` | 400 | 试用范围为空或无效 |
| `SERVICE_TRIAL_POLICY_INVALID` | 400 | 规则配置无效 |
| `SERVICE_TRIAL_EXTENSION_INVALID` | 400 | 延期时长或新截止时间无效 |
| `SERVICE_TRIAL_ORDER_SOURCE_INVALID` | 409 | 订单携带的试用来源不可归因 |
| `TENANT_SERVICE_READ_ONLY` | 403 | 当前处于只读宽限期 |
| `TENANT_SERVICE_ACCESS_EXPIRED` | 402 | 试用和宽限期均已结束 |
| `TENANT_SERVICE_HARD_BLOCKED` | 403 | 租户被平台停用、冻结或风控拦截 |

错误必须经 `error-factory.ts` 包装，并在 `details` 返回前端恢复所需的非敏感信息，例如最新 `version`、截止时间或 `disabled_reason`。

## 14. 通知与任务

使用项目现有通知与任务模式，不为本项目单独引入 Redis、消息队列或新调度依赖。

通知事件：

- 新申请通知具备审核权限的平台人员；
- 审批通过、拒绝、延期和撤销通知申请人及租户管理员；
- 到期前 7、3、1 天通知客户和跟进人；
- 进入宽限期通知一次；
- 正式到期通知一次；
- 转正式成功通知客户和跟进人。

通知幂等键至少包含 `trial_id + event_type + target_date + recipient`，任务重跑不得重复发送。

陪跑试用开通后生成一条初始跟进任务；后续跟进由平台人员维护 `next_follow_up_at`。任务取消或人员调整不改变试用授权状态。

## 15. 运营统计

首版指标：

- 待审核数量；
- 当前试用中数量；
- 7 天内到期数量；
- 本月新增申请；
- 本月审批通过；
- 本月转正式；
- 申请通过率；
- 试用转正式率。

统计口径：

- 申请通过率按 `tenant_application` 计算，平台主动开通不进入分母；
- 转正式率按进入 `active` 的试用 cohort 计算；
- 转化以正式支付确认时间为准；
- 同一试用只有一次转化归因；
- 列表和指标查询限定必要字段，避免全量扫描和 N+1；
- 数据增长后优先通过 migration 增加索引或聚合事实，不在首版引入缓存系统。

## 16. Orange 小程序对接边界

Orange 只负责：

- 展示试用入口、申请表、当前状态、截止时间和可执行操作；
- 复用当前租户资料，采集试用目的、规模和联系人；
- 调用后端申请、撤回、详情和正式套餐接口；
- 按后端 `available_actions` 控制按钮；
- 在试用中展示剩余时间，在宽限期展示只读说明，在过期后展示购买入口；
- 正式购买继续使用现有技术服务商品和订单支付链路。

Orange 不负责：

- 自行计算是否有资格申请、是否重复试用或是否过期；
- 根据本地时间单方面开放或关闭业务权限；
- 写死 30 天、7 天或提醒节点；
- 将试用包装成免费订单；
- 修改试用状态、模拟审批或直接写数据库；
- 在后端 dev 契约发布前修改 Gooes 数据结构。

后端 dev 发布时必须同步：

- dev commit；
- 最终接口路径、权限点和功能开关；
- 真实脱敏响应样例；
- `available_actions` 和错误码；
- 标准、陪跑、宽限期、已过期、已转正式 fixture；
- 测试租户管理员手机号和必要权限；
- 规则默认值及当前 dev 开关状态。

## 17. 分阶段实施

### 阶段一：申请、审批与授权

- 正式服务合同期、`paid_onboarding` 和退款/取消访问调整的最小事实；
- 现有租户路由访问类别和 v1 capability 完整映射；
- migration、Domain 类型和权限；
- 试用规则和规则快照；
- 租户申请、撤回、查询；
- 平台列表、详情、主动开通、审批和拒绝；
- 统一访问判定、到期时间判定和 7 天只读宽限期闭环；
- Admin 试用管理 Tab 和详情 Sheet；
- 基础审计、幂等、并发和分页测试。

### 阶段二：提醒与运营

- 到期前提醒；
- 陪跑跟进任务和跟进记录；
- 延期、撤销、重复试用例外；
- 运营统计；
- 小程序完整申请和状态展示联调。

### 阶段三：服务权益治理

- 将阶段一的正式服务、试用、宽限期和旧计费兼容事实抽象为通用权益模型；
- 逐步移除旧 `allowedWhenBillingLocked` 和积分订阅兼容分支；
- 多服务族、增值权益和统一授权诊断；
- 历史数据迁移与兼容策略；
- 通用权益模型是否吸收试用和正式服务的独立评估。

阶段一在生产上线前必须确保不会因为阶段三尚未完成而错误放行或锁定租户。若正式服务访问期、路由访问矩阵、v1 capability 映射或只读宽限期任一项未完成，应将试用功能保持在 dev 功能开关后。阶段二通知和运营统计可以晚于核心授权上线，但不得改变已经承诺的 30 天加 7 天访问语义。

## 18. 验收清单

### 18.1 业务验收

- 租户管理员可以提交、查看和撤回待审核申请；
- 无权限员工不能申请；
- 具备 review 的平台运营可以审核，具备 manage 的平台运营可以主动开通；
- 标准和陪跑试用范围正确；
- 同一租户不能重复创建待审核或生效中的试用；
- 被拒绝冷却期和重复试用高权限规则生效；
- 定时开始、到期、宽限期和过期展示正确；
- 宽限期只能读取，不能新增或修改普通业务数据；
- 平台冻结优先于试用；
- 延期、撤销和重复试用均要求原因；
- 正式支付成功后只转换一次；
- 付款确认、实施工单创建和试用转化在同一事务中恰好一次；
- 待审核、待生效、试用中、宽限期和已过期购买后进入 converted；被拒绝、已撤回和已撤销只记录购买归因；
- 付款后由 `paid_onboarding` 承接访问，验收后由正式合同期承接，转换过程中不出现错误锁定；
- 有效正式服务和试用覆盖旧积分 locked，但不覆盖租户停用或风控；
- 试用到期不删除租户数据。

### 18.2 并发与安全验收

- 两名平台人员同时审批，只有一个状态变更成功；
- 重复请求复用幂等键返回同一结果；
- 跨试用复用幂等键稳定冲突且不产生副作用；
- `expected_version` 过期返回版本冲突；
- 跨租户读取统一返回不存在或无权限；
- 平台权限撤销后不能继续操作；
- 访问判定使用服务端数据库时间；
- 所有租户路由都有显式访问类别，新增未分类写路由默认拒绝 grace、service_blocked 和 hard_blocked；
- 企业身份事务锁可以阻止同一统一社会信用代码跨租户并发重复试用；
- Request-ID、日志和错误响应不泄露联系人完整手机号或其他敏感信息。

### 18.3 性能与工程验收

- 所有列表分页，`pageSize <= 100`；
- 列表无 N+1；
- 到期和待审核查询命中索引；
- 必要的大表查询通过 `EXPLAIN ANALYZE` 核对执行计划；
- API、Admin 和 Domain 类型检查通过；
- 关键 service、repository、controller 和 migration 契约测试通过；
- Colima 隔离空库可以完整应用全部 migration；
- 应用开发库后 `supabase migration list` 的 Local/Remote 对齐；
- Admin 骨架屏、空状态、加载、成功、失败和权限状态同步覆盖。

## 19. 发布与回滚

推荐发布顺序：

1. 发布向后兼容的数据库 migration、权限和只读接口；
2. 发布 API，但保持租户申请和访问放行功能开关关闭；
3. 发布 Admin，使用平台主动开通的 dev fixture 验证；
4. 验证访问判定、到期、宽限期、冻结优先级和正式支付转换；
5. 发布 Orange 接入并完成真机矩阵；
6. 先对少量指定租户灰度，再开启自主申请。

回滚原则：

- 优先关闭申请和新开通功能开关；
- 已生效试用不得因为应用回滚突然失去访问，应保留兼容读取和时间判定；
- 不删除试用、事件、跟进和转化历史；
- 数据库回滚必须使用新的前向 migration；
- 删除列、表、索引或 RPC 前先确认无活跃试用、无旧版本调用和无审计依赖；
- 若访问判定异常，按明确的人工应急规则处理指定租户，禁止直接修改远端表绕过 migration。

## 20. 最终决策记录

本设计已经确认：

1. 同时支持装企自主申请和平台主动开通；
2. 采用独立试用域，不创建 0 元订单；
3. 标准试用不包含正式部署和上门培训；
4. 陪跑试用只生成轻量运营跟进任务；
5. 默认 30 天试用加 7 天只读宽限期；
6. Admin 使用平台技术服务第四个 Tab 和右侧详情 Sheet；
7. 使用独立试用记录、规则快照和统一访问判定层；
8. 租户管理员默认可申请，其他员工按权限授权；
9. 正式支付成功是转正式的唯一交易确认依据；
10. 先完成书面规格评审，再进入分阶段实施计划和代码开发。
