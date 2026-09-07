# 客户线索第一阶段：共享契约与兼容基线

日期：2026-09-06。范围：用户确认的四步基础工作。

后续更新：通用后端阶段已继续实施，当前交接与实际验证状态见 `docs/2026-09-06-customer-leads-miniprogram-handoff.md` 和 `docs/operations/evidence/2026-09-06-customer-leads.md`。下方“当前交付状态”保留为第一阶段历史基线，不代表最新部署状态。

## 当前交付状态

已实现 domain 共享类型、查询/命令校验、命令结果校验、错误目录、四项独立权限及权限 migration 文件。Admin 仅增加角色配置中“客户线索”的分类与中文名称。

**下文 `/tenant/customer-leads` 是已定义的后续接口契约，尚未注册 HTTP 路由，也没有执行新业务 SQL。** 新权限 migration 尚未应用远端数据库。现有 `/tenant/douyin-miniapp/leads` 的 controller/service/repository/schema 和 Admin 抖音页面未修改；普通跟进无预约当前仅在新契约中允许，旧接口仍要求预约。

## 现有能力基线

| 项目 | 当前行为与定位 |
|---|---|
| HTTP | `apps/api/src/controllers/tenant-douyin-leads/index.ts` 注册 10 条管理路由，含两类员工选项、分页跟进和预约 |
| 来源 | 当前查询只取 `marketing_leads.source='douyin_miniapp'` |
| 权限 | read、assign、follow_up、convert 使用 `douyin_lead.*`，mark-invalid 使用 convert |
| 数据范围 | `getVisibleCustomerOwnerIds` 决定可见负责人；空数组是不可见；只有 all 可见未分配 |
| 创建客户 | 无已有客户时要求 `customer.create`；范围非 all 时最终负责人只能是当前操作员工，不能仅凭 department 创建范围为其他员工新建客户 |
| 已有客户 | 按同租户手机号关联，保留原负责人；重复转化返回同一客户 |
| 并发 | `expected_lead_version` 与 `idempotency_key` 必填；数据库维护版本和重放结果 |
| 旧 DTO | 只返回脱敏电话，客户和负责人摘要不带 ID；public 与 Admin 使用严格响应 schema |
| 新管理员权限 | 现有 `context-builder.ts` 对租户 system_admin 从 `PERMISSION_CODE_VALUES` 推导全部权限；本次无需改动鉴权代码 |
| 普通员工覆盖 | 现有角色授权与员工 allow/deny 合成逻辑保持不变；旧抖音权限不推导新权限 |

注意：现有 system_admin 走全权限分支，不执行普通员工的 override 合成。这是基线行为，本阶段不修改；不能据此声称管理员 deny 规则已改变。

当前仓库中需要在后续提取 SQL 时保留的最新定义：

- 分配七参数版本：`20260821105630_bind_douyin_assignee_department_scope.sql`。
- 跟进：`20260821105200_fix_douyin_appointment_command_invariants.sql`。
- 转客户含 preflight 版本：`20260821105620_reject_stale_douyin_customer_preflight.sql`。
- 标记无效：`20260821105000_create_douyin_measurement_appointments.sql`。
- 来源快照约束：`20260821105650_harden_douyin_customer_source_snapshots.sql`。
- 列表 RPC：`20260821105690_list_tenant_douyin_leads.sql`。
- 管理命令 owner：`20260830110000_align_douyin_measurement_command_owners.sql`。

以上是本地迁移历史基线，不代表已检查远端 catalog 或 Local/Remote 对齐。

## 共享包导出

| 文件 | 内容 |
|---|---|
| `packages/domain/src/customer-lead.ts` | 来源、状态、动作、动作权限映射、分页、摘要、详情、预约及跟进 DTO |
| `packages/domain/src/customer-lead-query.ts` | 列表、各子列表、员工候选/筛选项的分页参数校验 |
| `packages/domain/src/customer-lead-commands.ts` | 版本/幂等输入、四种动作输入、公开命令结果 schema |
| `packages/domain/src/customer-lead-errors.ts` | 新业务错误码、HTTP 状态和中文消息 |

