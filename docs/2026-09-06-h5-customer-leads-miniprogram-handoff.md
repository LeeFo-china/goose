# H5 活动接入客户线索：微信小程序对接说明

日期：2026-09-06。范围：租户 H5 活动线索 + 原抖音线索。

## 1. 交付与发布边界

本次 gooes 将租户 H5 活动的原始 `marketing_leads` 记录接入统一客户线索读写链路，不复制线索、不改历史 ID、不批量重置状态或客户关联。旧 Admin「营销 / H5 线索」保留查看，处理入口跳到 `/customer-leads?source=h5&leadId=<原线索ID>`。

小程序继续使用 `/tenant/customer-leads`，不新增 H5 专属列表或操作接口。来源扩展为 `douyin_miniapp`（抖音小程序）和 `h5`（H5活动）。不传 `source` 表示全部已接入来源；小红书、视频号尚未接入，不能自行传新枚举。`tenant_id IS NULL` 的平台 H5 线索不在租户列表中。

本文是分支代码的对接契约，不表示生产已发布。本轮未应用远端 migration、未发布 API/Admin/domain 包、未修改 orange。联调前需后端确认环境及版本。

## 2. 登录与权限

所有请求复用现有员工登录后的 `Authorization: Bearer <token>`。租户从登录上下文读取，不传 `tenant_id`，不传其他租户 ID；游客、客户、城市合伙人身份本身不等于租户员工权限。

| 能力 | 必需权限 |
| --- | --- |
| 列表、详情、跟进历史、负责人筛选 | `customer_lead.read` |
| 分配、分配候选员工 | read + `customer_lead.assign` |
| 跟进 | read + `customer_lead.follow_up` |
| 转客户、判无效 | read + `customer_lead.convert` |
| 转化时需要新建客户 | 另需 `customer.create` 且满足目标负责人范围 |
| 跳转查看关联客户 | 独立 `customer.read` 范围，并检查响应 `can_view_customer` |

read 与操作范围取交集；self/department/all 按后端权限和负责人计算。仅持有旧 `marketing_lead.*` 或 `douyin_lead.*` 不自动获得统一操作权限。按详情的 `actions.<action>.enabled/reason` 展示/禁用按钮，不能仅凭线索状态或来源推断可操作。

## 3. 接口与分页

以下路径均相对 API base URL。成功响应沿用 `{ message, data }`；小程序 `api` 封装的 `response.data` 是业务数据，不要重复解包。分页数据为 `{ list, pagination: { page, pageSize, total, totalPages } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/tenant/customer-leads` | 来源混合分页列表 |
| GET | `/tenant/customer-leads/:id` | 详情、动作可用性，内含首屏预约/跟进各 20 条 |
| GET | `/tenant/customer-leads/:id/follow-ups` | 跟进历史分页 |
| GET | `/tenant/customer-leads/:id/appointments` | 预约分页；H5 返回空列表 |
| GET | `/tenant/customer-leads/assignee-filter-options` | 查询筛选用员工选项；不可用作授权分配名单 |
| GET | `/tenant/customer-leads/assignee-candidates` | 操作允许分配的员工候选 |
| POST | `/tenant/customer-leads/:id/assign` | 分配 |
| POST | `/tenant/customer-leads/:id/follow-ups` | 普通跟进，或抖音预约跟进 |
| POST | `/tenant/customer-leads/:id/convert-customer` | 创建/关联客户并转化 |
| POST | `/tenant/customer-leads/:id/mark-invalid` | 判无效 |

所有列表默认 `page=1&pageSize=20`，pageSize 最大 100、page 最大 10000；不得拉全量后前端分页。列表额外支持：

- `source=h5` / `source=douyin_miniapp`；全部来源时省略，不能传空字符串或 `all`。
- `assignment=all|assigned|unassigned`；默认 all。unassigned 不可同时传 assigneeId。
- `assigneeId=<单个员工UUID>`；本次没有新增多员工后端参数。
- `status=new|contacted|converted|invalid`。
- `dateFrom`、`dateTo` 为 YYYY-MM-DD，按北京时间自然日，包含结束日期。
- `keyword` 为姓名/手机号/小区搜索，去空格后 1–80 字；允许文字、数字、空格、`#号栋室-`，不接受 `%_` 等通配符。
- 员工候选/筛选接口支持 `page/pageSize/keyword`，keyword 最多 100 字。筛选接口另支持 `includeEmployeeId`，用于回显已选员工。

