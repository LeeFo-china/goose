# 工序类型占用提示与重复工序评估

## 问题与根因

截图中的六类工序已经被当前施工工作流的已有节点使用，新加的空工序节点因此没有可选类型。原界面仅将选项置灰，没有告知占用节点和唯一性规则。这不是工序字典未加载。

当前业务约束为：同一工作流内，每种工序只能出现一次（包含互斥分支）。本次保留该规则及后端发布校验。

## 本次改动

- 工序选项显示占用节点名称；编辑时排除当前节点自身。
- 六类均被其他节点占用时显示“6种工序均已配置，每种工序只能使用一次，请编辑已有节点。”
- 节点库只有通用流程节点，没有独立工序预设。因此在属性面板的“节点能力”入口禁用新增工序能力，并拦截对应变更回调；通用节点仍可用于其他能力。
- 历史空工序节点可以查看各类型占用原因，仍可删除或切换能力。删除已有工序或将其切换为其他能力后，类型立即释放。
- 本地重复校验标明占用节点及修改／删除方式；不修改节点编码生成、API、数据库或现有实例。

## 重复工序只读评估

评估基线：`1a31cd7d2`。以下来自代码和 migration；未向生产插入重复节点，也未变更数据。

| 范围 | 现有事实 | 若仅放开选择的风险 |
| --- | --- | --- |
| 配置与发布 | `workflow-procedure-stages.ts` 以工序生成 `procedure_${stageKey}`；`workflow-publish-graph.ts` 调用工序重复校验 | 重复节点编码或发布失败；换成不同图节点 ID 不能解决 |
| 派工与排期 | `repositories/project-procedure-assignments.ts` 部分操作按实例＋node_key 查询，另有项目＋stage_code 的最新活动派工查询 | 独立排期可以存储，但日志权限／完成同步可能选错派工 |
| 施工日志 | `services/project-logs/workflow-approved-create.ts` 写入 stage_code 和描述性 node_name；`repositories/project-log-evidence.ts` 按项目＋工序计数 | 后一节点可能使用前一节点的日志与图片满足完工要求 |
| 验收 | `services/project-acceptances/legacy/create-update.ts` 按项目＋工序检查进行中报告；`project-workflow-mutation-guards.ts` 取首个同工序节点配置 | 无法隔离同类节点报告，验收配置及完成同步可能错配 |
| SQL 验收门禁 | `20261008140000_gate_procedure_completion_on_acceptance.sql` 校验派工运行节点，但报告仍按项目＋工序取最新非取消记录 | 报告尚未绑定到对应运行节点；不能直接推断一定自动跳过验收 |
| 甘特图 | `20260901110000_add_tenant_owner_project_gantt_filters.sql` 按实例＋node_key 关联派工，按项目＋stage_code 关联验收；API 时间线也按工序分配报告 | 两份独立排期可能显示同一报告，历史节点展示可能被新报告影响 |

相关 migration 的唯一约束分别是定义＋node_key、活动派工的租户＋实例＋node_key、进行中验收的项目＋stage_code。它们不等价于运行节点级的完整业务隔离；本轮未查询生产 migration 状态。

结论：当前保留工序唯一限制。若今后确有“水电一期／二期”等需求，应另立需求，将日志、验收、派工及甘特图统一关联运行节点，并处理数据 migration 与客户端契约，不能仅解除下拉禁用。

## 验证

- admin `bun run typecheck`：通过。
- admin `bun run check:file-size`：通过，1667 个 TS/TSX 文件均满足上限。
- 4 个相关 Bun 测试文件：19 pass、0 fail、34 assertions；新增 6 个占用边界用例。
- 实际 `WorkflowPropertyPanel` + 本地模拟节点，Chromium 验证：能力入口禁用、当前节点自身可选、占用名称、历史空节点全禁用、删除释放、重新选择后节点名称更新，均通过；无浏览器异常。
- 浏览器验证未连接生产接口，辅助权限接口返回本地空分页数据；截图不是生产租户截图。
- [六类占满](evidence/2026-10-13-workflow-procedure-availability/all-used.png)、[编辑自身与占用名称](evidence/2026-10-13-workflow-procedure-availability/owners.png)。
- 独立代码审查无阻断问题。初次本地依赖解析出现 Zod 类型版本混用，补全隔离工作树的 domain 依赖链接后消除；未修改依赖声明、锁文件或主工作区依赖。

## 发布范围

仅 `service=admin`，使用不可变生产候选构建与部署流程。无需 API、worker、migration 或小程序发布。发布后核对 admin 版本／镜像摘要／健康状态，并确认 API 与 worker 版本未变化。
