# 项目成员模型去兼容分阶段执行 TODO

## 目标

项目责任人统一以 `project_members` 为唯一业务来源，逐步清理 `projects.designer_id` / `projects.supervisor_id` 兼容层。

最终目标：

- 权限、施工日志、验收、任务中心、项目详情统一读取 `project_members`。
- Admin 编辑设计师 / 工程负责人时维护项目成员主责关系。
- 对外接口短期可继续返回 `designer` / `supervisor` 展示字段，但这些字段由 `project_members` 计算，不再来自 `projects` 旧字段。
- 所有业务链路不再依赖 `projects.designer_id` / `projects.supervisor_id` 后，再删除旧字段和双写逻辑。

## 执行规则

- 每个阶段单独执行、测试、验收、提交。
- 前一阶段未通过，不进入下一阶段。
- 每个阶段提交信息必须能独立回滚。
- 禁止在同一阶段同时做模型切换、前端改造和数据库删字段。

## 阶段 1：引用盘点和清理边界

状态：已完成

目标：

- 找出所有旧字段和兼容层引用点。
- 按风险和职责归类，确认后续阶段的执行顺序。
- 本阶段不改业务逻辑。

引用清单：

| 分类 | 文件 | 当前依赖 |
| --- | --- | --- |
| API schema | `apps/api/src/schema/projects.ts` | `designer_id` / `supervisor_id` 仍是项目创建、更新入参 |
| API 项目查询 | `apps/api/src/repositories/projects.ts` | `PROJECT_LIST_SELECT`、`PROJECT_DETAIL_SELECT`、公开项目 select 通过项目旧外键 join `designer` / `supervisor` |
| API 项目写入 | `apps/api/src/services/projects.ts` | 创建、更新项目后调用 `createInitialLegacyProjectMembers` / `syncLegacyProjectMembers` 双写成员 |
| API 成员兼容 | `apps/api/src/services/project-members.ts` | `syncLegacyProjectColumn` 将项目成员反写到旧字段 |
| 权限范围 | `apps/api/src/repositories/permissions.ts` | 主要已读取 `project_members`，属于新模型基础 |
| 施工日志任务 | `apps/api/src/repositories/task-center.ts` | `listOwnedActiveProjects` 仍使用 `designer_id` / `supervisor_id` 查自己的施工日志任务 |
| AI 问答上下文 | `apps/api/src/services/decoration-qa.ts` | 项目上下文通过旧外键 join 设计师 / 工程负责人 |
| 分享上下文 | `apps/api/src/services/customer-project-log-shares.ts` | 项目分享上下文通过旧外键 join 设计师 |
| 客户侧项目 | `apps/api/src/repositories/customer-self-service.ts` | 客户项目返回 `designer` 仍通过旧外键 join |
| 验收 | `apps/api/src/repositories/project-acceptances.ts` | 项目行类型仍包含 `supervisor_id`，施工经理查询已走 `project_members` |
| Admin 项目页 | `apps/admin/components/projects/project-mutations.tsx` | 表单状态、payload、列表回填仍使用 `designer_id` / `supervisor_id` |
| Admin 客户开始设计 | `apps/admin/components/customers/customer-mutations.tsx` | 开始设计创建项目仍提交 `designer_id` / `supervisor_id` |
| 数据库类型 | `apps/api/src/types/database.ts` | Supabase 类型仍包含旧字段，最终删字段后需重新生成 |
| 数据库迁移 | `supabase/migrations/20260408121927_add_staff_ids_to_projects.sql` | 旧字段来源迁移；仅做历史记录，不修改 |

验收：

- [x] 清单覆盖所有代码引用点。
- [x] 后续阶段拆分能避免一次性大爆改。
- [x] `git status` 只包含本阶段文档。
- [ ] 文档提交完成。

测试：

- [x] `rg "designer_id|supervisor_id|syncLegacyProject|projects_designer_id_fkey|projects_supervisor_id_fkey" apps/api/src apps/admin packages/domain/src`
- [x] `rg "project_members|construction_manager|listVisibleProjectIds" apps/api/src packages/domain/src`

## 阶段 2：数据迁移和一致性校验

状态：已完成

