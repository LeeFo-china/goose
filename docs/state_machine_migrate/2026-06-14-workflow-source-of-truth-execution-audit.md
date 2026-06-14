# Workflow Source Of Truth Execution Audit

Generated at: 2026-06-14

## Scope

This audit records the current execution state for
`2026-06-14-workflow-source-of-truth-cleanup-plan.md`.

Goal: project construction progress, payment gates, procedure stages, admin
display, and mini-program handoff must follow workflow runtime rather than
legacy stage/log/status inference.

## Landed Commits

| commit | scope |
| --- | --- |
| `f8c367c` | source-of-truth cleanup plan |
| `3a6bd3b` | project workflow source diagnostic |
| `34d8a49` | workflow progress projection service |
| `5228e06` | construction stages projected from workflow runtime |
| `ec25c13` | employee/customer bootstrap `workflow_progress` |
| `13b988b` | mutation guards preventing construction facts bypassing workflow |
| `5d47955` | historical runtime repair migration and report |
| `92d3df0` | mini-program workflow progress handoff |
| `a64287b` | admin progress display follows workflow runtime |
| `d28cd0d` | admin project workflow panel no longer directly completes runtime nodes |

## Fresh Verification

### Backend unit and build checks

```bash
cd apps/api
bun test src/services/project-workflow-progress.test.ts
bun test src/services/construction-stage-status/legacy/lists.test.ts
bun test src/scripts/project-workflow-source-of-truth-check.test.ts
bun run typecheck
bun run check
```

Observed result: all commands exited `0`.

### Admin checks

```bash
cd apps/admin
pnpm run check
```

Observed result: exited `0`; file-size and TypeScript checks passed.

### Admin legacy progress usage search

```bash
rg -n "completeWorkflowRuntimeNode|complete-node|完成当前节点|进入下一节点|current_stage_label|stage_code === data\\?\\.current_stage|next_stage\\?\\.stage_label" \
  apps/admin/components/projects apps/admin/components/workflows
```

Observed project-related result:

- project pages/components no longer call `completeWorkflowRuntimeNode`;
- project pages/components no longer render direct runtime completion labels;
- project pages/components no longer use `current_stage_label`, `data.current_stage`,
  or `next_stage.stage_label` as progress display logic;
- the remaining `completeWorkflowRuntimeNode` reference is the shared workflow
  request helper, not used by project detail panels.

## Current Remote Data State

Fresh command:

```bash
cd apps/api
bun --env-file=.env run workflow:project-source-check --all-active-construction
```

Observed result:

| field | value |
| --- | ---: |
| `ok` | `false` |
| `total_projects` | `5` |
| `total_issues` | `16` |

Known project `2d710a84-1045-4750-8dfd-51a0f463a4db` still reports:

- `workflow_current_node_key = construction_start`
- `construction_stages_current_stage = tiling`
- `PAYMENT_GATE_SKIPPED_WITHOUT_PAYMENT` for `payment_stage_2 / stage_2`

This is expected until the repair migration is applied to the target database.

## Migration Status

Fresh command:

```bash
set -a
source .env.local
set +a
npx supabase migration list
```

Observed local-only migrations:

| migration | status |
| --- | --- |
| `20260612133000_drop_schedule_project_construction_transition.sql` | local-only |
| `20260612143000_drop_legacy_state_machine_objects.sql` | local-only |
| `20260614073500_repair_project_workflow_runtime_source.sql` | local-only |

`20260614073500` cannot be applied through `supabase db push` alone without also
applying the earlier local-only destructive cleanup migrations.

## Destructive Cleanup Gates

Fresh command:

```bash
cd apps/api
bun --env-file=.env run workflow:cleanup-readiness
```

Observed result:

- `ready: true`
- `blockers: []`

Fresh command:

```bash
cd apps/api
bun --env-file=.env run workflow:destructive-cleanup-preflight
```

Observed result: exited `1`.

Failing checks:

| check | reason |
| --- | --- |
| `pending_migrations_are_destructive_pair` | pending set is three migrations, not just the destructive cleanup pair |
| `manual_gates` | missing `--evidence-file` |

Passing checks in the same preflight:

- `destructive_migration_content`
- `cleanup_readiness`
- `workflow_runtime_consistency`
- `legacy_objects_still_targeted`

## Remaining Required External Evidence

Before applying the destructive cleanup pair, the runbook requires
`docs/state_machine_migrate/audit/manual-gates.json` with real evidence for:

- Phase 4 backfill/reconciliation and Phase 5 authenticated smoke;
- workflow API contract adoption by callers;
- mini-program rollout confirmation and minimum supported version;
- admin authenticated smoke;
- target backup id and restore window.

This evidence cannot be invented by the agent. Without it, the destructive
cleanup preflight correctly fails.

## Current Completion Status

Code and documentation work in `gooes` has moved project progress display and
mutation paths to workflow runtime/tasks. The target database is not yet repaired
because the migration queue contains an earlier destructive cleanup pair with
manual release gates.

To complete the plan end-to-end:

1. Fill and validate `docs/state_machine_migrate/audit/manual-gates.json` with
   real release evidence.
2. Re-run `workflow:destructive-cleanup-preflight --evidence-file ...`.
3. Apply pending migrations in order only after the preflight is `ok: true`.
4. Re-run:
   - `supabase migration list`
   - `bun --env-file=.env run workflow:project-source-check --project-id 2d710a84-1045-4750-8dfd-51a0f463a4db`
   - `bun --env-file=.env run workflow:project-source-check --all-active-construction`

Expected post-apply result for the known project:

- `workflow_current_node_key = payment_stage_2`
- `construction_stages_current_stage` is not `tiling`
- `stage_2` payment remains the active gate until a confirmed payment exists
