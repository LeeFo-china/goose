# 甘特图节点完成元数据：后端核查与最终契约

日期：2026-10-09。需求来源：orange 只读交接文档 `docs/miniprogram/2026-10-09-gantt-completed-node-metadata-handoff.md`。
本次范围为 gooes 只读投影与验证；不修改 orange、不写生产数据、不新增 migration。本文件记录源码实现，尚未部署到生产。

## 生产事实核查

通过生产 PostgreSQL `BEGIN READ ONLY`、10 秒 statement_timeout、租户/实例限定查询，交叉验证节点、任务和 transition log。

- 租户：河南晴天装饰工程有限公司，`3eebca47-961f-4899-b976-a3d3208d326b`。
- 截图项目：李·十里头德盛苑 河南省郑州市中牟县万洪路北大新世纪实验学校西北侧约270米。
- project_id：`1c245715-dd5e-47b5-93bc-6ec6864c3716`。不是前一天的“张俊峰”项目。
- 当前施工 instance_id：`ada54da0-3a62-4556-a254-3d02666168cc`，status=completed，current_node_key=end。
- 绑定版本：`5801ff01-8789-49ad-b09a-e8c16e13ac20`。
- “确认开工”：node_key=started，node_type=construction_stage，business_kind=construction_start。
- 节点开始：`2026-10-09T05:32:36.629934+00:00`，即北京时间 13:32:36.629934。含义是节点激活，不是现场施工开始。
- 实际完成：**`2026-10-09T05:32:45.915399+00:00`，即北京时间 2026-10-09 13:32:45.915399**。
- 实际操作人：**风清扬**，employee_id=`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`。`completed_by` 外键引用 employees，不是 auth user ID。
- 对应 task 同为 completed，完成时间和员工 ID 一致；审计 action=start_construction，started → procedure_demolition，时间与员工 ID 一致。
- 该节点仅要求 project.update，不是 procedure；同租户/项目/实例/node_key 的工序派工记录数为 0。无需工序排期和专人派工，不能据此制造缺任务提示。
- 先前签约实例 `2e1b1728-c458-4b61-9250-dd6f660617bf` 的 pending_start（排期开工）完成于 13:32:36.600301，不可混入当前节点。
- 项目表 status=constructing，施工流程实例已 completed 是两个不同事实；本次不据此改写项目状态。

## 根因与变更

reader 原本只传完成时间/ID，未批量关联姓名；通用 timeline 的 completion map 过滤空员工 ID，contract 仅保留财务节点的专用完成字段；甘特图 serializer 再次遗漏通用完成信息。

现从当前实例 runtime 传递开始/完成证据，按当前页批量补全员工姓名，在通用 timeline 增加元数据，再由甘特图显式输出。计划/派工原字段保持不变。员工查询每批最多 100 个去重 ID，select 仅 id/name，限定 tenant_id；无逐项目/节点补查。数据库错误沿用既有异常和 partial_errors，不伪装成记录缺失。

## 最终字段

沿用 `GET /tenant-owner/daily-dashboard/projects/gantt`。员工认证、租户上下文、dashboard.read 和数据范围不变；默认 page=1/pageSize=20，最大100，小程序每页10。keyword、window_start/window_end、timezone、risk、list/pagination/partial_errors 不变。

每个 `list[].workflow_progress.timeline_nodes[]` 增量返回：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| actual_started_at | string/null | runtime 节点激活时间，不等于实际施工开始 |
| actual_completed_at | string/null | done 节点的 runtime 完成时间；不以计划、派工完工或项目更新时间兜底 |
| completed_by_employee_id | string/null | runtime 完成员工 ID |
| completed_by_employee_name | string/null | 同租户员工名；查询不到为 null |
| completion_actor_type | employee/system/unknown | 有员工 ID 为 employee；无可靠身份信息为 unknown |
| schedule_applicable | boolean/null | 是否需要工序排期 |
| assignment_applicable | boolean/null | 是否需要工序专人派工，与操作权限或项目负责人不同 |

适用性：已知 procedure 类型默认 true；`config.require_procedure_assignment=false` 时两项 false，与现有 start_procedure 表单约束一致。其余已知节点类型为 false；无法识别的历史类型为 null。根据绑定流程版本定义判断，不使用中文名或固定阶段数组。