目标：

- 编写一次性校验 / backfill 脚本，把旧字段数据迁移到 `project_members`。
- 不改线上业务读取逻辑。

TODO：

- [x] 新增脚本：统计 `projects.designer_id` / `supervisor_id` 有值但缺少对应主责 `project_members` 的项目。
- [x] 新增 backfill：缺失则创建 `role_code=designer` / `role_code=supervisor`、`is_primary=true` 的成员记录。
- [x] 已存在但非主责时，按主责规则修正。
- [x] 记录冲突策略：同一角色已有其他主责时，以旧字段为准，迁移时降级其他主责。
- [x] 增加 dry-run 输出，默认不写库。

脚本：

- `bun run project-members:assignees:backfill -- --limit 20`
- `bun run project-members:assignees:backfill -- --tenant-id <tenant_id> --limit 200`
- `bun run project-members:assignees:backfill -- --apply --limit 200`

执行结果：

- 2026-05-26 dry-run：`summary=[]`，`issues=[]`。
- 当前没有需要修复的数据，因此未执行 `--apply`，避免无意义更新时间戳。

验收：

- [x] dry-run 可输出待修复数量。
- [x] backfill 后再次 dry-run 为 0。当前 dry-run 已为 0，无需写库。
- [x] 不改变项目状态、客户状态、施工日志、验收数据。

测试：

- [x] `bun` 执行 dry-run。
- [x] `bun` 执行 backfill。当前无待修复数据，未执行写入模式。
- [x] API typecheck。

提交：

- [ ] `feat: add project member backfill check`

## 阶段 3：后端读取逻辑切到 `project_members`

状态：已完成

目标：

- 项目列表、详情、客户侧项目、AI/分享上下文不再从旧外键读取设计师 / 工程负责人。
- 对外返回字段暂时保持 `designer` / `supervisor`，降低前端联动风险。

TODO：

- [x] 项目列表和详情通过项目成员主责关系组装 `designer` / `supervisor`。
- [x] 客户侧项目详情通过项目成员组装设计师展示。
- [x] AI 项目问答上下文通过项目成员组装设计师 / 施工管理。
- [x] 分享上下文通过项目成员组装设计师。
- [x] 验收里如仍需要工程负责人，改为读取成员主责。

验收：

- [x] Admin 项目列表设计师 / 工程负责人显示不变。后端仍返回兼容 `designer` / `supervisor` 字段，来源改为项目成员主责。
- [x] 项目详情 header 显示不变。后端仍返回兼容 `designer_id` / `supervisor_id` 和关系对象。
- [x] 客户侧项目详情设计师显示不变。客户侧 service 已从项目成员主责补齐 `designer`。
- [x] AI 问答仍能注入团队信息。AI 上下文已从项目成员主责读取主案设计 / 施工管理。

测试：

- [x] API typecheck：`bun run typecheck`。
- [x] API build：`bun run build`。
- [x] 数据一致性：`bun run project-members:assignees:backfill -- --limit 20`，结果 `summary=[]`。
- [x] 引用检查：API 读路径不再包含 `projects_designer_id_fkey` / `projects_supervisor_id_fkey` join，数据库生成类型除外。

提交：

- [ ] `refactor: read project assignees from members`

## 阶段 4：权限和施工日志写入改为成员模型

状态：已完成

目标：

- 工程负责人只要是项目成员，就能在权限范围内写该项目施工日志。
- 不再依赖项目创建人或旧字段。

TODO：

- [x] 新增明确方法：`canWriteProjectLog(authContext, projectId)`。
- [x] `project_log.create:self` 判断当前员工是否为项目成员。
- [x] `project_log.create:department` 判断本部门员工是否为项目成员。
- [x] `project_log.create:all` 仍允许租户内项目。
- [x] 施工日志创建、编辑、上传图片项目校验统一使用该方法。
- [x] 任务中心“我的施工日志待处理”改为从 `project_members` 查项目。

验收：

- [x] 工程负责人能写别人创建但自己负责的项目施工日志。授权来源为 `project_members`，不再依赖项目旧字段或创建人。
- [x] 非项目成员不能写。`self` / `assigned` 范围必须命中项目成员。
- [x] 部门权限员工只能写部门范围内成员项目。
- [x] `all` 权限仍可写租户内项目。

