# 客户线索：小程序后端交接

日期：2026-09-06。范围包括 gooes 通用后端、旧抖音兼容、Admin 客户线索入口、domain 本地交付包及开发环境发布；不包含小程序页面或生产发布。

## 状态和边界

通用 HTTP 路由、共享业务、DTO、分页和权限检查已实现，API 与 Admin 已发布开发环境。实际版本、迁移及只读接口/浏览器验证见 [开发发布记录](./operations/evidence/2026-09-06-customer-leads-dev-release.md)。微信页面和真机验收仍由小程序团队完成。

首期来源只有 `douyin_miniapp`，显示为“抖音小程序”。小程序模块统一叫“客户线索”。小红书、视频号、既有 H5/平台线索采集不在本次范围，不能直接传入未接入的 source。

## 认证与权限

沿用普通 Bearer 员工会话与服务端租户上下文；Admin 和微信已绑定员工使用相同业务入口。访客、微信客户、无员工身份不能管理线索。客户端不得提交 tenant_id 或伪造员工身份。

- 入口/列表/详情/预约/跟进历史要求 `customer_lead.read`。
- 分配、新增跟进、转客户分别额外要求 `customer_lead.assign/follow_up/convert`；无效操作也使用 convert。
- 提交动作校验 read 与动作数据范围的交集。未分配线索只在 all 范围可见。
- 分配候选按 assign 范围列出有效员工；负责人筛选选项按 read 范围回显历史负责人，两者不能混用。
- 未匹配已有客户时额外检查 `customer.create`；非 all 创建范围只能为当前员工本人创建客户。已有同租户同手机号客户保留原负责人。
- 客户跳转单独检查 `customer.read` 的客户负责人范围；不能把“允许转客户”等同于“允许查看客户”。

旧 `douyin_lead.*` 不推导新权限。普通角色需管理员明确配置，新 migration 只给有效租户 system_admin 补四项权限。

## HTTP 契约

前缀 `/tenant/customer-leads`，成功外层由 `ResponseHandler.success` 包装，业务数据位于 `data`。

| 方法 | 子路径 | 输入/用途 |
|---|---|---|
| GET | 空路径 | `page,pageSize,source,status,assignment,assigneeId,dateFrom,dateTo,keyword` |
| GET | `/assignee-candidates` | `page,pageSize,keyword`，分配有效员工候选 |
| GET | `/assignee-filter-options` | `page,pageSize,keyword,includeEmployeeId`，负责人筛选与回显 |
| GET | `/:id` | 详情，无 query |
| GET | `/:id/appointments` | `page,pageSize`，预约分页 |
| GET | `/:id/follow-ups` | `page,pageSize`，跟进分页 |
| POST | `/:id/assign` | 公共命令字段 + `assigned_employee_id` |
| POST | `/:id/follow-ups` | 公共命令字段 + 跟进字段 |
| POST | `/:id/convert-customer` | 仅公共命令字段 |
| POST | `/:id/mark-invalid` | 公共命令字段 + `reason` |

所有列表默认 page=1、pageSize=20，最大 page=10000、pageSize=100，返回 `{list,pagination:{page,pageSize,total,totalPages}}`。空页也保留 pagination。线索列表按 created_at、id 倒序稳定分页；员工候选与负责人筛选选项按 name、id 升序。

assignment 为 all/assigned/unassigned，默认 all；unassigned 不允许同时传 assigneeId。status 为 new/contacted/converted/invalid。日期按北京时间自然日过滤，dateTo 包含当天。未知来源、反向日期、额外字段、不合法 UUID 或超大分页均为 400。

公共命令字段：`expected_lead_version`（详情当前 version，正整数）与 `idempotency_key`（UUID）。

普通跟进示例：

```json
{
  "expected_lead_version": 1,
  "idempotency_key": "11111111-1111-4111-8111-111111111111",
  "appointment_id": null,
  "follow_up_type": "wechat",
  "summary": "已联系客户",
  "result": "约定下周沟通"
}
```

