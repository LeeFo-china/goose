# Projects 权限边界重构闭环摘要

日期：2026-05-19

## 背景

Projects 模块是租户后台项目、客户、员工、项目成员、工地日志、公开案例展示等能力的核心汇合点。本轮整改目标是把项目接口的租户边界、权限判断和 Supabase 访问路径系统化，避免 `ProjectController` 继续承担 HTTP、权限、查询、领域校验和响应组装全部职责。

整改前主要问题：

- `ProjectController` 内直接访问 `projects`、`customers`、`properties`、`employees`、`project_logs`、`project_acceptances`。
- 后台租户接口和公开项目接口混在同一个 controller 内直接查询。
- 项目创建/更新时的关联资源租户校验写在 controller。
- 项目列表、状态列表、今日工作项目范围在 controller 内重复实现。
- 路由仍使用通用 `fullCrudRoutes`，缺少 projects 专项 CRUD 暴露语义。

## 当前结论

Projects 模块第一轮权限边界整改已闭环。

当前 `ProjectController` 中已无以下直连访问：

- `SupabaseDB`
- `SupabaseDB.getAdminClient()`
- `from("projects")`
- `from("customers")`
- `from("properties")`
- `from("employees")`
- `from("project_logs")`
- `from("project_acceptances")`

Controller 当前保留职责：

- 读取 request。
- 执行 Zod 参数校验。
- 调用 service。
- 包装 `ResponseHandler.success()`。
- 保留项目列表、详情、公开项目、成员候选的展示层序列化。

## 已拆分的 Service / Repository

### projects

文件：

- `apps/api/src/services/projects.ts`
- `apps/api/src/repositories/projects.ts`

职责：

- 后台项目列表。
- 后台项目状态列表。
- 后台项目详情。
- 创建项目。
- 更新项目。
- 删除项目。
- 今日工作项目范围。
- 项目关联客户、房产、设计师、工程负责人租户归属校验。
- 公开项目列表。
- 公开项目详情。
- 公开项目日志。
- 项目创建客户候选。
- 项目创建员工候选。
- 项目成员候选。

边界：

- 后台项目主查询和写入强制 `projects.tenant_id = authContext.tenantId`。
- 后台项目读写统一使用 `project.read / project.create / project.update / project.delete`。
- 项目列表可见性统一通过 `accessPolicyService.getVisibleProjectIdsByOwnership()`。
- 项目详情、更新、删除、成员候选统一通过 `accessPolicyService.canAccessProject()`。
- 公开项目接口不要求后台登录态，但只返回公开字段，并统一使用公开可见性规则。
- 创建/更新项目时，客户、房产、设计师、工程负责人必须属于当前租户。

## Phase 汇总

| Phase | 主要内容 |
| --- | --- |
| Phase 1 | 明确 projects 独立 CRUD 路由配置，收紧可空租户 ID 口径。 |
| Phase 2 | 后台项目主 CRUD 下沉到 service / repository。 |
| Phase 3 | 项目成员详情接口复用项目详情 service，删除成员接口里的项目主表直连。 |
| Phase 4 | 公开项目展示接口下沉到 service / repository。 |
| Phase 5 | 项目创建客户/员工候选和成员候选查询下沉到 service / repository。 |

## 验收命令

本轮闭环验收执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
git diff --check
rg -n "SupabaseDB|getAdminClient|from\\(\"|from\\(this" apps/api/src/controllers/projects/index.ts
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- diff 空白检查通过。
- Project controller Supabase 直连扫描无结果。

## Admin / 小程序对接

本轮不需要 admin 或微信小程序改代码。

原因：

- 未改变接口路径。
- 未主动改变请求参数。
- 未主动改变响应结构。
- 改动集中在后端 controller/service/repository 分层和权限边界。

建议前端只做回归验证：

- 项目列表。
- 项目状态列表。
- 项目详情。
- 新建项目。
- 编辑项目。
- 删除项目。
- 项目成员列表。
- 新建项目客户选择。
- 新建项目设计师/工程负责人选择。
- 项目成员候选选择。
- 公开项目列表。
- 公开项目详情。
- 公开项目日志。

## 后续建议

下一组更有价值的整改对象：

1. `project-logs`：项目日志与员工、客户评论、图片、公开分享链路关系紧密。
2. `project-log-comments`：客户/员工评论入口混合，适合继续梳理身份边界。
3. `project-acceptances`：验收流程涉及员工、客户、业主疑问、整改回复，需要延续项目边界模型。

推荐下一步先做 `project-logs`，因为它是项目进度、客户评论、图片上传和公开案例日志的核心入口。