统一由 `@gooes/domain` 导出。输入类型与规范化后类型区分：`CustomerLeadFollowUpInput` 允许省略可空字段，`CustomerLeadFollowUpCommand` 是默认值已补全的服务输入。包版本/小程序 tgz 更新留到实际接口交接阶段。

## 权限契约

新接口要求 `customer_lead.read/assign/follow_up/convert`，mark-invalid 对应 convert。source 不参与权限代码拼接。旧接口继续要求旧代码，不允许新接口认证失败后回退旧权限。

`20260906040943_tenant_customer_lead_permissions.sql` 只新增四条 permissions，并给有效的租户 system_admin 角色补缺失授权；两个 INSERT 的冲突处理均为 DO NOTHING，保留已有状态/范围。普通角色和员工覆盖不改动，需租户管理员明确配置。新权限不会自动获得客户查看或创建权限。

## 新接口契约（尚未上线）

认证：沿用 Bearer 员工会话。服务端解析租户与员工身份；客户端不得传 `tenant_id`，命令也不得传 source 或目标 customer_id。所有查询 schema 为 strictObject，未知参数返回校验错误。

| 方法 | 路径（前缀 `/tenant/customer-leads`） | 查询或请求体 |
|---|---|---|
| GET | 空路径 | `CustomerLeadListQuerySchema` |
| GET | `/assignee-candidates` | `CustomerLeadAssigneeCandidatesQuerySchema`，assign 权限 |
| GET | `/assignee-filter-options` | `CustomerLeadAssigneeFilterOptionsQuerySchema`，read 权限 |
| GET | `/:id` | UUID params，空 query；返回 `CustomerLeadDetail` |
| GET | `/:id/follow-ups` | `CustomerLeadPageQuerySchema` |
| GET | `/:id/appointments` | `CustomerLeadPageQuerySchema` |
| POST | `/:id/assign` | `CustomerLeadAssignSchema` |
| POST | `/:id/follow-ups` | `CustomerLeadFollowUpSchema` |
| POST | `/:id/convert-customer` | `CustomerLeadConvertSchema` |
| POST | `/:id/mark-invalid` | `CustomerLeadMarkInvalidSchema` |

全部列表默认 page=1/pageSize=20，page 最大 10000，pageSize 最大 100。列表支持 `status/source/assignment/assigneeId/dateFrom/dateTo/keyword`；assignment 为 all/assigned/unassigned，默认 all。unassigned 与 assigneeId 冲突，日期反向或关键词不合法均返回 400。

source 首期只接受 `douyin_miniapp`，source_label 为“抖音小程序”；不接受 H5、平台线索、小红书或视频号。渠道内归因保存在 `source_context.attribution.source_type`，与 source 区分。

列表成功响应示例：

```json
{
  "data": {
    "list": [],
    "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
  },
  "message": "success"
}
```

摘要包含 `id/source/source_label/name/phone_masked/community/status/version/assigned_employee_id/assignee/created_at/followed_at/follow_remark/customer_id/can_view_customer`。无客户访问权限或未关联客户时 customer_id=null、can_view_customer=false；可跳转时 ID 非空、can_view_customer=true。负责人由 ID 与摘要分别提供。

详情补充 `source_context/latest_appointment/appointments/follow_ups/actions`。source_context 是白名单需求/归因/预算/AI 投影，不是数据库原始 form_data；appointments 与 follow_ups 是独立标准分页对象。分页是否还有数据由 totalPages 判断，不增加另一套 truncated 标志。

actions 的 assign/follow_up/convert/mark_invalid 各返回 `{ "enabled": true, "reason": null }` 或禁用原因。服务端提交时必须重新鉴权、查状态，不能相信前端缓存的 enabled。

## 命令、重试与并发

四种动作都要求正整数 expected_lead_version（最大 2147483647）和 UUID idempotency_key。分配额外要求 assigned_employee_id；无效额外要求非空 reason（最多 500 字）。转客户只接受这两个公共字段，来源和客户归属由服务端决定。

普通跟进请求示例：

