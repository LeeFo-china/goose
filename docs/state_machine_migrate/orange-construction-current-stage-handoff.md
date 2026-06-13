# Orange 施工阶段 current_stage 对接文档

## 背景

orange 文档
`docs/2026-06-13-project-construction-current-stage-backend-check.md`
记录了项目 `2d710a84-1045-4750-8dfd-51a0f463a4db` 的员工侧项目详情问题：
小程序 timeline 高亮“木工”，而业务反馈项目应仍处于“拆改验收/客户确认”相关环节。

orange 侧 dev-only 日志已经确认：前端不是把 `next_stage` 当成当前阶段，而是
`GET /projects/:id/employee-detail-bootstrap` 的
`construction_stages.current_stage` 直接返回了 `woodwork`。

本文给小程序和后端联调用，明确 `construction_stages.current_stage`、
`construction_stages.next_stage`、`workflow_state.current_node_*` 和
`workflow_state.actions` 的边界。

## API 来源

员工侧项目详情优先使用聚合接口：

```http
GET /projects/:id/employee-detail-bootstrap
Authorization: Bearer <token>
```

施工阶段独立刷新可使用：

```http
GET /projects/:id/construction-stages
Authorization: Bearer <token>
```

两个接口的施工阶段结果应使用同一套后端计算逻辑。小程序如果发现
`employee-detail-bootstrap.construction_stages` 和独立
`/construction-stages` 不一致，应记录为后端一致性问题，不要在端上自行调和。

## 响应字段

`construction_stages` 关键结构：

```json
{
  "project_id": "project-id",
  "project_status": "constructing",
  "required_stage_codes": [
    "demolition",
    "plumbing_electrical",
    "tiling",
    "woodwork",
    "painting",
    "installation"
  ],
  "required_completed": false,
  "current_stage": "woodwork",
  "next_stage": {
    "stage_code": "woodwork",
    "stage_label": "木工",
    "status": "not_started"
  },
  "missing_required_stages": [],
  "stages": [],
  "all_stage_codes": []
}
```

字段含义：

| 字段 | 含义 | 小程序用法 |
| --- | --- | --- |
| `current_stage` | 当前施工阶段或当前待开始阶段 | timeline active/highlight 的主依据 |
| `next_stage` | 下一步可推进阶段 | 只能作为“下一步”提示，不能覆盖 `current_stage` |
| `stages[].status` | 阶段计算状态 | 展示阶段 tone、是否完成、是否可操作 |
| `stages[].acceptance_status` | 验收单原始状态 | 展示“待复核/待业主确认/已确认”等文案 |
| `stages[].acceptance_action` | 阶段验收入口 | 打开验收详情/创建验收，不等同 workflow task |
| `workflow_state.current_node_*` | 当前 workflow 运行节点 | 展示流程节点、判断是否被收款/工序节点阻塞 |
| `workflow_state.actions` | 当前员工可执行 workflow task | 所有项目推进、收款、工序日志完成动作的唯一按钮来源 |

## 当前后端语义

截至 2026-06-13，gooes 后端 `construction_stages.current_stage` 来自施工阶段
服务：

```text
apps/api/src/services/construction-stage-status/legacy/lists.ts
```

当前规则：

1. 读取各阶段最新验收记录和施工日志。
2. `project_acceptances.status = customer_confirmed` 的阶段视为 `accepted`。
3. 前置阶段未 `customer_confirmed` 时，后续阶段为 `locked`。
4. `current_stage` 取第一个 `status !== accepted && status !== locked` 的阶段。
5. `next_stage` 当前同样取这一个阶段。

因此，如果后端数据中：

```text
demolition = customer_confirmed
plumbing_electrical = customer_confirmed
tiling = customer_confirmed
woodwork = not_started
```

那么 `current_stage = woodwork` 是按当前后端规则得出的结果。小程序不应把它
本地改回拆改；应由后端/数据侧核对前三个阶段为什么已经是
`customer_confirmed`。

## 与 Workflow 的边界

施工阶段状态和 workflow 运行节点是两个不同读模型：

| 读模型 | 负责内容 |
| --- | --- |
| `construction_stages` | 施工阶段 timeline、验收卡片、日志可写阶段、阶段完成度 |
| `workflow_state` | 当前流程节点、待办 action、收款闸门、工序节点完成 |

小程序规则：

1. timeline 高亮使用 `construction_stages.current_stage`。
2. “下一步”文案可以读 `construction_stages.next_stage`，但不能替代当前阶段。
3. 项目推进按钮只使用 `workflow_state.actions`。
4. 收款节点必须优先显示 `business_domain = payment_collection` 的 workflow
   action，即使 `construction_stages.current_stage` 已经指向后续阶段。
5. 工序日志节点必须优先使用 workflow action 的
   `output_fields[].type = project_log` 和 `stage_code`；没有该 action 时，
   才使用 `log_entry.writable_stage` 作为普通施工日志入口。
6. complete 成功后刷新 `employee-detail-bootstrap` 或 subject state，不本地推断
   下一个 workflow 节点或施工阶段。

## orange 当前落点

