# Workflow Final Cleanup Completion Report

- date: 2026-06-16
- target Supabase project: `fclnkyatvfvmzgzdqlba`
- evidence file: `docs/state_machine_migrate/audit/manual-gates.json`
- status: destructive cleanup applied; technical verification passed

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

## Required Final Step

Create the final commit with a breaking cleanup subject:

```bash
git commit -m "refactor(workflow)!: 删除旧状态机数据库对象"
```

After that commit, rerun:

```bash
cd apps/api
bun run workflow:manual-gates-check \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
bun --env-file=/Users/leefo/Public/work/gooes/.env.local run workflow:final-completion-audit \
  --evidence-file docs/state_machine_migrate/audit/manual-gates.json
```

Expected: final audit `ok: true`, `mode: final`.