跟进类型支持 phone/wechat/online_meeting/onsite/other；summary 最多 500 字，result 最多 1000 字。next_follow_up_at、appointment_id、appointment_status、confirmed_visit_at 可省略并规范化为 null。没有预约时禁止提交预约状态/确认时间；确认预约须同时给 confirmed_visit_at。指定预约必须属于同租户同线索。

完整共享类型、schema、错误目录：`packages/domain/src/customer-lead*.ts`，通过 `@gooes/domain` 导出。已产出 `1.20.0` 本地交付包，未发布到 registry；安装及校验见下文。

## 完整 JSON 示例

配套文件：[customer-leads-api-examples.json](./customer-leads-api-examples.json)。成功示例包含 HTTP 方法/路径、请求体（写命令）、HTTP 状态和完整响应；错误示例包含 HTTP 状态和完整错误响应。均为合成数据，不含真实客户或凭证，不是开发环境实际调用记录。

| 条目 | 场景 |
|---|---|
| list / empty / detail | 标准分页、空页、无预约详情及动作禁用原因 |
| assignee_candidates / assignee_filter_options | 分配候选与负责人筛选，不能互换 |
| assign / ordinary_follow_up / appointment_follow_up | 分配、普通跟进、确认预约跟进 |
| appointments / follow_ups | 独立分页的预约与跟进历史 |
| convert_created / convert_existing_hidden | 创建新客户，或关联已有但无权查看的客户 |
| convert_already_linked / mark_invalid | 已关联线索再次转化、标记无效 |
| version_conflict / idempotency_conflict / forbidden / not_found | 409、403、404 |

示例是独立分支，不是可以逐个执行的测试脚本。比如无预约详情和预约跟进代表不同状态；无创建权限的员工不能执行创建分支；标记无效示例不是对已转化线索操作。实际提交前总是获取当前详情版本及 actions。

成功包为 `{ "data": ..., "message": "success" }`，不能要求它同时包含 `success: true`。业务错误包为 `{ "success": false, "message": "...", "code": "...", "requestId": "..." }`；存在补充信息时另有 `details`，不要要求这个字段必填。判断 HTTP 状态和 code，不匹配中文文案。

`source` 是管理模块的接入渠道，目前仅 `douyin_miniapp`；`source_context.attribution.source_type` 是该渠道内部的获客归因（例如 short_video/live/search/profile/share/direct/other），不能用它代替列表 source。`source_context`、预算和 AI 可为空，来源适配决定可提供的内容。

## 界面字段映射

| 后端字段 | 小程序用途 |
|---|---|
| source / source_label | 渠道标签，标题仍用客户线索 |
| name / phone_masked / community | 列表基本信息；不自行推导完整手机号 |
| status / assigned_employee_id / assignee | 业务状态与负责人；未分配不是第五种状态 |
| version | 下一次动作的 expected_lead_version |
| customer_id / can_view_customer | 仅 true 且 ID 非空时显示客户详情跳转 |
| source_context | 需求、归因、预算、AI 的白名单摘要；不依赖平台原始 JSON |
| latest_appointment / appointments | 可选预约卡片及独立分页；null/空页为正常情况 |
| follow_ups | 独立分页；appointment_id=null 表示普通跟进 |
| actions[action].enabled / reason | 操作按钮是否可用及禁用原因，提交仍由后端复核 |

转客户成功也可能返回 customer_id=null、can_view_customer=false，此时显示成功提示并刷新线索，不强行跳转。命令返回 action/result/lead_id/lead_version/idempotent 和该动作结果；普通跟进的 appointment_id/version/status 同时为 null。

## 调用和重试

1. 从 `/auth/me/permissions` 取得权限，满足客户线索 read 才展示入口。
2. 拉分页列表，进入详情后使用服务端 actions 与 version。
3. 一次用户操作生成一个幂等键并保存完整提交体，发送期间禁用重复点击。
4. 网络超时且结果未知时，使用原请求体、原版本、原幂等键重试，不换键。
5. 成功后刷新详情与列表；由用户修改参数后的新操作使用新键和刷新后的版本。