**系统完成边界**：contract 支持来自可信执行证据的显式 system 类型；当前 runtime 没有可可靠区分系统完成、客户放行、已删除员工的独立来源标记，因此本 reader 对空 completed_by 返回 unknown。不能仅凭员工 ID 为空或节点叫 automation 判为 system。有时间无员工仍保留时间。若未来需要精确 system 展示，应先由执行层记录可审计来源，再接入；本次不编造历史来源。

验收口径：新流程工序施工完工只记录 procedure_completed，客户确认放行之后节点才 done；完成时间对应节点放行事件，不是工人完工事件。历史 runtime 提前完成但仍待验收时，既有投影保持 blocked，本次清空通用完成时间/员工字段以避免误认为已放行；仍保留计划与真实节点开始时间。缺少历史完成元数据本身不会把 done 降为 pending。

保留 schedule_status 原枚举（unscheduled/on_track/delayed/done）。例如非工序可以同时 schedule_applicable=false、schedule_status=unscheduled，客户端必须按适用性决定展示。

## 脱敏响应样例

以下为根据已核查记录按新源码生成的字段示例，不是声称生产新接口已经发布；ID/姓名已替换。

```json
{
  "node_key": "started",
  "node_title": "确认开工",
  "node_type": "construction_stage",
  "business_kind": "construction_start",
  "status": "done",
  "planned_start_date": null,
  "planned_end_date": null,
  "assignee_employee_name": null,
  "schedule_status": "unscheduled",
  "actual_started_at": "2026-10-09T05:32:36.629934+00:00",
  "actual_completed_at": "2026-10-09T05:32:45.915399+00:00",
  "completed_by_employee_id": "<employee-id>",
  "completed_by_employee_name": "<实际操作人>",
  "completion_actor_type": "employee",
  "schedule_applicable": false,
  "assignment_applicable": false,
  "blocked_reason": null
}
```

## 小程序配套

仅交接，不改 orange。修改 `src/types/api/owner_dashboard.d.ts`、`src/packageEmployees/pages/ownerProjectGantt/timeline.ts`、`components/OwnerGanttCard.tsx`、`components/OwnerGanttProgress.tsx`。

已完成优先显示完成时间/操作人，缺失显示“完成时间未记录 / 完成人未记录”；unknown 不显示系统完成。计划和派工放详情独立标注，不以项目负责人替代操作人。不适用排期/派工时隐藏相应提示。全完成且无当前节点时默认末个完成业务节点/完成摘要，不能把第一个节点重新标成当前。兼容旧响应可显示“完成记录待补充”。不新增逐节点查询或写操作。

参数/认证/权限错误继续使用 400/401/403；非筛选聚合读取失败使用既有 partial_errors，依赖 workflow 的筛选查询失败按既有错误响应返回，不吞错。

## 验证

- 节点/任务/审计三方生产只读证据一致，无生产 DDL/DML。
- 自动化覆盖：实际与计划分离、操作人与派工人分离、空员工保留完成时间、缺姓名、显式可信 system 元数据、未知类型、无需派工工序、验收阻塞、当前实例与旧实例同名节点、批量去重/100 条上限、租户查询约束、数据库错误传播、空页零查询。
- 既有分页/筛选/时区/权限/partial_errors 回归沿用原测试。
- 本次相关自动化共 49 项通过；恢复旧的“必须有完成员工 ID”过滤条件时，actorless completion 回归测试按预期失败，恢复修复后通过。
- `bun run check`（apps/api）：typecheck、build、API 500 行文件限制检查通过；独立代码审查无阻塞问题。
- 测试命令（apps/api 下运行；含 mock.module 的文件独立进程运行以免互相污染）：

```sh
bun test src/services/workflow-completion-metadata.test.ts src/services/tenant-owner-dashboard-workflow-progress.test.ts src/services/project-workflow-progress.test.ts
bun test src/services/tenant-owner-gantt-completion-reader.test.ts
bun test src/repositories/tenant-owner-completion-employees.test.ts
bun test src/services/tenant-owner-daily-dashboard.test.ts src/schema/tenant-owner-daily-dashboard.test.ts
bun test src/controllers/tenant-owner-daily-dashboard/routes.test.ts
bun run check
```

生产接口验收须在 API 发布后进行；小程序展示与默认选中由小程序团队完成。