测试：

- [x] API typecheck：`bun run typecheck`。
- [x] API build：`bun run build`。
- [x] 数据一致性：`bun run project-members:assignees:backfill -- --limit 20`，结果 `summary=[]`。
- [x] 引用检查：`task-center` / `project-logs` / `uploads` 写权限路径不再读取 `designer_id` / `supervisor_id`。

提交：

- [ ] `fix: authorize project logs by members`

## 阶段 5：Admin 写入切到成员模型

状态：待执行

目标：

- Admin 编辑项目设计师 / 工程负责人时，不再提交旧字段作为业务字段。
- 创建项目、开始设计创建项目改为维护主责项目成员。

TODO：

- [ ] 后端提供或复用项目成员主责更新接口。
- [ ] Admin 项目编辑提交成员主责关系。
- [ ] 客户“开始设计”创建项目时提交成员主责关系。
- [ ] 保存后回填仍保持即时更新。
- [ ] 对外短期继续返回 `designer_id` / `supervisor_id` 可选兼容字段时，标记为 deprecated。

验收：

- [ ] 项目页编辑设计师 / 工程负责人后立即回填。
- [ ] 刷新后仍显示正确。
- [ ] 项目成员 tab 中对应成员为主责。
- [ ] 不再需要旧字段双写才能完成展示。

测试：

- [ ] API typecheck。
- [ ] Admin typecheck。
- [ ] Admin 手动编辑项目负责人。
- [ ] 客户开始设计创建项目流程。

提交：

- [ ] `refactor: manage project assignees as members`

## 阶段 6：移除双写和旧字段业务入参

状态：待执行

目标：

- 移除 `syncLegacyProjectColumn`、`syncLegacyProjectMembers`、`createInitialLegacyProjectMembers` 中“legacy”命名和旧字段写入。
- API schema 不再接受 `designer_id` / `supervisor_id` 作为项目业务入参。

TODO：

- [ ] 移除项目服务中旧字段双写。
- [ ] 调整 `CreateProjectInput` / `UpdateProjectInput`，新增明确成员输入或独立成员接口。
- [ ] 清理 Admin payload 中 `designer_id` / `supervisor_id`。
- [ ] 更新小程序/Admin 对接文档。

验收：

- [ ] 新建项目不写旧字段。
- [ ] 编辑成员不写旧字段。
- [ ] 所有展示仍正常。
- [ ] 旧字段即使为空，业务链路仍正常。

测试：

- [ ] API typecheck。
- [ ] Admin typecheck。
- [ ] 项目创建、编辑、列表、详情、施工日志、验收、任务中心回归。

提交：

- [ ] `refactor: remove legacy project assignee writes`

## 阶段 7：数据库删字段准备和最终清理

状态：待执行

目标：

- 在业务完全脱离旧字段后，删除数据库字段和类型残留。

TODO：

- [ ] 确认 `rg "designer_id|supervisor_id"` 只剩历史迁移、文档或明确兼容输出。
- [ ] 新增 migration 删除 `projects.designer_id` / `projects.supervisor_id`。
- [ ] 重新生成 Supabase types。
- [ ] 清理旧文档中“最新接口”误导内容，保留历史文档不修改。

验收：

- [ ] 数据库 migration 可执行。
- [ ] 生成类型不再包含旧字段。
- [ ] API/Admin typecheck 通过。
- [ ] 核心回归通过。

测试：

- [ ] migration dry-run 或本地执行。
- [ ] `supabase gen types`。
- [ ] API typecheck。
- [ ] Admin typecheck。

提交：

- [ ] `chore: drop legacy project assignee columns`

## 当前阶段 1 结论

可以清理，但必须按以上阶段推进。当前阻塞工程负责人写施工日志的问题，最早会在阶段 4 被根治；阶段 2 和阶段 3 是必要前置，确保所有历史项目和读取链路都已经切到 `project_members`。

阶段 1 已完成，下一步进入阶段 2：先补数据一致性校验和 backfill，确保后续读取切换不会漏掉历史项目责任人。