例：`GET /tenant/customer-leads?source=h5&assignment=unassigned&page=1&pageSize=20`。

## 4. H5 字段映射

列表统一字段保持：`id/source/source_label/name/phone_masked/community/status/version/assigned_employee_id/assignee/customer_id/can_view_customer/created_at/followed_at/follow_remark`。无完整手机号、无 `form_data`。列表不返回活动详情，避免每行额外查活动。

H5 详情新增的安全上下文示例（均在 `data` 内）：

```json
{
  "source": "h5",
  "source_label": "H5活动",
  "source_context": {
    "demand": "需要了解装修设计",
    "attribution": {},
    "budget": null,
    "ai": null,
    "h5": {
      "page_id": "11111111-1111-4111-8111-111111111111",
      "page_version_id": null,
      "page_title": "秋季装修活动",
      "page_slug": "autumn"
    }
  },
  "latest_appointment": null,
  "appointments": {
    "list": [],
    "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
  }
}
```

上例只展示新增/相关字段，不是完整详情 DTO；完整公共字段及动作示例沿用 [基础对接文档](2026-09-06-customer-leads-miniprogram-handoff.md) 和 [接口样例](customer-leads-api-examples.json)。其中「只支持抖音」的旧说明以本文为准。

| 后端字段 | 小程序展示/处理 |
| --- | --- |
| source / source_label | 来源筛选值 / 来源标签，展示优先使用 source_label |
| source_context.h5.page_title | 活动名称；null 时「活动已不可用」或「未关联活动」 |
| source_context.h5.page_slug | 活动标识，可选展示；不是完整可访问 URL，不拼接未经确认的域名跳转 |
| source_context.h5.page_id / page_version_id | 关联活动/提交版本 ID，可为空，不当作客户 ID |
| source_context.demand | 仅原 form_data.demand 字符串，trim 后截取最多 1000 字；其他任意表单字段不返回 |
| source_context.budget / ai | H5 固定 null，不展示抖音预算/AI 模块 |
| latest_appointment / appointments | H5 无量房预约，不要求用户创建预约才能跟进 |
| follow_remark | 保留原跟进摘要；旧备注不伪造为带员工/时间的新跟进历史 |
| follow_ups | 新操作留下的不可变历史，按分页继续加载 |
| actions | 按 enabled/reason 展示操作可用性；每次刷新重新读取 |
| customer_id / can_view_customer | 仅 true 且 ID 非空时跳转客户；转化成功也可能没有查看权限 |

`h5` 对抖音详情不出现，不能设为所有来源必填。活动被删除或无法查询时，标题/slug 为空仍须正常展示线索。标题/slug 是当前活动信息，不是历史发布版本快照。

## 5. 命令提交契约

四类命令共同携带 `expected_lead_version`（从当前详情 version 获取）和 `idempotency_key`（一个操作意图的 UUID）。不传 source、tenant_id、customer_id 等额外字段。沿用已有 schema，以下为 H5 普通跟进完整 body：

```json
{
  "expected_lead_version": 1,
  "idempotency_key": "22222222-2222-4222-8222-222222222222",
  "follow_up_type": "phone",
  "summary": "电话联系",
  "result": "下周沟通设计需求",
  "next_follow_up_at": null,
  "appointment_id": null,
  "appointment_status": null,
  "confirmed_visit_at": null
}
```

follow_up_type：phone/wechat/online_meeting/onsite/other；summary 1–500 字，result 1–1000 字，trim 后必填；next_follow_up_at 为带时区 ISO 时间或 null。H5 不允许关联抖音预约，即使客户端传了真实的其他预约 ID 也会拒绝。

其他 body：

- assign：共同字段 + `assigned_employee_id=<候选员工UUID>`。
- convert-customer：仅共同字段；按租户内手机号复用已有客户或创建新客户，客户端不选择/传 customer_id。
- mark-invalid：共同字段 + `reason`（trim 后 1–500 字）。已转客户不能判无效。

