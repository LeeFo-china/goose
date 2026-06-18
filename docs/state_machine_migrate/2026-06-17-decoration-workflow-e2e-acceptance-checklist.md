# 装修 workflow 端到端验收清单

日期：2026-06-17

关联文档：

- `docs/state_machine_migrate/2026-06-17-decoration-workflow-business-spec.md`
- `docs/state_machine_migrate/miniprogram-integration.md`
- `docs/state_machine_migrate/miniprogram-payment-collection-node-integration.md`
- `docs/state_machine_migrate/miniprogram-procedure-construction-log-integration.md`
- `docs/state_machine_migrate/miniprogram-procedure-stage-acceptance-integration.md`
- `docs/state_machine_migrate/2026-06-18-decoration-workflow-miniprogram-e2e-handoff.md`
- `docs/state_machine_migrate/2026-06-17-decoration-workflow-legacy-apply-checklist.md`

## 使用边界

本清单用于 PRD 对接后的真实联调验收记录。gooes 仓库负责 API、Admin、文档和
可执行脚本；orange 小程序仓库由小程序团队执行改造和 smoke，本仓库只记录接口
契约与验收结果，不修改 orange 文件。

验收前提：

1. API 和 Admin 使用同一套 `.env.local` 指向目标环境。
2. 小程序版本已接入 `workflow_state.actions` 和 `/workflow-tasks`。
3. 旧实例写入处置如需执行，必须先按旧实例处置确认清单取得业务确认。
4. 验收过程不得手工改远端数据库状态。

## 环境记录

| 项 | 值 |
| --- | --- |
| API 环境 | 待填写 |
| Admin 环境 | 待填写 |
| 小程序版本 / commit | 收款 workflow smoke 由 orange 团队按当前小程序侧实现完成；commit 未在 gooes 侧回填 |
| 验收租户 | `3eebca47-961f-4899-b976-a3d3208d326b` |
| 验收账号 | 财务账号 `18800005001` / 小龙女 / `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` |
| 验收时间 | 2026-06-18 |
| 验收人 | orange 小程序团队；gooes 后端只读复核 |

## 基础检查

| 检查项 | 期望 | 结果 |
| --- | --- | --- |
| API health / 登录 | 员工账号可登录，接口返回租户上下文 | 待填写 |
| Admin 登录 | 能进入 workflow 模板和项目/客户详情 | 待填写 |
| 小程序登录 | 财务、业务员、施工人员账号均能进入对应待办 | 待填写 |
| 任务列表分页 | `/workflow-tasks?page=1&pageSize=20&status=pending` 正常返回 | 待填写 |
| actions 来源 | 页面按钮只来自 `workflow_state.actions` 或 `/workflow-tasks` | 待填写 |

## 客户设计 workflow 验收

目标主线：

```text
开始 -> 客户线索 -> 跟进 -> 到店 -> 设计 -> 结束
```

验收路径：

1. Admin 或小程序创建客户线索。
2. 经理把客户分配给业务员。
3. 业务员在小程序客户详情写跟进记录。
4. 小程序刷新客户详情，读取 `workflow_state.actions`。
5. 业务员通过 `/workflow-tasks/:taskId/complete` 推进到下一节点。
6. 继续推进到 `designing` 后结束客户设计 workflow。

验收点：

| 检查项 | 期望 | 结果 |
| --- | --- | --- |
| 分配后待办 | 业务员任务中心出现客户 workflow pending task | 待填写 |
| 写跟进记录 | 跟进记录保存后客户详情可见 | 待填写 |
| actions 存在 | 客户详情 `workflow_state.actions[]` 有当前节点动作 | 待填写 |
| 按 task complete 推进 | 不再使用旧状态按钮或本地推导动作 | 待填写 |
| 客户设计结束 | 客户 workflow 不进入项目签约节点 | 待填写 |

证据记录：

- 客户 ID：待填写
- workflow instance ID：待填写
- task ID：待填写
- 截图 / 日志：待填写

## 项目签约 workflow 验收

目标主线：

```text
开始 -> 设计中 -> 方案确认 -> 项目签约 -> 设计定稿 -> 排期开工 -> 结束
```

可插入门禁：

- `deposit`：方案确认之后，项目签约之前。
- `stage_1`：项目签约之后、排期开工之前。

验收路径：

1. 从客户设计阶段创建设计项目。
2. 确认新项目进入 `project_signing`，当前节点为 `designing`。
3. 完成 `designing`。
4. 在 `proposal_confirmed` 节点提交 `signed_amount`。
5. 如模板含 `deposit` 收款门禁，财务账号处理收定金。
6. 完成 `signed`。
7. 在 `design_finalized` 节点提交 `start_date` 和
   `construction_manager_employee_id`。
