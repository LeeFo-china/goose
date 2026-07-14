# 小程序本地服务商自主入驻设计

**日期：** 2026-07-14

**状态：** 已确认，待实施计划

**范围：** gooes 后端、平台后台、城市合伙人门户，以及 orange 小程序对接契约

## 1. 背景与目标

小程序 visitor 的“本地服务商”页面目前只展示 visitor 定位区域内已匹配的装修公司，
没有面向装修公司的主动入驻入口。新需求是在该页面增加“成为服务商”，允许装修公司
负责人自行提交平台入驻申请，并在平台审核通过后创建装修公司租户。

若审核通过时，该装修公司的服务区域存在唯一有效城市合伙人，系统应自动建立装企与
城市合伙人的归因绑定。若没有符合条件的合伙人，租户仍可正常开通但保持未归因；若匹配
结果存在歧义，则必须由平台审核人选择，不能随机归因。

本设计采用以下核心原则：

- 平台拥有最终审核权，城市合伙人只做非阻断式区域协查。
- 申请提交不直接创建租户，平台审核通过后才创建正式租户。
- 租户开通与“本地服务商”公开展示分离。
- 邀请码入驻和本地服务商页自主入驻共用一套申请状态机。
- 归因、审核、租户创建和公开展示均由后端作为唯一事实来源。

## 2. 当前实现与差距

### 2.1 本地服务商页

orange 当前页面 `src/packageVisitor/pages/visitor-local-services/index.tsx` 从本地保存的
visitor 定位快照读取 `matched_tenants`，只展示已匹配公司。无候选公司时页面只显示
空状态和返回按钮，尚无“成为服务商”入口。

当前匹配链路由 `POST /visitor/location-bootstrap` 产生定位上下文。后端按装修公司配置
的有效服务区域匹配 visitor 所在区域，不允许跨区域兜底。公司地址与服务区域是不同
概念：公司地址用于展示和导航，服务区域用于决定公司是否覆盖 visitor 所在区域。

### 2.2 城市合伙人扫码入驻

现有 `POST /partner-onboarding/tenant-applications` 名称上是“申请”，实际行为是校验
邀请码和短信验证码后立即创建 `active` 租户、初始化管理员，并写入
`tenant_partner_bindings`。该流程没有持久化申请记录，也没有平台审核状态。

orange 当前 `tenant-onboarding` 页面收到成功响应后直接显示“入驻成功”，并引导负责人
使用管理员手机号登录。这与城市合伙人原始 PRD 中“提交申请、平台审核通过后创建租户
并绑定合伙人”的规则不一致。

### 2.3 合伙人权限

现有城市合伙人门户能够查看邀请码、已绑定装企、收入、佣金和结算，但没有装修公司
申请协查接口，也没有平台审核权限。平台权限已经包含合伙人管理和绑定管理，正式绑定
本就应由平台控制。

### 2.4 需要修正的实现边界

- 公开申请不能继续绕过平台审核创建正式租户。
- `platform_partner_applications` 表表示“城市合伙人申请”，不能复用为“装修公司入驻
  申请”。
- 现有 TypeScript 入驻流程按多次 Supabase 调用依次创建租户、初始化数据和绑定，不能
  保证整个审核通过动作的事务原子性。
- 本地服务商页不能长期依赖本地 `matched_tenants` 快照作为实时公开列表。
- 现有上传抽象把直传文件注册为 `public`，不能直接用于营业执照等敏感资料。

## 3. 已确认的产品决策

### 3.1 双门槛

平台审核通过后完成：

1. 创建正式 `active` 租户。
2. 初始化管理员和默认组织数据。
3. 在满足归因条件时建立城市合伙人绑定。
4. 创建状态为 `draft` 的服务商公开资料。

审核通过不代表立即出现在 visitor 的本地服务商列表。装修公司还需完成公开资料和服务
区域配置，并经过发布审核后进入 `published` 状态。

### 3.2 审核权责

- 平台是最终审核人，对主体真实性、平台准入、租户创建和最终归因负责。
- 城市合伙人只提供本地协查意见，没有直接通过、驳回、创建租户或覆盖绑定的权限。
- 合伙人协查不构成平台审核的前置硬门槛。
- 建议协查 SLA 为 48 小时；超时后平台仍可独立完成审核。
- 平台可以在协查完成前审核，也可以参考协查意见要求补充资料或驳回。