409 VERSION_CONFLICT 提示刷新；409 IDEMPOTENCY_CONFLICT 表示该键已绑定其他请求，不能盲目换键重发。ASSIGNEE_SCOPE_CONFLICT/CUSTOMER_PREFLIGHT_CONFLICT 提示状态变化并刷新。无权限为 403，不存在与不可见统一为 404。完整码表见 `customer-lead-errors.ts`；基础认证/校验/数据库错误沿用现有格式。

下面是完整业务码表。表中省略共同前缀 `CUSTOMER_LEAD_`，客户端判断时必须使用完整 code。

| 后缀 | HTTP | 前端处理 |
|---|---|---|
| EMPLOYEE_REQUIRED | 403 | 员工身份不可用，退出线索管理 |
| NOT_FOUND | 404 | 关闭详情并刷新；不可见也按不存在处理 |
| ASSIGNEE_NOT_FOUND | 404 | 刷新员工候选后重新选择 |
| APPOINTMENT_NOT_FOUND | 404 | 刷新预约列表后重新选择 |
| VERSION_CONFLICT | 409 | 刷新详情，用户重新确认操作 |
| IDEMPOTENCY_CONFLICT | 409 | 原键被其他请求占用，不自动换键重发 |
| ASSIGNEE_SCOPE_CONFLICT | 409 | 员工范围变化，刷新详情及候选 |
| CUSTOMER_PREFLIGHT_CONFLICT | 409 | 客户匹配状态变化，刷新再确认 |
| APPOINTMENT_CUSTOMER_CONFLICT | 409 | 预约关联客户变化，刷新再确认 |
| PHONE_CONFLICT | 409 | 手机号变化，刷新再确认 |
| PHONE_REQUIRED | 409 | 提示有效手机号缺失，不创建占位客户 |
| INVALID_NOT_CONVERTIBLE | 409 | 无效线索不能转客户，刷新状态 |
| CONVERTED_NOT_INVALIDATABLE | 409 | 已转客户不能标记无效，刷新状态 |
| NOT_ASSIGNABLE | 409 | 当前状态不可分配，刷新状态 |
| NOT_FOLLOWABLE | 409 | 当前状态不可跟进，刷新状态 |
| APPOINTMENT_TRANSITION_INVALID | 409 | 预约状态变更不允许，刷新预约 |
| RESPONSE_INVALID | 500 | 提示异常并保留 requestId，不宣称写入失败或自动换键 |

基础认证错误按 HTTP 401 沿用现有会话处理，实际缺失 Bearer 返回 `TOKEN_MISSING`，不要只识别 `UNAUTHORIZED`；`FORBIDDEN`（403）、`VALIDATION_ERROR`（400）、`DB_ERROR`（500）沿用现有处理。超时/5xx 且结果未知时，保留原请求意图；已确认 200 后刷新失败，只重试 GET，不再 POST。改派成功后详情 404 是可能的正常权限变化，关闭详情并提示分配成功。

## Domain 1.20.0 本地交付

- 本机文件：`/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.20.0.tgz`。
- SHA-256：`f7cd89002cea94b713825f32edccf365fc5252fba940ebd3d38bcfcd4c97a5f0`。
- 已执行 build、packed consumer 的 TypeScript 与运行时验证。只产出本地包，未执行 npm publish，也未修改 orange 的依赖或锁文件。
- 原 `1.19.0` 本机包保留；新包增加客户线索导出，不删除旧导出。

由小程序团队在 orange 中执行（gooes agent 不代执行）：

```bash
shasum -a 256 /Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.20.0.tgz
pnpm add /Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.20.0.tgz
```

先匹配上面的校验和，再安装；其他机器需要先取得同一份制品，不能使用不存在的本机路径。安装后按 orange 当前脚本验证包版本、lockfile、类型与微信构建，不手工复制 domain 源文件。

## 联调准备与验收责任

开发库目标标识 `api-dev`，两项客户线索 migration 已应用，发布前再次验证 579 条 Local/Remote 对齐，发布流程的迁移门禁也已通过。本轮不重复应用。

