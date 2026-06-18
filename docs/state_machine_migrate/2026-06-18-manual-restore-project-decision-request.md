# Manual Restore Project 决策请求

日期：2026-06-18

## 当前结论

invalid customer 旧实例取消后，装修 workflow 剩余人工处置只剩一个
manual restore project：

| 字段 | 值 |
| --- | --- |
| project ID | `634ff402-ff84-4541-aa7c-3cdcd4fd5460` |
| project name | `刘德华·信合·湖畔春天1期 E4号楼4001` |
| project status | `acceptance` |
| signed amount | `148000` |
| start date | `2026-05-28T00:00:00+00:00` |
| legacy instance ID | `c435b9e9-0e22-49e7-9352-446259f9b57c` |
| legacy workflow | `construction_main` |
| current node | `acceptance` / `竣工验收` |
| pending task ID | `13133174-8de6-4ef1-b1ac-e69b7c1d2f2c` |
| pending task action | `complete` |
| assignee permission | `project.update` |

该项目不能重建到新施工 workflow 的起点，也不能用 invalid customer cancel
脚本处理。

## 刷新审查结果

命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100

bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

结果摘要：

- `needs_migration = false`
- `unknown_review_required = 0`
- `running_instances_on_legacy_snapshots = 6`
- `compatible_runtime = 5`
- `rebuild_candidate = 0`
- `manual_restore_required = 1`
- 唯一 `manual_restore_required` 是项目
  `634ff402-ff84-4541-aa7c-3cdcd4fd5460`

## 只读状态核查

项目 workflow：

- instance `c435b9e9-0e22-49e7-9352-446259f9b57c`
  仍为 `running`
- 当前节点 `acceptance` / `竣工验收`
- pending task `13133174-8de6-4ef1-b1ac-e69b7c1d2f2c`
  仍为 `pending`
- task action metadata：
  `actions[].key = complete`，`business_domain = workflow_project`，
  `business_action = acceptance`，`output_fields = []`

竣工验收：

- completion acceptance ID：
  `41164871-04bc-414b-8362-9e71e9fe7205`
- stage_code：`completion`
- status：`customer_confirmed`
- submitted_at：`2026-05-31T07:49:14.422+00:00`
- reviewed_at：`2026-05-31T07:51:10.999+00:00`
- customer_confirmed_at：`2026-05-31T07:52:01.039+00:00`
- completed_at：`2026-05-31T07:52:01.039+00:00`

已确认的阶段验收还包括：

- `demolition`
- `plumbing_electrical`
- `tiling`
- `woodwork`
- `painting`
- `installation`
- `completion`

项目成员：

- 设计师：`821f10b2-ecee-4c72-ace7-c7dee439efdd` / 阿紫 /
  `18800002002`
- 施工管理：`5d2c906f-635d-4aa0-9a64-16d7edb380c8` / 欧阳克 /
  `18800003002`

## 决策选项

### 选项 A：继续旧验收流程直到 completed

建议优先选这个。

含义：

- 不重建到新施工 workflow
- 不取消项目
- 保持项目 `status = acceptance`
- 使用当前旧 workflow pending task
  `13133174-8de6-4ef1-b1ac-e69b7c1d2f2c`
  执行 `POST /workflow-tasks/:taskId/complete`
- complete body：

```json
{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

预期：

- 旧 instance `c435b9e9-0e22-49e7-9352-446259f9b57c`
  推进到 `completed/end`
- 当前 pending task 消失
- 不改变已经确认的竣工验收单
- 不创建新的施工 workflow
- manual restore gate 可设置为：
  `selected_option = continue_legacy_acceptance_until_completed`，
  `followup_required = false`

风险：

- 这是旧 workflow 收尾，不会把历史项目迁移进新施工模板。
- 项目业务状态仍为 `acceptance`，因为当前 domain 没有 `delivered` 或
  `completed` 项目状态。

### 选项 B：定义新施工恢复点和恢复脚本

含义：

- 单独设计恢复脚本，把这个项目迁到新施工 workflow 的某个后段节点。
- 需要明确恢复点，例如 `completion` 或 `handover`。

不建议当前立即做：

- 项目竣工验收已经客户确认，恢复进新流程后段的业务收益有限。
- 新脚本需要额外开发、测试和回滚设计。

### 选项 C：确认异常项目关闭方案

含义：

- 不推进旧 task，不重建新流程。
- 将该项目作为例外记录，后续通过人工运营或单独数据修正关闭。

不建议当前立即做：

- 会保留一个 running legacy workflow instance。
- manual gate 仍需要后续跟踪，不能真正关闭。

## 需要业务确认

请确认是否执行选项 A：

```text
确认项目 634ff402-ff84-4541-aa7c-3cdcd4fd5460 选择 continue_legacy_acceptance_until_completed，
使用当前 pending task 13133174-8de6-4ef1-b1ac-e69b7c1d2f2c complete 旧 acceptance 节点至 workflow end，
不重建新施工 workflow，不取消项目，项目 status 保持 acceptance。
```

确认后再执行真实 complete。

## 执行结果

业务确认：

```text
我确认
```

已按选项 A 执行：

- 执行账号：`18800003002` / 欧阳克 /
  `5d2c906f-635d-4aa0-9a64-16d7edb380c8`
- 执行接口：
  `POST /workflow-tasks/13133174-8de6-4ef1-b1ac-e69b7c1d2f2c/complete`
- 执行 payload：

```json
{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

接口返回：

- HTTP status：`200`
- instance `c435b9e9-0e22-49e7-9352-446259f9b57c`
  状态变为 `completed`
- current node：`end`
- task `13133174-8de6-4ef1-b1ac-e69b7c1d2f2c`
  状态变为 `completed`
- completed_at：`2026-06-18T08:28:00.782778+00:00`
- completed_by：`5d2c906f-635d-4aa0-9a64-16d7edb380c8`

只读核验：

- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460`
  仍为 `status = acceptance`
- `workflow_subject_states.pending_task_count = 0`
- 当前项目没有新建施工 workflow；项目 workflow instance 列表仅保留旧实例
  `c435b9e9-0e22-49e7-9352-446259f9b57c`，且状态为 `completed`
- 刷新 `decoration-workflow-legacy-instance-review` 后：
  `manual_restore_required = 0`，`unknown_review_required = 0`，
  `rebuild_candidate = 0`

结论：

- manual restore project 已关闭
- 不需要重建新施工 workflow
- 不需要取消项目
- 不需要再对该 pending task 做小程序或 Admin 联调