### 3.3 归因时点

申请提交时只计算候选合伙人并记录匹配快照，不创建正式绑定。平台审核通过时重新校验
合伙人状态和区域覆盖，并在租户创建事务中建立正式绑定。

## 4. 角色与权限

| 角色 | 能力 | 明确禁止 |
| --- | --- | --- |
| 装企申请人 | 提交申请、查看自己的申请、补充资料、撤回未终审申请 | 查看他人申请、指定最终合伙人、直接创建租户 |
| 城市合伙人 | 查看分配给自己的协查任务、提交协查意见 | 平台终审、修改申请资料、查看其他区域申请、创建租户、覆盖绑定 |
| 平台审核人 | 查看申请、要求补充、通过、驳回、确认最终合伙人 | 绕过审计直接改库 |
| 租户管理员 | 审核通过后登录租户、维护服务商公开资料、提交发布审核 | 自行将公开状态改为 `published` |
| visitor | 查看当前定位区域内已发布服务商、从页面进入申请 | 传入租户或合伙人 ID 决定归因 |

平台接口继续使用明确的平台权限。建议装企申请终审使用新的
`platform.tenant_onboarding.review` 权限；服务商发布审核使用
`platform.service_provider.publish` 权限。合伙人协查权限来自已认证的合伙人成员身份和
当前 `partner_id`，不复用平台权限。

## 5. 领域模型

所有数据库变更必须通过 `supabase/migrations/` 管理。

### 5.1 `tenant_onboarding_applications`

该表是装修公司入驻申请的唯一事实来源，建议包含：

- `id`、`application_no`。
- `company_name`、`unified_social_credit_code`。
- `business_license_file_id`，关联私有文件对象。
- `admin_name`、`admin_phone`。
- 公司地址：省、市、区县、`region_code`、详细地址、经纬度和 POI 信息。
- `service_region_codes`，表示申请人声明的实际服务区域。
- `source_channel`：`local_services`、`partner_invite` 或平台允许的其他来源。
- `visitor_id`、`visitor_context_id`、`invite_code_id`。
- `candidate_partner_id`、`candidate_match_reason`、候选匹配快照。
- `final_partner_id`、`attribution_source_type`。
- `status`、`partner_assist_status`、`version`。
- `converted_tenant_id`。
- 平台审核人、审核时间、平台可公开的审核备注。
- 隐私政策版本、入驻规则版本、授权时间。
- 创建、更新时间和撤回时间。

主状态：

- `submitted`
- `reviewing`
- `supplement_required`
- `approved`
- `rejected`
- `withdrawn`

城市合伙人协查状态独立保存：

- `not_applicable`
- `pending`
- `verified`
- `supplement_suggested`
- `not_recommended`
- `expired`

主状态与协查状态分离，避免协查超时阻塞平台终审。

### 5.2 `tenant_onboarding_application_reviews`

该表保存追加式审核记录，不覆盖历史：

- `application_id`。
- `review_stage`：`partner_assist` 或 `platform_final`。
- `decision`：协查意见或平台动作。
- `actor_type`、`actor_employee_id`、`actor_partner_member_id`。
- 操作前后主状态、协查状态和版本号。
- 审核意见、结构化补充字段列表。
- 创建时间。

平台要求补资料、申请人重新提交、合伙人反馈、平台通过/驳回和申请人撤回均写入审核
记录或对应审计事件。

### 5.3 `tenant_service_provider_profiles`

该表与租户一对一，承载公开展示门槛和公开资料：

- `tenant_id` 唯一。
- `status`：`draft`、`pending_review`、`published`、`suspended`。
- 公开名称、简介、公开电话、门店地址和必要的展示资料。
- 提交审核、平台审核、发布时间和暂停原因。
- 创建、更新时间。

营业执照原图不属于公开资料，不得通过该表或 visitor 接口返回。

### 5.4 合伙人绑定来源

扩展 `tenant_partner_bindings.source_type` 的约束，使用明确来源：

- `invite_code`
- `region_auto_assignment`
- `platform_manual`
- `transfer_approved`

现有历史值保持兼容。不得使用 `lead_source` 或模糊的 `manual` 代替区域自动归因。

