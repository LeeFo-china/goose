# 超管直接变更租户管理员登录手机号验收

日期：2026-10-08。用户明确修订规则：超管变更不需要旧号或新号验证码。

## 当前行为

租户详情 → 管理员 → 变更登录手机号，填写新号、原因并确认管理员本人未变更后提交。新鲜有效的平台超管会话才可执行。正常登录验证码规则不变。

确认请求仅含 new_phone、expected_version、reason、same_person_confirmed、idempotency_key。旧 send-code 返回 410，提示刷新页面；直接换号不读取/创建短信或挑战，不依赖短信供应商。历史短信和审计保留。

新增 migration `20261008031744_tenant_admin_phone_direct_change.sql`：独立直接换号事务复用超管校验、目标锁与号码锁；号码、保护记录、两项版本及审计原子提交。审计标记 authorization_method=platform_superadmin。员工、用户、角色、微信及历史归属不变。失败回退采用关闭入口或前向修复，不恢复旧号、不降低凭证版本。

## 本地证据

- API 路由/service/repository：20 pass，涵盖无验证码提交、超管权限、严格字段、号码冲突及退休发送接口；旧实现针对新契约红灯后修正转绿。
- UI 状态机：12 pass；未知结果复用原请求、409 刷新后重新确认、提交期间锁定。
- API 类型检查、构建、500 行限制通过；Admin 静态检查和生产构建通过。
- 隔离 PostgreSQL 直接换号 smoke：25/25；service_role 成功、有效 ACL、无 SMS/challenge、身份保留、幂等/冲突、状态权限、双 SQL 连接竞争同号、审计唯一约束失败完整回滚。每例 fixture 清理验证通过。缺失 RPC 红灯后仅在本地试验库应用新 migration，再通过全部用例。
- 真实 Fastify + PostgREST + 隔离数据库：无验证码换号、旧号登录拒绝、旧 admin_web 业务请求 401、裸认证令牌拒绝、新号正常验证登录并访问业务、原微信员工和独立客户身份均通过。此验证无真实短信发送。
- 本地试验库不作为迁移账本对齐证据：其历史手工试验缺少部分账本；生产发布单独核对完整 Local/Remote。
- 独立审查未发现本次新增阻断问题。

浏览器 7/7 通过，覆盖直接变更且零发送请求、权限、必填/移动端、重复提交、未知结果重试、409 刷新和列表恢复。生产发布回执见下文。生产验收仅只读和无效请求，不改真实租户手机号。


## 生产发布

- 发布标签 `v2026.10.08.4`，运行源码 `9a43474c7d3c52528e2ef6ef693ec0e52b19423b`。
- [迁移预检 37722814276](https://github.com/LeeFo-china/goose/actions/runs/37722814276)：652 项历史一致，仅待 `20261008031744`。
- [迁移应用 37723028669](https://github.com/LeeFo-china/goose/actions/runs/37723028669)：仅应用上述一项，653 项，latest `20261008031744`。
- 已通过 `supabase migration list` 及 `scripts/verify-migration-history.mjs` 核对 Local/Remote 全部对齐。生产只读 ACL 检查：直接 RPC 存在，anon/authenticated 无执行权，service_role 有执行权。
- [API/Admin 候选构建 37722812581](https://github.com/LeeFo-china/goose/actions/runs/37722812581)：成功，已核对候选 SHA、标签及 api/admin 服务范围。
- [生产部署 37723747016](https://github.com/LeeFo-china/goose/actions/runs/37723747016)：success；API/Admin 运行 revision 均为上述源码，容器均 healthy，工作流公开入口检查通过。
- API 镜像 `sha256:af524cf589dc9e7b2fe8738e5f40fd8d2e7c57675c8848efded2610e094d6cf2`；Admin 镜像 `sha256:b501a1b30ee9823d13fc990960375fb1152c70160cf386b6a801b73da261577c`。
- 生产只读 API 验收通过：管理员列表 200、分页上限 400、仅返回脱敏号码、旧 send-code 410、无效 confirm 400、裸认证令牌 401。未发送短信，未修改任何真实手机号。成功写入及后续登录闭环在隔离数据库验证。
- 发布回执 artifact：`production-deployment-receipt-37722812581`。本地临时 PostgREST 容器已停止移除，试验数据库恢复停止状态，隔离 worktree 已合入并清理。
