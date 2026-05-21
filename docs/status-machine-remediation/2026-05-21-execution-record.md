# 状态机整改执行记录

## 2026-05-21 阶段 0 启动

已完成：

- 新建 `docs/status-machine-remediation` 目录。
- 建立整改总台账。
- 盘点当前客户状态和项目状态。
- 起草项目状态动作表。
- 起草客户状态动作表。
- 起草分阶段验收测试方案。

当前阶段：

- 阶段 0：状态盘点和规则冻结。

下一步：

- 确认阶段 0 中的待业务确认问题。
- 业务规则确认后，进入阶段 1：项目状态机最小闭环。

## 2026-05-21 阶段 1 项目状态机最小闭环

已完成：

- 在 `packages/domain/src/project.ts` 增加项目状态动作、动作配置、流转解析、旧 status 目标推断和可执行动作枚举能力。
- 增加 `ProjectStatusTransitionSchema`，状态变更请求改为动作驱动。
- 新增 `project_status_transition_logs` migration，用于记录项目状态流转日志。
- 新增 `projectStatusTransitionRepository`，负责写入和查询项目状态流转日志。
- 新增 `projectStatusService.transitionProjectStatus()`，集中处理状态动作校验、签约金额校验、暂停恢复上下文和日志写入。
- 新增 `POST /projects/:id/status-transition`。
- 改造 `PATCH /projects/:id`：如果 payload 包含 `status`，会根据当前状态和目标状态推断动作并走状态机；不包含 `status` 时保持原有更新行为。
- 状态变更后清理公开项目列表、公开详情、日志、成员缓存。

当前规则：

- `invalid` 是终态，默认不允许恢复。
- `completed` 默认不允许回到施工，售后走 `start_after_sale`。
- `pause_project` 和 `mark_invalid` 必须传 `reason`。
- `resume_project` 会读取最近一次 `pause_project` 日志里的 `paused_from_status`。
- `sign_contract` 必须提供有效 `signed_amount`。

待后续阶段处理：

- 项目状态对施工日志、摄像头、验收、售后日志的写操作拦截。
- 项目签约和客户 `contracted` 状态的联动。
- 状态流转日志列表接口和 Admin 展示。

阶段 1 验证命令：

```bash
bun run api:typecheck
cd packages/domain && bun run build
bun run api:build
bun run check:permission-boundaries
git diff --check
```