```json
{
  "expected_lead_version": 1,
  "idempotency_key": "11111111-1111-4111-8111-111111111111",
  "appointment_id": null,
  "follow_up_type": "phone",
  "summary": "电话联系",
  "result": "客户希望下周进一步沟通",
  "next_follow_up_at": null,
  "appointment_status": null,
  "confirmed_visit_at": null
}
```

summary 最多 500 字，result 最多 1000 字；两者 trim 后不能为空。修改预约状态必须提供预约 ID；确认预约必须提供带时区确认时间，其他状态不得提供确认时间。预约是否属于线索与租户、状态转移是否合法由后续 service/RPC 校验，schema 本身不能证明。

命令成功结果使用 `CustomerLeadCommandResultSchema`：公共字段为 action/result/lead_id/lead_version/idempotent。

| action | 额外结果字段 |
|---|---|
| assign | assigned_employee_id、appointments_updated |
| follow_up | follow_up_id、appointment_id、appointment_version、appointment_status；无预约后三项均为 null |
| convert | customer_id、can_view_customer、created_customer、repeated_conversion、appointments_updated |
| mark_invalid | appointments_updated、repeated_invalidation |

转客户结果允许成功但 customer_id=null（无读取权限）；这不是未关联客户。created_customer 与 repeated_conversion 不得同时为 true。当前 schema 验证这些输出一致性，但不代表实际业务事务已实现。

网络结果未知时复用同一幂等键与原参数重试；成功后只重试读取。409 版本或客户 preflight 冲突时刷新详情并让用户重新确认，形成新意图和新键。不能自动把旧意图应用到新版本。

## 错误契约

沿用现有错误外壳 `{ success:false, message, code, requestId, details? }`，通过 `Errors.fromZod/forbidden/business/dbError` 包装，不在 domain 中直接抛业务异常。

- 参数校验：400 `VALIDATION_ERROR`；无操作权限：403 `FORBIDDEN`；认证沿现有 401 错误码。
- 线索、负责人、预约不可见或不存在：对应 `CUSTOMER_LEAD_*_NOT_FOUND`，404；缺员工身份：403 `CUSTOMER_LEAD_EMPLOYEE_REQUIRED`。
- 版本、幂等键、负责人部门、客户 preflight、预约关联客户、手机号变化：对应 `CUSTOMER_LEAD_*_CONFLICT`，409。
- 缺有效电话、无效转客户、已转客户标无效、不可分配/跟进、非法预约状态转移：使用 `CUSTOMER_LEAD_ERROR_CONFIG` 中对应 409 条目。
- 不合法公开输出：500 `CUSTOMER_LEAD_RESPONSE_INVALID`；数据库失败沿 500 `DB_ERROR`。
- 后续 SQL 旧码适配：旧 `*_COMMAND_INVALID` → 400 VALIDATION_ERROR；旧 actor 不可用 → 403 CUSTOMER_LEAD_EMPLOYEE_REQUIRED；旧转换状态损坏 → 500 CUSTOMER_LEAD_RESPONSE_INVALID；旧客户 upsert 失败 → 500 DB_ERROR。其余领域冲突按语义映射，旧 HTTP 入口本身保留旧码。

示例：

```json
{
  "success": false,
  "message": "线索已更新，请刷新后重试",
  "code": "CUSTOMER_LEAD_VERSION_CONFLICT",
  "requestId": "req-1"
}
```

## 本阶段验证方式

离线执行 `bun scripts/check-customer-lead-foundation.ts`，验证分页、输入边界、无预约跟进、预约确认、输出一致性、来源限制、权限保留及 migration 的增量范围。

旧 API 回归必须从 `apps/api` 目录运行。根目录运行会因 `@/*` alias 不属于根 tsconfig 而加载失败，不是业务失败。已有自动化验证与类型检查的实际结果见 `docs/operations/evidence/2026-09-06-customer-leads-foundation.md`。

数据库应用和验收留在下一阶段：核对目标与待执行 migration → dry-run → 应用 → migration list 对齐 → 真实租户权限与双端 smoke。未执行这些步骤前，不宣称新权限已在远端生效或小程序功能已上线。
