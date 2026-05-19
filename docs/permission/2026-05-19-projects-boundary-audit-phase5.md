# Projects 权限边界核查 Phase 5

日期：2026-05-19

## 本阶段目标

迁移项目创建和项目成员候选查询，使 `ProjectController` 不再直接访问 Supabase。

覆盖接口：

- `GET /projects/create/customers`
- `GET /projects/create/employees`
- `GET /projects/:id/member-candidates`

## 已落地文件

- `apps/api/src/controllers/projects/index.ts`
- `apps/api/src/services/projects.ts`
- `apps/api/src/repositories/projects.ts`
- `docs/permission/2026-05-19-projects-boundary-audit-phase5.md`

## 当前职责划分

### Controller

保留职责：

- 参数校验。
- 调用 `projectSer`。
- 候选客户、候选员工响应字段组装。

### Service

`projectSer` 新增：

- `listProjectCreateCustomers()`
- `listProjectCreateEmployees()`
- `listProjectMemberCandidates()`

职责：

- 创建项目候选要求 `project.create`。
- 成员候选要求当前账号对项目有 `project.update` 权限。
- 统一断言租户上下文。
- 统一生成分页结构。

### Repository

`projectRepository` 新增：

- `listCreateCustomers()`
- `listCreateEmployees()`

职责：

- 查询当前租户客户候选。
- 查询当前租户 active 员工候选。
- 关键词查询统一转义，避免 Supabase OR 查询特殊字符干扰。

## 当前结论

`ProjectController` 已无 Supabase 直连：

- 项目后台主 CRUD 已下沉。
- 项目成员详情已复用详情 service。
- 公开项目展示已下沉。
- 创建/成员候选查询已下沉。

## 验收

已执行：

```bash
bun run api:typecheck
bun run check:permission-boundaries
rg -n "SupabaseDB\\.getAdminClient\\(\\)|from\\(this\\.tableName\\)|from\\(\"projects\"\\)|from\\(\"customers\"\\)|from\\(\"employees\"\\)|queryProjectCreateEmployees" apps/api/src/controllers/projects/index.ts
```

验收结果：

- TypeScript 类型检查通过。
- 权限边界检查通过。
- Project controller Supabase 直连扫描无结果。

## Admin / 小程序对接

本阶段不需要 admin 或微信小程序改代码。

原因：

- 不改变接口路径。
- 不改变请求参数。
- 不改变响应结构。
- 只调整后端分层和租户边界实现。

建议前端回归验证：

- 新建项目客户选择。
- 新建项目设计师/工程负责人选择。
- 项目成员候选选择。