### 5.5 约束与索引

至少包含：

- `application_no` 唯一索引。
- 统一社会信用代码标准化后的查询索引。
- 手机号与创建时间索引。
- 主状态与创建时间倒序索引。
- `candidate_partner_id + partner_assist_status + created_at` 索引。
- `service_region_codes` GIN 索引。
- `platform_partners.region_codes` GIN 索引。
- 服务商公开状态与更新时间索引。
- 服务区域支持 `adcode/status/tenant_id` 实时匹配的组合索引。
- 一个申请最多转换为一个租户；一个租户最多关联一个成功转换申请。
- 同一主体存在未完成申请时，禁止再创建新的未完成申请。

审核通过时将标准化后的统一社会信用代码写入 `tenants` 的受约束字段，作为正式租户主体
去重依据。通过 migration 增加可空字段和“非空时唯一”的部分唯一索引；历史租户由平台
后续认领流程补齐，不在本需求中自动猜测或回填。

新增索引前后使用代表性查询执行 `EXPLAIN ANALYZE`，确认申请列表、合伙人任务列表和
本地服务商列表没有全表扫描风险。

## 6. 状态机

### 6.1 申请主状态

```text
submitted
  ├─> reviewing
  ├─> supplement_required
  ├─> approved
  ├─> rejected
  └─> withdrawn

reviewing
  ├─> supplement_required
  ├─> approved
  └─> rejected

supplement_required
  ├─> submitted（申请人补充并重新提交，version + 1）
  └─> withdrawn
```

`approved`、`rejected` 和 `withdrawn` 是终态。已驳回申请如果允许重新申请，应创建新申请
并关联历史申请，不把原终态改回审核中。

### 6.2 协查状态

```text
not_applicable

pending
  ├─> verified
  ├─> supplement_suggested
  ├─> not_recommended
  └─> expired
```

平台终审完成后，尚未反馈的协查任务自动结束，不再允许提交意见。协查意见不直接改变
申请主状态。

### 6.3 服务商公开状态

```text
draft
  └─> pending_review

pending_review
  ├─> published
  └─> draft（退回修改）

published
  ├─> pending_review（关键公开资料变更）
  └─> suspended

suspended
  └─> pending_review
```

租户状态被暂停或归档时，即使公开资料仍标记为 `published`，visitor 查询也必须排除该
租户。

## 7. 区域匹配与归因规则

### 7.1 数据可信度

visitor 定位上下文只用于预填和来源追踪，不是装修公司服务能力的证明。申请人必须重新
确认公司地址和实际服务区域，平台终审时确认服务区域。

公司办公地址、申请服务区域和 visitor 当前定位必须分开保存，不能相互兜底。

### 7.2 匹配顺序

1. 存在有效邀请码时，邀请码对应合伙人优先成为候选，但必须校验合伙人状态、邀请码
   状态和区域覆盖。
2. 无邀请码时，根据平台确认后的主营服务区域匹配 `active` 城市合伙人。
3. 区县级覆盖优先于城市级，城市级优先于省级。
4. 最高具体层级只有一个有效合伙人时，允许自动归因。
5. 同一最高层级存在多个有效合伙人时，标记为歧义，由平台审核人选择。
6. 没有合伙人时，创建未绑定租户，不影响租户开通。

提交时只有唯一候选才自动创建 `pending` 协查任务。无候选或多个同级候选时，协查状态
保持 `not_applicable`；平台明确选择合伙人后，可以手动发起协查，但平台终审仍不等待该
任务。

区域父子关系通过行政区划数据解析。例如城市代码 `411500` 覆盖其下区县，不能只做
字符串相等或简单前缀判断。

### 7.3 提交与通过两次校验

提交申请时保存候选合伙人和匹配原因，便于分配协查任务。平台通过时必须再次校验：

- 合伙人仍为 `active`。
- 合伙人仍覆盖审核确认的服务区域。
- 不存在新的同级归因歧义。
- 目标租户不存在其他有效绑定。

校验失败时不能悄悄使用旧候选。平台应重新选择合伙人或明确以未归因方式开通。

### 7.4 首次来源和覆盖规则

