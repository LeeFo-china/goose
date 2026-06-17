# 装修 workflow 对接收口确认请求

日期：2026-06-17

关联文档：

- `docs/state_machine_migrate/2026-06-17-decoration-workflow-business-spec.md`
- `docs/state_machine_migrate/2026-06-17-decoration-workflow-legacy-apply-checklist.md`
- `docs/state_machine_migrate/2026-06-17-decoration-workflow-e2e-acceptance-checklist.md`
- `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`

## 背景

装修业务 workflow 的模板拆分、发布校验、API runtime、Admin 过滤、旧实例审计和
dry-run 工具已经落地。当前不能继续自动收口的内容都需要外部确认：

1. 3 个运行中旧实例是否允许执行写入处置。
2. 1 个施工后段项目旧实例应该恢复到哪个业务点。
3. orange 小程序真实联调结果是否通过。

在收到明确确认前，不执行任何 `--apply`，不手工改远端数据库状态。

## 当前远端复核状态

截至 2026-06-17 23:37：

- `needs_migration = false`
- `needs_instance_review = true`
- `running_instances_on_legacy_snapshots = 10`
- `compatible_runtime = 6`
- `rebuild_candidate = 1`
- `manual_restore_required = 3`
- `unknown_review_required = 0`

最新证据：

- `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-readonly-review-2337.md`

## 需要业务确认的写入项

请业务负责人逐条回复以下确认句。没有确认的条目不会执行。

### 1. 项目签约旧实例受控重建

```text
确认允许将项目 1a8589fb-8f3f-4900-a759-6d15438ffcc2 的旧 construction_main running 实例取消，并重建到 project_signing designing 节点。
```

影响：

- 旧实例 `b58acf8e-4f18-4b40-b5c7-919600e5e636` 会取消。
- 新建或恢复项目 `project_signing` running 实例。
- 当前节点保持在 `designing`。

执行后预期：

- `rebuild_candidate` 从 `1` 降到 `0`。
- `running_instances_on_legacy_snapshots` 从 `10` 降到 `9`。

### 2. 关闭客户旧实例取消

```text
确认客户 aa55b76c-a6a1-498a-9e36-fde8b974a248 保持 invalid 状态，并取消旧 running workflow 实例 41f7772d-c472-41e6-a913-c6e641be3dd2。
```

影响：

- 客户状态不变，仍为 `invalid`。
- 旧 running workflow 实例取消。
- pending task 一并取消。

### 3. 关闭客户旧实例取消

```text
确认客户 2cc20642-03d9-4bc6-a68a-f7236ab8e3ea 保持 invalid 状态，并取消旧 running workflow 实例 1a6dc44b-19b9-4516-8d3f-9e2f4125b842。
```

影响：

- 客户状态不变，仍为 `invalid`。
- 旧 running workflow 实例取消。
- pending task 一并取消。

两个关闭客户实例都执行后预期：

- `manual_restore_required` 从 `3` 降到 `1`。
- `running_instances_on_legacy_snapshots` 从 `9` 降到 `7`，前提是项目重建也已执行。

## 需要业务决策的施工后段项目

项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460`：

- 旧实例：`c435b9e9-0e22-49e7-9352-446259f9b57c`
- 当前旧 workflow：`construction_main`
- 当前节点：`acceptance`
- 项目状态：`acceptance`

这个项目不能自动重建到新施工流程起点，也不能用关闭客户取消脚本处理。

请业务负责人从以下方向中确认一个：

1. 继续兼容执行旧验收节点，直到该旧 workflow 自然结束。
2. 定义一个新施工 workflow 的恢复点，并补专门恢复脚本。
3. 确认项目应异常关闭，再补项目级异常处置方案。

确认回复格式：

```text
项目 634ff402-ff84-4541-aa7c-3cdcd4fd5460 的处理策略选择第 <1/2/3> 项。补充说明：<原因或恢复点>。
```

门禁回填要求：

- 如果选择第 1 项“继续兼容执行旧验收节点”，
  `legacy_instance_apply_gates.manual_restore_project.followup_required`
  必须保持 `true`，不能把
  `closeout_rules.can_close_prd_without_followup` 改为 `true`。
- 只有在恢复脚本或异常关闭方案已经执行完毕、且没有后续跟踪项时，
  才能把 `followup_required` 改为 `false`。

## 需要 orange 回填的联调结果

小程序团队完成真实联调后，请回填：

1. 小程序版本或 commit。
2. 验收账号和租户。
3. 客户设计 workflow smoke 结果。
4. 项目签约 workflow smoke 结果。
5. 财务收款节点 smoke 结果。
6. 施工工序日志 smoke 结果。
7. 阶段验收联动 smoke 结果。
8. 失败项、截图或接口日志。

回填位置：

```text
docs/state_machine_migrate/2026-06-17-decoration-workflow-e2e-acceptance-checklist.md
```

## 执行人收口动作

收到确认后，执行人应按顺序操作：

1. 串行复跑只读审计和旧实例复核。
2. 对每个被确认的写入项串行复跑 dry-run。
3. 执行对应 `--apply`。
4. 每次 apply 后复跑审计和复核。
5. 将结果写回旧实例处置确认清单和端到端验收清单。
6. 同步更新装修 workflow 专用门禁状态 JSON。
7. 运行专用门禁校验：

```bash
cd apps/api && bun run workflow:decoration-manual-gates-check -- \
  --evidence-file docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json
```

在全部外部门禁完成前，该命令应失败并列出 pending gate；所有确认和联调证据
回填完成后，该命令必须通过。

即使写入项都已业务确认，只要最新只读审计仍显示 `needs_migration = true` 或
`unknown_review_required > 0`，专用门禁仍必须保持
`closeout_rules.can_run_legacy_apply = false`，不得执行 `--apply`。

如果任一复核结果和本确认请求不一致，停止执行，重新发起确认。
