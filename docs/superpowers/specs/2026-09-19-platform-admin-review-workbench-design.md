# 平台超管移动审核台后端设计

日期：2026-09-19

## 目标

为抖音小程序的平台管理页提供轻量移动审核台，覆盖装企入驻与城市合伙人申请的待办统计、分页列表、详情、附件预览、通过、驳回、要求补充资料和审核日志。所有接口仅允许平台超管访问，并在并发重试下保持版本一致和写入幂等。

上游合同以只读文档 `/Users/leefo/Public/work/orange/docs/miniprogram/2026-09-19-platform-admin-review-workbench-handoff.md` 为准。Orange 仓库不做任何修改。

## 现状与缺口

装企入驻已有 `/platform/tenant-onboarding/applications` 审核链路、乐观版本、审核记录、原子状态变更和原子创建租户 RPC。缺口是移动端路径、字段映射、脱敏详情、汇总接口和统一日志接口。

城市合伙人已有申请列表、详情、状态修改和通过后创建合伙人的服务，但数据库仅支持四种状态，没有版本、补资料记录、幂等命令，也无法原子保证“创建合伙人、创建 owner 成员、更新申请”全部成功。现有 Web Admin 接口不能直接满足移动端验收。

## 方案选择

采用“移动端审核门面 + 复用现有领域能力 + 加固合伙人审核事务”的方案。

- 新增独立的 `/platform/admin/...` 控制器、schema、service 和 repository，返回小程序合同所需的稳定 DTO。
- 装企审核门面调用现有 `TenantOnboardingReviewService`，把 `expected_version`、`remark` 和 `assign_partner_id` 映射到现有领域输入；不复制租户创建逻辑。
- 城市合伙人审核改为数据库原子命令，新增版本、补资料状态、审核记录和幂等结果。现有 Web Admin 路由继续保留并逐步复用新命令，避免破坏既有 Admin。
- 汇总查询和统一日志由新的只读 repository 提供，所有列表显式分页，第一页最近待办最多五条。

未采用纯路由别名方案，因为它无法满足城市合伙人的版本冲突、重复确认和原子创建验收。未采用通用工作流重构，因为会扩大到两个成熟领域之外，超出本次范围。

## 权限模型

控制器统一调用 `getRequiredPlatformSuperAdminContext()`：

- 会话失效沿用 `ADMIN_SESSION_REVOKED` 和 HTTP 401；
- 平台员工但不是超管返回 `PLATFORM_SUPER_ADMIN_REQUIRED` 和 HTTP 403；
- 不依赖租户上下文，`tenant_id` 必须为空；
- 数据访问使用服务端 Supabase admin client，权限边界在 Fastify 服务层校验。

## 接口设计

新增以下接口并保持交接文档字段：

- `GET /platform/admin/review-workbench/summary`
- `GET /platform/admin/tenant-onboarding/applications`
- `GET /platform/admin/tenant-onboarding/applications/:id`
- `GET /platform/admin/tenant-onboarding/applications/:id/business-license/preview-url`
- `POST /platform/admin/tenant-onboarding/applications/:id/approve`
- `POST /platform/admin/tenant-onboarding/applications/:id/reject`
- `POST /platform/admin/tenant-onboarding/applications/:id/request-supplement`
- `GET /platform/admin/partner-applications`
- `GET /platform/admin/partner-applications/:id`
- `POST /platform/admin/partner-applications/:id/approve`
- `POST /platform/admin/partner-applications/:id/reject`
- `POST /platform/admin/partner-applications/:id/request-supplement`
- `GET /platform/admin/review-logs`

列表默认 `page=1&pageSize=20`，最大 50。列表和详情只返回脱敏手机号。营业执照预览继续使用现有短期私有签名 URL，不落库、不写日志内容。

装企通过只创建租户、管理员、角色和服务商资料草稿。`publish_local_service_provider` 第一版只允许 `false` 或省略；传 `true` 返回 422，提示服务商公开资料需走独立发布流程。这样保持现有发布审核边界，不让移动端审批绕过资料完整性检查。

装企 `assign_partner_id` 映射为 `attribution_mode=partner`；未指定时映射为 `auto`。原有归因歧义和主体重复错误继续由原子 RPC 返回，并映射为合同中的 409。

合伙人 `partner_level_code` 在服务层解析为有效等级 ID；`generate_default_invite_code=true` 时由原子命令创建或复用默认邀请码。通过后 owner 成员保持现有 `pending_bind` 状态，允许其按既有手机号登录/绑定流程进入合伙人端。

## 数据库变更

新增一个 migration：

- `platform_partner_applications` 增加 `version integer not null default 1`；
- 状态约束扩展为 `submitted/reviewing/supplement_required/approved/rejected/withdrawn`；
- 新增 `platform_partner_application_reviews`，保存前后状态、动作、必补字段、备注、操作人、幂等键、请求摘要和结果；
- 新增适合待办筛选与时间排序的索引；
- 新增原子审核 RPC，持有申请行锁，先判断幂等回放，再判断版本与状态；
- 通过动作在一个事务内创建合伙人、owner 成员、可选默认邀请码、更新申请并写审核记录；
- 驳回和补资料同样由 RPC 更新状态、递增版本并写审核记录。

同一操作人和同一 `Idempotency-Key` 重试返回首次结果；同一键但请求摘要不同返回幂等冲突。申请已由其他操作处理或版本过期返回明确的数据库状态，再由 service 映射为 `VERSION_CONFLICT` 或 `ALREADY_REVIEWED`。

## 审核日志

装企日志以 `tenant_onboarding_application_reviews` 为权威来源；合伙人日志以新表为权威来源。统一日志接口根据 `target_type` 查询对应表，并批量加载操作人姓名，避免 N+1。

`platform_audit_logs` 继续承担跨模块运营审计，不作为移动审核状态机的唯一事实来源。合伙人审核完成后另写一条 best-effort 平台审计日志，但该日志失败不回滚已经提交的领域事务。

## 错误映射

- 申请不存在：404；
- 版本不一致：409 `VERSION_CONFLICT`；
- 已被终态处理：409 `ALREADY_REVIEWED`；
- 装企主体或管理员手机号冲突：409 `DUPLICATED_SUBJECT`，消息保留具体原因；
- 幂等键缺失、格式错误、补资料字段无效、发布标志不支持：422 `VALIDATION_ERROR`；
- 数据库与外部服务错误继续通过 `error-factory.ts` 包装。

## 验证

- schema 测试覆盖分页上限、动作请求和必填备注；
- route 测试覆盖所有新增路径且不存在 public/scoped 别名；
- service 测试覆盖超管权限、脱敏、字段映射、版本冲突、幂等回放和日志 DTO；
- migration contract 测试覆盖状态约束、索引、行锁、幂等优先级、版本检查和原子创建；
- API 类型检查与构建通过；
- migration 仅通过版本控制文件交付，应用远端前后使用 `supabase migration list` 核对 Local/Remote。

## 回滚

应用代码可以回滚到旧版本，新增列和表保持向后兼容。数据库不立即删除新列/表；如需数据库回滚，新增后续 migration 删除 RPC 和索引，确认没有移动端流量后再删除审核表与 `version` 列，避免破坏已产生的审核证据。