- 邀请码来源在有效且区域匹配时优先于区域自动匹配。
- 已有正式租户不能通过自主申请创建第二个租户。
- 已有有效合伙人绑定不能被自主申请自动覆盖。
- 已有租户的认领、解绑或转移进入独立的平台审核流程。

## 8. 审核通过事务

平台通过动作必须幂等、原子地完成：

1. 按申请 ID 锁定记录，并校验 `version` 和当前状态。
2. 再次检查统一社会信用代码、管理员手机号和现有租户冲突。
3. 再次解析最终合伙人。
4. 创建 `active` 租户。
5. 初始化默认部门、岗位、角色、管理员和模板应用记录。
6. 如果存在最终合伙人，创建唯一有效的 `tenant_partner_bindings`。
7. 将平台确认的申请服务区域复制为状态 `inactive` 的 `tenant_service_areas`，供租户确认
   和后续发布审核使用，但此时不参与 visitor 匹配。
8. 创建状态为 `draft` 的 `tenant_service_provider_profiles`。
9. 将申请标记为 `approved` 并写入 `converted_tenant_id`、`final_partner_id`。
10. 写入平台审核记录和审计日志。

重复请求如果申请已经成功转换，应返回同一个申请、租户和绑定结果，并标记
`idempotent: true`。任何一步失败都应回滚，不得留下半初始化租户、无管理员租户或错误
绑定。

当前 Supabase 多调用流程不能满足该事务边界。实施时应通过 migration 新增窄范围的
PostgreSQL RPC，复用或抽取现有默认租户初始化 SQL，使 controller/service 只负责权限、
参数和业务编排，repository/RPC client 负责数据库事务。

## 9. API 契约

所有列表接口默认 `page=1&pageSize=20`，`pageSize` 最大 `100`。

### 9.1 小程序申请人接口

```http
POST  /tenant-onboarding/applications/send-code
POST  /tenant-onboarding/applications
GET   /tenant-onboarding/applications/mine?page=1&pageSize=20
GET   /tenant-onboarding/applications/:id
PATCH /tenant-onboarding/applications/:id/supplement
POST  /tenant-onboarding/applications/:id/withdraw
```

小程序提交和查询要求有效 visitor 登录态。短信验证码进一步确认负责人手机号。申请详情
按 `visitor_id` 校验所有权，不能仅凭申请编号公开查询。

提交请求核心字段：

```json
{
  "company_name": "固始晴天装饰工程有限公司",
  "unified_social_credit_code": "91411525MA9G000000",
  "business_license_file_id": "uuid",
  "admin_name": "负责人",
  "admin_phone": "13900139000",
  "sms_code": "123456",
  "company_location": {
    "province": "河南省",
    "city": "信阳市",
    "district": "固始县",
    "region_code": "411525",
    "address": "详细地址",
    "latitude": 32.0,
    "longitude": 115.0
  },
  "service_region_codes": ["411525"],
  "visitor_context_id": "uuid",
  "invite_code": null,
  "source_channel": "local_services",
  "privacy_policy_version": "current-version",
  "onboarding_terms_version": "current-version"
}
```

请求头必须带 `Idempotency-Key`。成功返回 HTTP `202`：

```json
{
  "data": {
    "application": {
      "id": "uuid",
      "application_no": "ZQ-20260714-A1B2",
      "status": "submitted",
      "partner_assist_status": "pending",
      "submitted_at": "2026-07-14T00:00:00.000Z"
    },
    "next_action": "wait_for_review",
    "estimated_review_hours": 48,
    "created": true,
    "idempotent": false
  }
}
```

提交成功不返回租户 token，不返回员工登录权限，也不宣称入驻已经完成。

### 9.2 敏感资料上传

复用现有 COS 直传架构，但新增专用场景 `tenant_onboarding_license`：

```http
POST /uploads/cos/direct-init
POST /uploads/cos/direct-complete
```

该场景允许 visitor 身份上传，文件大小、MIME 和对象路径由后端校验。文件对象必须注册为
`private`，不能进入现有公开场景集合，不能通过 `/uploads/public-url` 访问。平台审核人
通过鉴权后的短期签名读取接口访问；合伙人协查接口不返回文件地址。

### 9.3 平台审核接口

