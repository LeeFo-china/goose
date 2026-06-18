# Invalid Customer 旧实例取消执行记录

日期：2026-06-18

## 业务确认

用户已在 2026-06-18 确认按步骤执行下一步计划。该计划的第二步为：

```text
确认以下客户保持 invalid 状态，并取消对应旧 running workflow 实例。
```

本记录只覆盖两个已标记为 `invalid` 的客户旧 `customer_main`
running 实例取消，不处理 manual restore project。

## 目标

| customer ID | legacy instance ID | workflow | node | customer status |
| --- | --- | --- | --- | --- |
| `aa55b76c-a6a1-498a-9e36-fde8b974a248` | `41f7772d-c472-41e6-a913-c6e641be3dd2` | `customer_main` | `potential` | `invalid` |
| `2cc20642-03d9-4bc6-a68a-f7236ab8e3ea` | `1a6dc44b-19b9-4516-8d3f-9e2f4125b842` | `customer_main` | `potential` | `invalid` |

tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`

## Dry Run

命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --instance-id 41f7772d-c472-41e6-a913-c6e641be3dd2

bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --instance-id 1a6dc44b-19b9-4516-8d3f-9e2f4125b842
```

执行时间：`2026-06-18T16:17:15+08:00`

结果：两项均通过。

关键结果：

- `ok = true`
- `mode = dry-run`
- `result.ok = true`
- `result.dry_run = true`
- 两个实例的 `legacy_workflow_key = customer_main`
- 两个实例的 `legacy_current_node_key = potential`
- 两个客户的 `legacy_subject_status = invalid`

## Apply 前门禁

`docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`
中的 `legacy_instance_apply_gates.invalid_customer_cancellations` 已回填：

- `confirmed = true`
- `confirmed_by = leefo via Codex instruction`
- `confirmed_at = 2026-06-18T16:17:15+08:00`
- `evidence = docs/state_machine_migrate/2026-06-18-invalid-customer-cancellations-execution.md`

Apply 只能执行上述两个 instance ID，不能扩大范围。

## Apply

命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --apply --confirm-cancel 41f7772d-c472-41e6-a913-c6e641be3dd2 --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --instance-id 41f7772d-c472-41e6-a913-c6e641be3dd2

bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --apply --confirm-cancel 1a6dc44b-19b9-4516-8d3f-9e2f4125b842 --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --instance-id 1a6dc44b-19b9-4516-8d3f-9e2f4125b842
```

执行结果：两项均通过。

| legacy instance ID | result.ok | final status | completed_at |
| --- | --- | --- | --- |
| `41f7772d-c472-41e6-a913-c6e641be3dd2` | `true` | `canceled` | `2026-06-18T08:18:35.497476+00:00` |
| `1a6dc44b-19b9-4516-8d3f-9e2f4125b842` | `true` | `canceled` | `2026-06-18T08:18:44.072827+00:00` |

后端只读复核：

- `41f7772d-c472-41e6-a913-c6e641be3dd2`：
  `status = canceled`，`subject_id = aa55b76c-a6a1-498a-9e36-fde8b974a248`
- `1a6dc44b-19b9-4516-8d3f-9e2f4125b842`：
  `status = canceled`，`subject_id = 2cc20642-03d9-4bc6-a68a-f7236ab8e3ea`

结论：`invalid_customer_cancellations` 已完成，后续旧实例处置只剩
`manual_restore_project` 决策。
