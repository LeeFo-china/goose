# 装修 workflow 旧实例处置确认清单

日期：2026-06-17

关联 PRD：

- `docs/state_machine_migrate/2026-06-17-decoration-workflow-business-spec.md`

## 使用边界

本清单只用于处理 PRD 落地后仍在旧发布快照上运行的 workflow 实例。

执行原则：

1. 所有命令串行执行，不并发跑远端审计、dry-run 或 apply。
2. 每次 apply 前先复跑只读审计和对应 dry-run。
3. 只执行已经业务确认的对象。
4. 不手工改远端数据库状态。
5. orange 真实联调不在本仓库执行。

## 当前复核状态

截至 2026-06-17 23:37，只读复核结果：

- `needs_migration = false`
- `needs_instance_review = true`
- `running_instances_on_legacy_snapshots = 10`
- `compatible_runtime = 6`
- `rebuild_candidate = 1`
- `manual_restore_required = 3`
- `unknown_review_required = 0`

最新证据：

- `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-readonly-review-2337.md`

## Apply 前必跑

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

继续执行的前提：

- `needs_migration = false`
- `unknown_review_required = 0`
- `rebuild_candidate` 仍只包含项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2`
- 两个待取消客户实例仍是 `subject_status = invalid`
- `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`
  中 `closeout_rules.can_run_legacy_apply = true`，并通过下列门禁：

```bash
cd apps/api && bun run workflow:decoration-manual-gates-check -- \
  --evidence-file docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json
```

## 可确认后执行的写入项

### 1. 项目签约旧实例受控重建

业务对象：

- 项目：`1a8589fb-8f3f-4900-a759-6d15438ffcc2`
- 旧实例：`b58acf8e-4f18-4b40-b5c7-919600e5e636`
- 当前旧 workflow：`construction_main`
- 当前节点：`designing`
- 目标 workflow：`project_signing`
- 目标当前节点：`designing`

apply 前 dry-run：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --subject-type project \
  --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 \
  --workflow-key project_signing
```

dry-run 必须满足：

- `ok = true`
- `mode = dry-run`
- `result.current_node.node_key = designing`
- `result.existing_instance_count = 1`
- `result.canceled_instance_count = 1`
- `result.deleted_instance_count = 0`

业务确认句：

```text
确认允许将项目 1a8589fb-8f3f-4900-a759-6d15438ffcc2 的旧 construction_main running 实例取消，并重建到 project_signing designing 节点。
```

正式 apply：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts \
  --apply \
  --confirm-rebuild 1a8589fb-8f3f-4900-a759-6d15438ffcc2 \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --subject-type project \
  --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 \
  --workflow-key project_signing
```

### 2. 关闭客户旧实例受控取消

业务对象：

- 客户：`aa55b76c-a6a1-498a-9e36-fde8b974a248`
- 旧实例：`41f7772d-c472-41e6-a913-c6e641be3dd2`
- 当前旧 workflow：`customer_main`
- 当前节点：`potential`
- 客户状态：`invalid`

apply 前 dry-run：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --instance-id 41f7772d-c472-41e6-a913-c6e641be3dd2
```

业务确认句：

```text
确认客户 aa55b76c-a6a1-498a-9e36-fde8b974a248 保持 invalid 状态，并取消旧 running workflow 实例 41f7772d-c472-41e6-a913-c6e641be3dd2。
```

正式 apply：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts \
  --apply \
  --confirm-cancel 41f7772d-c472-41e6-a913-c6e641be3dd2 \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --instance-id 41f7772d-c472-41e6-a913-c6e641be3dd2
```

业务对象：

- 客户：`2cc20642-03d9-4bc6-a68a-f7236ab8e3ea`
- 旧实例：`1a6dc44b-19b9-4516-8d3f-9e2f4125b842`
- 当前旧 workflow：`customer_main`
- 当前节点：`potential`
- 客户状态：`invalid`

apply 前 dry-run：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --instance-id 1a6dc44b-19b9-4516-8d3f-9e2f4125b842
```

业务确认句：

```text
确认客户 2cc20642-03d9-4bc6-a68a-f7236ab8e3ea 保持 invalid 状态，并取消旧 running workflow 实例 1a6dc44b-19b9-4516-8d3f-9e2f4125b842。
```

正式 apply：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts \
  --apply \
  --confirm-cancel 1a6dc44b-19b9-4516-8d3f-9e2f4125b842 \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --instance-id 1a6dc44b-19b9-4516-8d3f-9e2f4125b842
```

## 不允许自动处理的对象

- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460`
- 旧实例：`c435b9e9-0e22-49e7-9352-446259f9b57c`
- 当前旧 workflow：`construction_main`
- 当前节点：`acceptance`
- 项目状态：`acceptance`

处理要求：

1. 不执行重建到施工起点。
2. 不用关闭客户取消脚本处理施工后段项目。
3. 先由业务确定恢复点，例如继续兼容验收、补专门恢复脚本、或定义项目异常处置。
4. 明确恢复策略后，再补对应 migration 或受控 service 脚本。

## Apply 后验收

每次 apply 后串行执行：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

全部 3 个可写入项都执行后，预期：

- `running_instances_on_legacy_snapshots` 从 `10` 降到 `7`
- `rebuild_candidate` 从 `1` 降到 `0`
- `manual_restore_required` 从 `3` 降到 `1`
- 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2` 有新的 `project_signing` running 实例
- 两个关闭客户旧实例状态变为 `canceled`
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 仍保留为人工恢复点决策项

## 最终剩余动作

完成本清单的 3 个 apply 后，PRD 仍不能直接关闭，除非同时满足：

1. 施工后段项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 已有业务确认的恢复策略。
2. orange 小程序真实联调已完成并回传验收结果。