```http
GET  /platform/tenant-onboarding/applications?page=1&pageSize=20
GET  /platform/tenant-onboarding/applications/:id
POST /platform/tenant-onboarding/applications/:id/request-supplement
POST /platform/tenant-onboarding/applications/:id/approve
POST /platform/tenant-onboarding/applications/:id/reject
```

列表支持状态、区域、候选合伙人和关键词筛选。通过请求携带当前 `version`，在归因歧义时
必须明确传入最终合伙人或明确选择未归因开通。

### 9.4 城市合伙人协查接口

```http
GET  /partner/onboarding-applications?page=1&pageSize=20
GET  /partner/onboarding-applications/:id
POST /partner/onboarding-applications/:id/assist-review
```

Repository 必须按登录合伙人的 `partner_id` 限定查询，不能先查全量再在 service 内过滤。
终审后或协查超时后，提交意见返回稳定的状态冲突错误。

### 9.5 visitor 本地服务商实时列表

```http
GET /visitor/local-service-providers?page=1&pageSize=20
```

后端从当前有效 visitor 定位上下文读取区域，实时查询同时满足以下条件的公司：

- 租户状态为 `active`。
- 服务商公开状态为 `published`。
- 至少一个有效服务区域覆盖 visitor 当前区域。
- 只选择公开卡片需要的字段。
- 不跨区域兜底。

响应使用标准分页结构：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

本地保存的 visitor 快照只用于显示当前区域，不再作为服务商列表的最终数据源。

## 10. 小程序交互设计

### 10.1 本地服务商页

“成为服务商”入口始终展示，包括当前区域没有任何服务商的空状态。推荐文案：

> 装修公司？申请成为本地服务商

进入申请页时携带 `visitor_context_id` 和当前区域用于预填。页面必须允许申请人修改公司
地址和服务区域，不能把 visitor 定位静默提交为装企服务区域。

### 10.2 统一申请页

本地服务商入口和合伙人二维码入口复用同一申请表单：

1. 负责人手机号和短信验证。
2. 公司主体与营业执照。
3. 公司地址与服务区域。
4. 隐私授权与确认提交。

二维码入口额外展示邀请合伙人卡片；无邀请码入口不展示空的邀请信息。

### 10.3 提交结果与状态

当前 orange 的“入驻成功、请登录员工工作台”改为：

> 申请已提交
>
> 平台预计在 1–2 个工作日内完成审核，你可以在此查看进度。

小程序提供“我的入驻申请”或等价状态入口，展示：

- 审核中。
- 待补资料及具体补充项。
- 已通过并引导管理员登录。
- 已驳回及允许公开的原因。
- 已撤回。

城市合伙人内部意见不直接展示给申请人。可以显示“区域协查中/已完成”，但不暴露内部
风险备注。

### 10.4 orange 侧预期改动

orange 由小程序团队维护，gooes 任务不得修改该仓库。预计涉及：

- `src/packageVisitor/pages/visitor-local-services/index.tsx`：增加入口、空状态入口和实时
  分页列表调用。
- `src/packageVisitor/pages/tenant-onboarding/index.tsx`：支持无邀请码进入，提交结果改为
  审核申请。
- `src/packageVisitor/pages/tenant-onboarding/components/TenantOnboardingApplicationForm.tsx`：
  增加主体资质、授权和补资料能力。
- `src/services/partner_onboarding.ts`：迁移到统一装企申请接口。
- 新增申请状态 service 和页面/模块。
- 更新重复提交、补资料、驳回和状态冲突错误处理。

## 11. 平台后台与合伙人门户

### 11.1 平台后台

新增独立“装企入驻”模块，不放入城市合伙人页面的普通 Tab。页面包含：

- 待审核、待补资料、已通过、已驳回列表。
- 公司主体、负责人、地址和服务区域。
- 系统计算的候选合伙人和匹配依据。
- 合伙人协查状态与意见。
- 重复主体、重复手机号和区域歧义风险提示。
- 追加式审核时间线。
- 要求补充、通过、驳回操作。

通过时平台确认最终合伙人。存在同级多个候选时，页面必须要求显式选择合伙人或选择
“暂不归因”，不能自动勾选第一个。

### 11.2 城市合伙人门户

新增“装企协查”模块：

- 默认分页展示待协查任务。
- 仅返回当前合伙人的任务。
- 展示完成本地核验所需的最少信息。
- 支持“情况属实、建议补充、不建议通过”和说明。
- 不展示“审核通过”“创建租户”“修改归因”等平台操作。

