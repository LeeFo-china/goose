# Workflow Final Cleanup Completion Report

- date: 2026-06-16
- target Supabase project: `fclnkyatvfvmzgzdqlba`
- evidence file: `docs/state_machine_migrate/audit/manual-gates.json`
- final cleanup commit: `d96ae34 refactor(workflow)!: 删除旧状态机数据库对象`
- status: destructive cleanup applied; final audit passed

## Context

The manual gate evidence was committed in
`c26e29f docs(workflow): 补齐手工门禁证据`.

This follow-up verified the target database state before attempting any
destructive apply. The target database was already aligned with local migration
history, so there were no pending migrations to push.

## Pre-Apply Gate Check

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Result:

| check | result |
| --- | --- |
| `manual_gate_evidence` | `ok: true` |

## Migration Status

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Observed result before the final breaking commit:

| check | result |
| --- | --- |
| `database_url_configured` | passed |
| `no_pending_migrations` | passed |
| `migration_list_aligned` | passed |
| `cleanup_readiness` | passed |
| `destructive_migration_content` | passed |
| `destructive_cleanup_verify` | passed |
| `generated_database_types_clean` | passed |
| `manual_gate_evidence` | passed |
| `final_breaking_commit_documented` | failed as expected before this final commit |

The only blocker was the latest commit subject:
`docs(workflow): 补齐手工门禁证据`.

## Preflight Result After Apply

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-preflight \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Result: failed because preflight is a pre-apply gate and the target was already
post-apply.

| check | result | detail |
| --- | --- | --- |
| `pending_migrations_are_destructive_pair` | failed | pending migrations were `none` |
| `legacy_objects_still_targeted` | failed | legacy tables/RPC/columns were already absent |
| `destructive_migration_content` | passed | expected destructive drop targets still present in local migration files |
| `cleanup_readiness` | passed | `blockers=0` |
| `workflow_runtime_consistency` | passed | `total_issues=0` |
| `manual_gates` | passed | evidence file accepted |

This failure is expected after the destructive cleanup has already been applied.

## Post-Apply Verification

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:destructive-cleanup-verify
```

Result:

| check | result |
| --- | --- |
| `legacy_tables_absent` | `ok: true` |
| `legacy_rpc_absent` | `ok: true` |
| `legacy_expense_columns_absent` | `ok: true` |
| `legacy_indexes_absent` | `ok: true` |
| `legacy_policies_absent` | `ok: true` |
| `workflow_runtime_consistency` | `ok: true`, `total_issues=0` |

Technical status:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:migration-status:technical \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:technical-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Result:

| command | result |
| --- | --- |
| `workflow:migration-status:technical` | `ok: true`, `mode: technical_only`, `blockers: []` |
| `workflow:technical-completion-audit` | `ok: true`, `mode: technical_only` |

## Database Types

```bash
supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba > apps/api/src/types/database.ts
```

Result: command exited `0` and produced no git diff. The generated database
types were already clean after the destructive cleanup.

## Final Audit Before Breaking Commit

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Result: failed only on `final_breaking_commit_documented`, as expected before
creating the final cleanup commit. All database, runtime, type, and manual gate
checks passed.

## Final Cleanup Commit

The final cleanup commit was created with the required breaking cleanup
subject:

```bash
git commit -m "refactor(workflow)!: 删除旧状态机数据库对象"
```

Result:

| item | value |
| --- | --- |
| commit | `d96ae34` |
| subject | `refactor(workflow)!: 删除旧状态机数据库对象` |
| final cleanup marker | breaking-change subject with workflow cleanup context |

## Final Audit After Breaking Commit

After commit `d96ae34`, the manual gate and final audit commands were rerun:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Manual gate output:

```json
{
  "ok": true,
  "generated_at": "2026-06-16T05:19:11.768Z",
  "checks": [
    {
      "name": "manual_gate_evidence",
      "ok": true,
      "detail": "evidence_file=docs/state_machine_migrate/audit/manual-gates.json"
    }
  ]
}
```

Final audit output:

```json
{
  "ok": true,
  "mode": "final",
  "generated_at": "2026-06-16T05:19:14.791Z",
  "checks": [
    {
      "name": "database_url_configured",
      "ok": true,
      "detail": "SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL configured"
    },
    {
      "name": "no_pending_migrations",
      "ok": true,
      "detail": "none"
    },
    {
      "name": "migration_list_aligned",
      "ok": true,
      "detail": "aligned=235"
    },
    {
      "name": "cleanup_readiness",
      "ok": true,
      "detail": "blockers=0"
    },
    {
      "name": "destructive_migration_content",
      "ok": true,
      "detail": "expected destructive drop targets present"
    },
    {
      "name": "destructive_cleanup_verify",
      "ok": true,
      "detail": "legacy_tables_absent: absent=customer_status_transition_logs, project_status_transition_logs, expense_request_approval_chains; legacy_rpc_absent: absent=schedule_project_construction_transition(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb); legacy_expense_columns_absent: absent=current_step, current_step_role; legacy_indexes_absent: absent=idx_expense_requests_current_step, customer_status_transition_logs_customer_created_idx, customer_status_transition_logs_tenant_created_idx, customer_status_transition_logs_action_idx, project_status_transition_logs_project_created_idx, project_status_transition_logs_tenant_created_idx, project_status_transition_logs_action_idx, idx_expense_request_approval_chains_request_id, idx_expense_request_approval_chains_assignee_status, idx_expense_request_approval_chains_step_status, expense_request_approval_chains_tenant_assignee_status_idx; legacy_policies_absent: absent=expense_requests.Approvers view pending; workflow_runtime_consistency: total_issues=0"
    },
    {
      "name": "generated_database_types_clean",
      "ok": true,
      "detail": "legacy generated types absent"
    },
    {
      "name": "manual_gate_evidence",
      "ok": true,
      "detail": "evidence_file=docs/state_machine_migrate/audit/manual-gates.json"
    },
    {
      "name": "final_breaking_commit_documented",
      "ok": true,
      "detail": "latest_commit=refactor(workflow)!: 删除旧状态机数据库对象"
    }
  ]
}
```

Conclusion: final audit passed with `ok: true` and `mode: "final"`.