成功返回 `action/result/lead_id/lead_version/idempotent` 及对应动作结果。H5 普通跟进的 `appointment_id/appointment_version/appointment_status` 均 null；H5 assign/convert/invalid 的 `appointments_updated=0`。转化响应仍可能为 `customer_id=null,can_view_customer=false`，不是失败。

新客户来源字典使用 `h5_campaign`；线索来源枚举仍是 `h5`，两者不要混用。已有客户的负责人、阶段不因线索转化而覆盖；增加一次去重的 H5 来源事实，保留 lead/page/version/community 的安全归因，不写入原始表单或身份凭证。

## 6. 调用顺序和失败处理

1. 员工进入客户线索 → 分页列表 → 详情，取最新 version/actions。
2. 分配时读取分配候选；普通跟进直接填写，不依赖预约接口成功或非空。
3. 用户确认后锁定按钮，同一意图只提交一次。网络超时、结果未知的重试复用相同 body、version 和幂等键；不能换键反复提交。
4. 成功后刷新当前列表和详情，采用新 version。成功但刷新失败，只重试读取，不能再次写入。
5. 409 冲突先刷新，再让用户重新确认；新确认形成新意图，使用新键和新 version。改了内容也必须新键。
6. 分配后失去 read 范围，详情 404 应关闭详情并刷新列表，不重试分配。

| 错误 | 处理 |
| --- | --- |
| 400 VALIDATION_ERROR | 显示字段错误，检查参数、分页与来源枚举；不自动重试 |
| 401 | 按现有员工会话流程重新登录 |
| 403 | 无权限/非员工，收起入口或操作，不切换旧 API 绕过 |
| 404 CUSTOMER_LEAD_NOT_FOUND | 不存在或不在可见范围，关闭失效详情并刷新 |
| 409 CUSTOMER_LEAD_VERSION_CONFLICT | 线索已被其他操作或 H5 重复提交更新，先刷新 |
| 409 CUSTOMER_LEAD_IDEMPOTENCY_CONFLICT | 同键载荷不同，不能改 body 沿用旧键 |
| 409 CUSTOMER_LEAD_CUSTOMER_PREFLIGHT_CONFLICT | 客户匹配状态改变；刷新仍冲突需核对关联客户手机号，不强制覆盖关联 |
| 409 CUSTOMER_LEAD_PHONE_REQUIRED | 缺少有效手机号，不能转客户；本次不新增线索改手机号 API |
| 409 CUSTOMER_LEAD_LEGACY_WRITE_DISABLED | 旧 H5 写入口停用，引导到客户线索并确认统一权限 |
| 网络异常 / 5xx | 提示重试；保留操作意图防止重复写，失败不能显示成功 |

其他业务错误优先使用现有错误映射和后端 message，不吞掉错误或一律显示「提交成功」。

## 7. 旧入口和采集兼容

- 公开 H5 提交接口 `/public/marketing-pages/:slug/leads` 与 `/public/tenants/:tenantSlug/marketing-pages/:slug/leads` 继续采集。重复提交仍更新同一原记录的采集信息，不清空负责人/状态/跟进记录；version 递增，正在处理旧版本的员工可能收到 409。
- 原 H5 身份 token 关联与表单联系电话可以不同，采集仍保留该既有语义；重复提交不能借新 token 改绑已关联客户。若身份关联客户与联系电话匹配客户不一致，允许保留采集、分配和跟进，但转客户返回匹配冲突 409，需核对后处理。
- Admin 旧 H5 列表保留，按钮跳到统一客户线索详情。旧 PATCH `/marketing-leads/:id`、POST `/marketing-leads/:id/convert-customer` 在通过原鉴权后返回 409 LEGACY_WRITE_DISABLED，不再直接改库。
- 旧抖音 API 和权限保留，严格只处理抖音 ID。小程序不要根据 source 切换到旧抖音或旧营销 API。
- 历史 H5 数据自动可查（限当前租户及 read 范围），不需要导入、复制或调用回填接口。

## 8. orange 需要修改的位置（只读核对）

已核对以下现有文件，小程序团队在 orange 自行实施；本次 gooes 不修改 orange：