### 11.3 租户服务商资料

租户管理员可维护公开名称、简介、公开联系方式、门店地址和服务区域，并提交发布审核。
关键资料变更使 `published` 重新进入 `pending_review`；普通非关键字段是否免审由后续平台
配置决定，第一期默认关键公开资料均需重新审核。

平台发布服务商资料时，同时把本次审核通过的服务区域更新为 `active`；退回修改时保持
`inactive`。发布状态和服务区域启用必须在同一事务中完成，避免出现“资料未发布但服务
区域已经参与匹配”的中间状态。

暂停公开只改变服务商公开状态，不停用 SaaS 租户。租户被暂停时必须从 visitor 查询中
排除。

## 12. 重复、冲突与幂等

- 统一社会信用代码已存在正式租户：不创建重复租户，转平台处理“认领已有公司”。
- 管理员手机号已属于现有员工：引导登录已有账号或进入认领流程。
- 同一主体已有未完成申请：返回原申请和当前状态。
- 相同 `Idempotency-Key` 重试：返回同一申请，`idempotent: true`。
- 同一申请重复通过：返回同一租户和绑定，不重复初始化。
- 已有有效合伙人绑定：自主申请不能覆盖，只能进入绑定变更审核。
- 合伙人在终审前被暂停、区域变化或出现同级重叠：停止自动归因，由平台重新确认。
- 补资料提交必须携带当前版本；版本落后返回状态冲突。

## 13. 安全、隐私与通知

- 短信发送按手机号、IP 和设备限流。
- 营业执照等敏感资料存储为私有文件。
- 合伙人侧手机号和地址按最小必要原则返回；证件原图和完整证件号码只对平台开放。
- 申请人提交时明确同意平台审核，以及在区域存在合伙人时进行必要的本地协查。
- 日志不得输出完整手机号、证件号码、营业执照内容或验证码。
- 审核、归因、绑定变更和公开状态变更写入平台审计。
- 申请提交、要求补资料、审核通过和驳回可发送微信订阅消息或短信。
- 通知在业务事务提交后发送；通知失败不回滚审核结果，第一期记录失败并支持平台后台
  重发，不引入 Redis、外部队列或新依赖。

## 14. 错误处理

所有错误通过 `apps/api/src/errors/error-factory.ts` 包装。建议稳定错误码：

- `TENANT_ONBOARDING_APPLICATION_DUPLICATED`
- `TENANT_ONBOARDING_SUBJECT_EXISTS`
- `TENANT_ONBOARDING_PHONE_MEMBER_EXISTS`
- `TENANT_ONBOARDING_LICENSE_REQUIRED`
- `TENANT_ONBOARDING_REGION_INVALID`
- `TENANT_ONBOARDING_STATE_CONFLICT`
- `TENANT_ONBOARDING_SUPPLEMENT_NOT_ALLOWED`
- `TENANT_ONBOARDING_PARTNER_AMBIGUOUS`
- `TENANT_ONBOARDING_REVIEW_FORBIDDEN`
- `TENANT_ONBOARDING_APPLICATION_NOT_FOUND`
- `TENANT_ONBOARDING_DOCUMENT_FORBIDDEN`

越权读取申请统一返回不暴露资源存在性的响应。平台终审的数据库事务失败时保留原审核
状态，并返回可重试的业务/数据库错误，不把申请标记为已通过。

## 15. 兼容与发布顺序

### 第一阶段：后端和平台审核

- 新增 application、review 和 service provider profile 数据模型。
- 新增统一申请接口和私有营业执照上传场景。
- 新增平台审核模块、区域候选计算和原子开通 RPC。
- 新增 visitor 实时分页服务商接口。
- 新增租户服务商资料、服务区域确认和平台发布审核能力。

### 第二阶段：小程序接入

- 本地服务商页增加“成为服务商”。
- 合伙人扫码入口与自主入口迁移到统一申请接口。
- 增加申请状态、补资料和审核结果页面。
- 服务商列表切换到实时分页接口。

### 第三阶段：城市合伙人协查

- 上线合伙人协查列表、详情和反馈。
- 增加 48 小时 SLA、提醒和超时状态。
- 平台后台展示协查意见，但协查继续保持非阻断。