8. 完成 `pending_start`，确认启动 `construction_main`。

验收点：

| 检查项 | 期望 | 结果 |
| --- | --- | --- |
| 新项目 workflow | 新设计项目进入 `project_signing`，不是旧 `construction_main` | 待填写 |
| 签约金额兜底 | 缺 `signed_amount` 时 complete 被后端拒绝 | 待填写 |
| 财务门禁 | 未确认收款不能越过 `payment_collection` | 待填写 |
| 排期开工必填 | 缺 `start_date` 或工程负责人时 complete 被后端拒绝 | 待填写 |
| 启动施工 workflow | 签约流程结束后出现 `construction_main` running 实例 | 待填写 |

证据记录：

- 项目 ID：待填写
- `project_signing` instance ID：待填写
- 收款 task ID：待填写
- 施工 workflow instance ID：待填写
- 截图 / 日志：待填写

## 财务收款节点验收

验收路径：

1. 财务账号进入任务中心。
2. 找到 `payment_collection` 待办。
3. 进入项目详情，展示收款确认表单。
4. 输入金额、收款时间、凭证和备注。
5. 调用 `/workflow-tasks/:taskId/complete`。
6. 刷新项目详情、任务中心、Admin 财务台账。

验收点：

| 检查项 | 期望 | 结果 |
| --- | --- | --- |
| action 识别 | `business_domain = payment_collection` 或 `output_fields.type = payment_collection` | 通过：小程序按 `/workflow-tasks?status=pending` 识别 `project_payment/payment_collection` 待办 |
| 凭证上传 | 上传带 `projectId`，direct-init 带 `scene=project_payment` 和 `project_id` | 通过：direct upload 携带 `scene=project_payment` 和 `project_id` |
| 后端入账 | complete 创建 confirmed payment 和 ledger | 通过：生成 confirmed payment 和 `project_payment` 入账流水 |
| 入账幂等 | 重试同一 task 不重复创建 payment/ledger；已有 confirmed payment 缺 source 时 ledger 使用 `payment/payment.id` | 未在本次 orange smoke 覆盖；已有后端自动化覆盖 |
| workflow 推进 | 收款 task 消失，流程进入下一节点 | 通过：`payment_stage_2` 推进到 `procedure_tiling` |
| Admin 可见 | Admin 财务台账出现对应 project_payment 入账流水 | 通过：后端只读核验 ledger 已生成；本次未补 UI 截图 |

证据记录：

- 项目 ID：`d382cd45-9141-476e-a7a5-5bf88d0a3255`
- payment ID：`5859aec7-a8a8-474b-83d8-ba420bf1555d`
- ledger ID：`aeaa8344-b5aa-4494-868d-1268520ae58f`
- task ID：`03f6bce9-8d48-4753-8c15-dd36e8aa65a9`
- 凭证 object key：`tenants/3eebca47-961f-4899-b976-a3d3208d326b/project-payment/projects/d382cd45-9141-476e-a7a5-5bf88d0a3255/2026/06/18/3fb915cf-13d5-4ef2-928d-3806c9d3fa6c.jpg`
- orange 回填文档：`/Users/leefo/Public/work/orange/docs/2026-06-18-decoration-finance-payment-workflow-smoke-handoff.md`
- gooes 后端回传文档：`docs/decoration-finance/2026-06-18-payment-workflow-smoke-backend-handoff.md`

## 施工工序与日志验收

验收路径：

1. 施工人员进入任务中心或项目详情。
2. 当前节点为 `procedure`，action 返回 `project_log` 输出字段。
3. 小程序先创建施工日志，上传至少 `min_image_count` 张图片。
4. 使用 `project_log_id` 和 `image_count` 完成 workflow task。
5. 刷新项目详情和施工阶段。

验收点：

| 检查项 | 期望 | 结果 |
| --- | --- | --- |
| 工序 action | `node_type = procedure`，存在 `project_log` output field | 待填写 |
| 日志接口 | 创建日志使用 `/project-logs`，不调用旧 snake_case 路径 | 待填写 |
| 图片门禁 | 图片不足时后端返回 `WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED` | 待填写 |
| complete output | 包含 `project_log_id` 和 `image_count` 或 `images` | 待填写 |
| workflow 推进 | 工序 task 消失，当前节点进入下一主状态或门禁 | 待填写 |

证据记录：