只读核查 orange 后，相关文件如下：

| 文件 | 当前职责 | 对接要求 |
| --- | --- | --- |
| `src/packageProjects/pages/detail/hooks/useProjectDetailBootstrap.ts` | 接收 bootstrap，写入 `constructionStagesPayload` 和 `workflow_state.actions` | 保持同时刷新施工阶段和 workflow actions |
| `src/packageProjects/pages/detail/hooks/useProjectConstructionStages.ts` | 独立加载 `/projects/:id/construction-stages` | 和 bootstrap 使用同一展示规则 |
| `src/packageProjects/pages/detail/utils/constructionStages.ts` | 按 `current_stage` 计算 timeline state | 不再用 `next_stage` 覆盖 current |
| `src/packageProjects/pages/detail/sections/ConstructionStagePanel.tsx` | 展示施工阶段面板 | subtitle 可展示“当前 X，下一步 Y” |
| `src/packageProjects/pages/detail/sections/ProjectLogsSection.tsx` | 展示施工 timeline | active 状态以 `current_stage` 为准 |
| `src/packageProjects/pages/detail/hooks/useProjectStatusViewModel.ts` | 汇总阶段、日志、验收状态 | 不用施工阶段推导 workflow 按钮 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts` | 加载 `workflow_state.actions` | 保持 workflow action 作为项目推进唯一来源 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts` | 提交 workflow task | 收款/普通项目动作均走 complete |
| `src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` | 创建施工日志后 complete workflow task | workflow complete 失败时不要重复创建日志 |
| `src/packageProjects/pages/logEdit/hooks/useProjectLogPermissionContext.ts` | 日志页读取施工阶段权限 | workflow project_log route 参数优先于普通 current_stage 推断 |
| `src/packageProjects/pages/detail/utils/constructionStageDebug.ts` | dev-only 脱敏调试日志 | 保留用于联调，不记录 token/手机号/响应原文 |

## 针对问题项目的联调步骤

项目：

```text
2d710a84-1045-4750-8dfd-51a0f463a4db
```

建议联调顺序：

1. 调用 `GET /projects/:id/employee-detail-bootstrap`。
2. 记录：
   - `workflow_state.current_node_key`
   - `workflow_state.current_node_title`
   - `workflow_state.current_business_kind`
   - `workflow_state.actions[].business_domain`
   - `construction_stages.current_stage`
   - `construction_stages.next_stage.stage_code`
   - `construction_stages.stages[].stage_code/status/acceptance_status`
3. 再调用 `GET /projects/:id/construction-stages`，确认两个接口返回的
   `current_stage` 和阶段状态一致。
4. 如果业务认为拆改仍待客户确认，应在后端/数据库侧看到：
   - `demolition.acceptance_status = leader_approved`，或
   - `demolition.status = pending_acceptance`。
5. 如果返回仍是：
   - `demolition/plumbing_electrical/tiling = customer_confirmed`
   - `woodwork = not_started`

   则小程序显示木工符合当前接口数据，后端需要回查这些验收记录为何已被客户确认。
6. 如果 workflow 当前节点是 `payment_collection`，小程序必须展示收款 action，
   不能因为 `current_stage = woodwork` 而跳过中期收款。

## 错误与降级

- `construction_stages` 加载失败时，展示“施工阶段加载失败”，不要用施工日志列表
  本地推导当前阶段。
- `workflow_state` 加载失败时，不显示项目推进按钮；可以保留施工阶段只读展示。
- `partial_errors` 包含 `construction_stages` 时，允许用户刷新或调用独立
  `/construction-stages` 重试。
- `partial_errors` 包含 `workflow_state` 时，禁止 fallback 到旧状态动作。

## 验收清单

| 场景 | 期望 |
| --- | --- |
| bootstrap 返回 `current_stage = woodwork` | timeline 高亮木工，不用 `next_stage` 或本地日志覆盖 |
| 独立 `/construction-stages` 返回不同 `current_stage` | 记录后端一致性问题 |
| 拆改验收待业主确认 | `current_stage = demolition`，拆改 `acceptance_status = leader_approved` |
| 拆改/水电/瓦工都已 `customer_confirmed` | `current_stage` 可以推进到木工 |
| workflow 当前是中期收款 | 显示收款 action，未确认收款时 complete 返回业务阻塞 |
| workflow 工序要求施工日志 | 按 action 的 `stage_code` 创建日志，不用 `current_stage` 覆盖 |
| complete 成功 | 刷新 bootstrap，timeline 和 workflow actions 都以后端最新响应为准 |

## 归属

gooes 后端负责：

- 保证 `employee-detail-bootstrap` 和 `/construction-stages` 使用一致的阶段计算。
- 保证验收状态、workflow task、收款闸门和施工日志节点的后端数据一致。
- 如果业务事实和验收记录不一致，修正数据或后端流转逻辑。

orange 小程序负责：

- 按 `current_stage` 展示施工阶段。
- 按 `workflow_state.actions` 展示和提交流程动作。
- 保留脱敏调试日志用于联调。
- 不从 `next_stage`、日志列表或旧状态机字段本地推导当前阶段。
