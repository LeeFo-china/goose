# Project Log Comments 权限边界核查

日期：2026-05-19

## 核查范围

- `apps/api/src/controllers/project-log-comments/index.ts`
- `apps/api/src/schema/project-log-comments.ts`

## 接口口径

`project-log-comments` 是混合入口：

- 员工在租户后台或员工端回复施工日志评论。
- 客户在小程序端查看施工日志评论、发表疑问、上传整改图片或评分。

因此不能整体强制使用租户员工上下文，否则会拦截客户评论链路。

本次核查接口：

- `POST /project_log_comments`
- `GET /project_log_comments`

## 已有边界

- 评论写入的 `tenant_id` 来自施工日志，不来自前端。
- 父评论必须属于同一日志。
- 客户评分只允许顶层评论，员工不允许评分，回复不允许评分。
- 客户只能访问自己项目下的施工日志评论。
- 员工访问日志评论时需要拥有目标项目 `project.read` 权限。
- 评论图片返回前统一走存储 URL 解析。

## 本次调整

- controller 从 `BaseController` 迁移到 `TenantBaseController`。
- 删除 controller 内重复的 `authorizationService` 依赖。
- 客户评论链路保持客户身份和项目归属校验，不要求员工租户上下文。
- 员工评论链路在访问项目日志时使用 `getRequiredTenantContext()`。
- 员工评论链路增加当前员工租户必须等于日志 `tenant_id` 的显式校验。

## 后续注意

- 该 controller 是混合入口，后续不能简单套用“所有接口都 `getRequiredTenantContext()`”的规则。
- 后续如要进一步整理，建议拆成两个 service：
  - 员工评论 service：使用租户 AuthContext 和项目权限。
  - 客户评论 service：使用 customer identity 和项目归属。
- 小程序端无需因本次调整改代码。

## 验收

- `bun run api:typecheck` 通过。
- `bun run check:permission-boundaries` 通过。
- `git diff --check` 通过。