- API 基地址：`https://api-dev.goodcms.cn`；通用列表为 `GET /tenant/customer-leads`。
- Admin 新入口：`https://admin-dev.goodcms.cn/customer-leads`；旧入口 `/douyin-miniapp/leads` 保留。
- 实际发布提交：`d1d29a09c8331863ea5b3e4d99d3e3e1208114f5`，分支 `feature/customer-leads-foundation`，未合并 main。
- [Release Dev 34016423164](https://github.com/LeeFo-china/goose/actions/runs/34016423164) 于 2026-09-06 14:33:04（北京时间）成功结束。新旧 API 分页、详情、候选、历史及两页浏览器只读检查通过，新旧列表返回相同的 2 条线索 ID。没有对现有线索执行写命令。

| 阶段 | 责任方 | 放行条件 |
|---|---|---|
| 代码与制品 | gooes | Admin 静态/行为检查、domain 构建及 tarball 消费验证 |
| 开发环境发布 | gooes 发布负责人 | 明确版本与 API 基地址，新旧接口实际 smoke |
| 角色准备 | 租户管理员 | 明确配置 read/assign/follow_up/convert 及需要的客户权限，不自动扩大普通角色授权 |
| 页面接入 | orange 团队 | 工作台入口、分包页面、分页、动作/错误/幂等处理 |
| 双端验收 | gooes + orange | self/部门/all、无权限、改派后不可见、无预约/有预约、已有客户归属不变、无客户查看权限、并发冲突、同键重试、租户切换 |

部署后单个现有 Admin 账号的只读接口/页面检查已完成。实际微信真机、双账号并发、普通角色数据范围完整矩阵及远端写命令验收尚未完成；后端 mock/本地 SQL 结果不能代替这些证据。

## 旧 Admin 与数据兼容

现有 `/tenant/douyin-miniapp/leads` 保留原路径、旧权限、严格 DTO 与 DOUYIN_* 错误；旧新增跟进仍要求预约。历史 marketing_leads、负责人、版本及跟进/操作流水不复制、不清空。新旧入口共享命令核心和幂等记录。通用普通跟进也可在旧线索历史中读取，但旧端仍不提供无预约新增表单。

Admin 已新增并发布开发环境 `/customer-leads`「客户线索」入口，使用新权限；旧 `/douyin-miniapp/leads` 入口与旧权限保留。两者共享工作台组件，不做自动跳转，不要求现有员工立刻换入口。两页开发环境浏览器只读检查通过，生产环境尚未发布本功能。

## orange 团队待办（本次未修改）

只读核对了 `src/app.config.ts`、`src/pages/index/index.tsx`、`src/pages/index/homeModel.tsx` 及工作台 hooks/components 引用、`src/services/permission.ts`、`src/services/customer.ts`、`src/utils/api.ts`，并检索了员工工作台及客户权限相关 docs。

- 在 `src/services/` 增加客户线索 API 封装，复用现有 api 工具与权限获取，不使用客户 CRUD 代替线索命令。
- 增加线索列表/详情/跟进表单/员工选择页面，在 `src/app.config.ts` 注册；在员工工作台按 read 权限提供“客户线索”入口。当前工作台 tab 仅 customer/project，不能只改一个 label 假设第三种类型已支持。
- 使用新的共享包导出；分配候选和筛选候选都按分页增量请求。
- 复用已有客户详情导航，仅在 can_view_customer 为 true 时启用。
- 切换租户/账号、权限变更、操作成功时刷新线索缓存，不能复用上一租户的数据。

验收至少覆盖：普通员工 self、部门、all 范围；未分配；无 read/无动作权限；有转化但无创建权限；可关联但不可查看客户；普通跟进与预约跟进；双端同时操作的版本冲突；同键重试；已有客户不换负责人；两类员工选择器分页；旧 Admin 回归。

交接边界：gooes 提供后端与文档，orange 实施页面与真机验收。本次没有编辑、构建或执行 orange Git 写操作。GoodCMS LightRAG 查询返回 502，历史核对以本地实际代码和 docs 为准，未执行知识库上传。