- 项目 ID：待填写
- 工序 node_key：待填写
- project_log ID：待填写
- task ID：待填写
- 图片数量：待填写

## 阶段验收联动验收

验收路径：

1. 工序 task complete 成功后刷新项目详情或施工阶段接口。
2. 从 `construction_stages.stages[].acceptance_action` 读取验收入口。
3. 小程序展示“发起验收”或进入已有验收单。
4. 创建并提交阶段验收。
5. 主管复核。
6. 客户确认。

验收点：

| 检查项 | 期望 | 结果 |
| --- | --- | --- |
| 不本地推断 | 小程序不在 complete 成功后直接构造验收单 | 待填写 |
| 刷新后入口 | 以后端返回的 `acceptance_action` 决定按钮 | 待填写 |
| 不重复创建 | 已有验收单时进入已有 `acceptance_id` | 待填写 |
| 验收状态 | 复核、客户确认后阶段状态正确刷新 | 待填写 |
| 竣工门禁 | 未完成必需工序时不能进入竣工验收 | 待填写 |

证据记录：

- project_acceptance ID：待填写
- stage_code：待填写
- acceptance_action：待填写
- 截图 / 日志：待填写

## Admin 验收

| 检查项 | 期望 | 结果 |
| --- | --- | --- |
| 客户设计模板 | 节点库不展示财务、施工、暂停、作废主线节点 | 待填写 |
| 项目签约模板 | 可插入 `payment_collection`，不展示施工工序 | 待填写 |
| 施工模板 | 可插入财务门禁，主工序顺序不能破坏 | 待填写 |
| 发布校验 | 跨轨道节点、非法 payment_type、暂停/作废主线发布失败 | 待填写 |
| 项目详情 | workflow state、任务、财务台账与小程序操作后状态一致 | 待填写 |

本地自动化预验收记录，不替代真实联调：

| 检查项 | 本地证据 | 结论 |
| --- | --- | --- |
| 节点库轨道过滤 | `apps/admin/components/workflows/workflow-business-track.test.ts` 覆盖客户设计、项目签约、施工三条轨道的可选能力、业务类型和财务类型 | 已覆盖 |
| Admin 发布前轨道校验 | `apps/admin/components/workflows/workflow-business-track-validation.test.ts` 覆盖模板派生 key、异常动作主线拦截、施工工序主状态重复 | 已覆盖 |
| API 发布轨道校验 | `apps/api/src/services/workflow-business-track-validation.test.ts` 覆盖同一套服务端发布校验边界 | 已覆盖 |
| task complete 当前节点 guard | `apps/api/src/services/workflow-tasks.test.ts` 覆盖 stale pending task 在进入业务 bridge 前返回 `WORKFLOW_NODE_NOT_CURRENT` | 已覆盖 |
| 小程序任务中心 workflow 契约 | `apps/api/src/scripts/phase5-workflow-smoke.test.ts` 覆盖 `/task-center/todos` 中 `workflow_task:*` 待办必须保留 `action_label`、`workflow_actions` 和 workflow task 元数据 | 已覆盖 |
| 项目详情收款入口边界 | `apps/admin/components/projects/project-status-action-dialog.test.ts` 和 `project-workflow-payment-gate.test.ts` 覆盖项目状态弹窗不录入金额或凭证，只校验已确认入账 | 已覆盖 |

## 失败处理

| 失败 | 处理 |
| --- | --- |
| complete 返回 409 | 保留表单内容，刷新详情和任务中心，按后端 message 提示 |
| action 缺 `task_id` | 不 fallback 到旧状态接口，记录接口数据给后端排查 |
| 任务中心待办未消失 | 复查 task 状态和当前 workflow node |
| Admin 与小程序状态不一致 | 以 API 响应为准，记录项目 ID、instance ID、task ID |
| 旧实例仍在旧快照 | 按旧实例处置确认清单处理，不手工改库 |

## 验收结论

| 项 | 结果 |
| --- | --- |
| 客户设计 workflow | 待填写 |
| 项目签约 workflow | 待填写 |
| 财务收款门禁 | 通过：2026-06-18 orange 已完成收款 workflow smoke |
| 施工工序日志 | 待填写 |
| 阶段验收联动 | 待填写 |
| Admin 模板与发布校验 | 待填写 |
| 旧实例处置 | 待填写 |
| orange 小程序真实联调 | 部分通过：财务收款节点通过，其余场景待验收 |

最终结论：

```text
部分通过：财务收款 workflow smoke 已通过；客户设计、项目签约、
施工工序日志、阶段验收联动、Admin 可见性和旧实例处置仍需继续验收或确认。
```