### 第四阶段：关闭旧直接开通入口

- 在小程序新版本稳定并完成最小版本策略后，关闭旧
  `POST /partner-onboarding/tenant-applications` 的直接创建行为。
- 旧接口短期返回明确的升级/迁移错误，不再创建 `active` 租户。
- 观察期结束后删除旧路由和仅为旧链路服务的代码。

后端先提供新接口，orange 完成适配后再切断旧接口，避免旧版本把 `202 submitted` 误显示
为“入驻成功”。兼容窗口从新版小程序审核通过并全量发布之日起最多保留 14 个自然日；
第 15 天起旧接口不得再创建租户，避免旧绕审入口长期存在。

## 16. 验收与测试

### 16.1 后端自动化测试

- 申请 schema、短信校验和幂等键。
- 申请主状态和协查状态的合法/非法转换。
- visitor 只能读取自己的申请。
- 合伙人只能读取分配给自己的协查任务。
- 平台权限和合伙人权限不能互换。
- 城市、区县和省级区域父子匹配。
- 邀请码优先、唯一候选、无候选和多个同级候选。
- 终审前合伙人状态/区域变化的重新校验。
- 重复统一社会信用代码、重复手机号和已有租户认领分支。
- 审核通过幂等和事务回滚。
- `draft` 服务商不公开，`published` 服务商只在覆盖区域返回。
- 服务商列表分页和 `pageSize=101` 校验。
- 私有营业执照不可通过公开文件 URL 获取。

### 16.2 端到端验收

1. 无城市合伙人的区域申请，平台通过后创建未绑定租户。
2. 唯一合伙人覆盖区域，生成协查任务，平台通过后自动归因。
3. 同级多个合伙人覆盖区域，平台必须显式选择或暂不归因。
4. 合伙人 48 小时未反馈，平台仍能完成审核。
5. 平台要求补资料后，申请人补充并重新提交。
6. 重复提交不会产生多份申请或多套租户。
7. 开通事务任一步失败，不留下半初始化租户或错误绑定。
8. 新租户公开状态为 `draft` 时不出现在本地服务商列表。
9. 发布后只在服务区域覆盖的 visitor 定位中展示。
10. 其他区域 visitor 不看到该公司。
11. 暂停公开后从实时列表排除，但租户后台继续可用。
12. 合伙人不能查看其他合伙人的申请，也不能执行终审。
13. 新版小程序正确显示“申请已提交”，不提前引导登录。
14. 旧直接开通接口关闭后不再创建 `active` 租户。

### 16.3 实施验证

- API 相关单测。
- Admin 结构/交互测试和类型检查。
- API 类型检查、构建和文件体积检查。
- 代表性区域匹配和列表查询 `EXPLAIN ANALYZE`。
- migration 应用前 dry-run。
- migration 应用后 `supabase migration list` Local/Remote 对齐。
- 后端与小程序在微信开发者工具或真机完成联合 smoke。
- 确认 `/Users/leefo/Public/work/orange` 在 gooes 实施中始终未被修改。

## 17. 范围外事项

- 不让城市合伙人拥有平台最终审核权。
- 不允许合伙人收取装企入驻费或代替平台签署协议。
- 不在第一期实现自动客服外呼、OCR 自动审批或第三方企业征信采购。
- 不引入 Redis、消息队列或新的外部基础设施。
- 不自动覆盖已有租户或已有合伙人绑定。
- 不修改公开项目的区域展示规则。
- 不在 gooes 任务中修改 orange 仓库。

## 18. 现有资料依据

- `docs/2026-07-04-city-partner-platform-prd.md`
- `docs/2026-07-05-city-partner-mvp-acceptance-handoff.md`
- `docs/2026-07-07-partner-tenant-onboarding-miniprogram-handoff.md`
- `docs/2026-06-06-visitor-local-services-tenant-address-backend.md`
- `docs/superpowers/specs/2026-07-11-visitor-public-project-region-scope-design.md`
- orange `docs/2026-06-05-visitor-location-context-miniprogram.md`（只读参考）
- orange `src/packageVisitor/pages/visitor-local-services/index.tsx`（只读参考）
- orange `src/packageVisitor/pages/tenant-onboarding/index.tsx`（只读参考）
