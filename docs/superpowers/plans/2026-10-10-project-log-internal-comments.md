# 员工内部施工日志评论 Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task.

**Goal:** 恢复公司员工之间、受项目权限限制的施工日志文字评论和回复。

**Architecture:** 保持旧混合评论和图库评论停用，新增明确的内部接口。内部记录独立保存，避免旧客户 RPC、摘要、评分和历史图片通路读到内部内容；沿用 controller/service/repository。服务端微信文本审核，仅 pass 对员工可见，review 隔离保存，失败不写入。图片不恢复，待私有上传与审核回调完整验收后另行开放。

**Tech Stack:** Bun、Fastify、Zod、Supabase migration、微信 msgSecCheck v2；不新增依赖。

## 范围与根因

原开关将公开交流和项目内部管理一起关闭；原项目评论包含客户且没有内部范围。用户已授权执行。默认只恢复员工文字交流，客户、访客、旧接口、旧图片上传与直链转换继续停用。历史数据不自动迁入，不伪造历史审核状态。此实现不代表微信类目复核通过。

## 执行步骤

- [x] 在 `apps/api/src/services/project-log-internal-comments.test.ts`、`wechat-content-safety-gateway.test.ts` 写失败测试：身份不回退、跨租户/项目拒绝、在职员工权限、父评论隔离、审核 pass/risky/review/异常、分页与图片拒绝。
- [x] 新建 `apps/api/src/services/wechat-content-safety-gateway.ts`：固定官方 HTTPS endpoint，复用 access token provider，8 秒超时，严格校验 errcode/result/trace，未知及异常失败关闭，不泄露正文、openid、token。
- [x] 用 `supabase migration new project_log_internal_comments` 生成 migration：独立员工内部表，审核状态 approved/pending，审核 trace/time/hash，tenant/log/parent 关联约束，分页索引，RLS 仅 service_role。未审核历史表不变。
- [x] 新建 `apps/api/src/repositories/project-log-internal-comments.ts`：限定字段，分页 `.range()`，父评论限定同租户同日志且已审核，员工批量作者查询最多 100 条。
- [x] 新建 `apps/api/src/services/project-log-internal-comments.ts`：只认当前员工 token，校验 tenant/employee 声明与实时身份、在职状态和项目权限；POST 校验 project_log.create；使用服务端绑定的 wechat_mini openid；审核后复核写权限再入库。review 保存非公开 pending；risk/unavailable 不保存。无编辑接口。
- [x] 新建 `apps/api/src/schema/project-log-internal-comments.ts`；在现有评论 controller 增加 GET/POST `/project_logs/:logId/internal-comments`，分页默认 1/20 上限 100，禁止图片、rating、客户端指定作者或审核状态。
- [x] 运行 `bun test src/services/project-log-internal-comments.test.ts src/services/wechat-content-safety-gateway.test.ts src/services/comment-communication.test.ts`、API typecheck/build；补充实际 HTTP 和迁移约束验证。不得为了测试访问生产写入。
- [x] 写 `docs/miniprogram/2026-10-10-project-log-internal-comments-handoff.md`：请求响应、权限、不可用/违规/待审核契约、orange 配套说明与验收清单；明确尚未部署/远端迁移/真机验收状态。

## 发布与回滚

先核对并应用该 migration，再部署 API；应用后 `supabase migration list` 对齐。客户端配套由 orange 团队处理。应用回滚保持旧评论全停用，保留新表及审计记录，不删除数据；远端本轮不执行。生产恢复与微信复核需如实提供内部权限证据，不能声称无需类目审核。

## 验证与审查补充

独立审查发现权限缓存撤权延迟；增加 freshPermissions 选项，仅内部评论使用最新上下文。真实暖缓存回归先失败后通过。新增内部表而不是修改旧 audience，防止旧客户 RPC 读取新内容。迁移已在隔离本地 PostgreSQL 执行并检查约束/RLS/索引。生产迁移、部署、微信真实审核与客户端联验不在已完成标记内；详见 handoff 发布清单。