- `src/types/api/customer-lead/customer-lead.ts`：当前本地契约来源只有抖音，扩为 douyin_miniapp/h5，新增可选 h5 context；同步对应 query schema。先确认 domain 包发布版本，不能假设已发布包含 H5 的版本。
- `src/services/customer_lead.ts`：继续复用 BASE 与统一 command，不新增 H5 API；支持 source=h5 通过本地 schema，保留小程序 Zod 的 jitless 用法。
- `src/packageCustomerLeads/components/LeadFilters.tsx`：加入全部/抖音/H5 来源选择，全部时省略参数、筛选变化回第一页，重置时清空来源条件。
- `src/packageCustomerLeads/components/LeadContext.tsx`：展示 h5 活动名称/标识与 demand；空活动数据正常降级，不显示空预算/AI 内容。
- `src/packageCustomerLeads/pages/list/index.tsx`、`pages/detail/index.tsx`：复用现有 source_label；H5 无预约时保持详情与动作可用，不显示误导性的量房必填。
- `src/packageCustomerLeads/components/FollowUpForm.tsx`、`hooks/useLeadDetail.ts`、`command-state.ts`：确认普通跟进三项预约字段为 null；复核双击、结果未知重试、409 刷新及分配后失去权限的处理。

这些文件是当前只读快照，团队实施时需复核最新分支。LightRAG 本轮查询失败（502），本文以两仓当前源码和本地验证为依据，未上传文档到知识库。

## 9. 发布顺序与验收

先在联调环境验证 migration → API/Admin → 小程序适配包的组合。生产发布前，小程序必须能接受混合来源并正确处理 h5 context；不能把旧契约中「只有抖音」当作后端永久保证。本次未增加客户端版本识别或灰度开关，需双方约定兼容发布窗口；必要时先发布兼容两来源但尚不发送 h5 筛选的小程序，再上线后端和完整来源筛选。

数据库 migration：`supabase/migrations/20260906121818_tenant_h5_customer_leads.sql`；前置统一权限/命令 migration 分别为 `20260906040943`、`20260906043943`。运维先执行 `supabase migration list` 核对目标环境和全部待应用文件，确认后按正式 migration 流程应用，再次检查 Local/Remote 对齐。禁止直接手工 DDL/DML 修库。

回退：先停止 H5 统一写入和入口使用；如需回退函数，用新前向 migration 恢复上一版定义及权限，并保留 H5 跟进历史、来源事实、客户关联与版本。不得删除事实或把版本重置为 1；不能简单回滚 API 就认为旧写入口恢复安全。

小程序验收清单：

- 全部来源显示抖音/H5，分别筛选正确，分页/空状态/筛选重置正确。
- 历史 H5 ID、原状态、客户关联和旧备注保留；新提交无需回填可见。
- H5 详情活动为空仍可展示，原始 form_data/openid/token 不出现在响应或日志。
- 分配只能选允许的员工；跨租户 ID、客户/游客身份和无 read 权限不能读写。
- H5 普通跟进无需预约，详情和分页历史可见；四类动作均带版本/幂等键。
- 连点、超时后重试、写成功刷新失败不重复写；H5 再次提交引发 version 变化时能处理 409。
- 转已有客户不改负责人/阶段、不重复来源事实；无 customer.read 不跳客户。
- 已转客户不能判无效；invalid/converted 不能继续分配或跟进。
- Admin 旧 H5 查看可用，处理跳统一详情；旧写 API 409；旧抖音入口仍仅抖音。

## 10. 可直接转发给小程序团队

> 客户线索要扩展接入租户 H5 活动来源，继续复用现有 `/tenant/customer-leads` 和分配、跟进、转客户、判无效接口，不新增一套 H5 页面/API。请把 source 扩为 douyin_miniapp/h5，不传 source 就是全部；增加“H5活动”筛选和 `source_context.h5` 活动名称/标识展示。H5 没有量房预约，普通跟进的 appointment_id、appointment_status、confirmed_visit_at 均为 null。权限、actions、版本号、幂等和客户查看边界沿用现有契约。请按本文更新本地类型与页面，并完成混合来源、历史数据、重复提交/409、跨租户和无权限验收。代码尚未发布生产，先与后端确认联调环境和发布窗口。
