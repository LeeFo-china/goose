# Workflow Runtime Repair Report

Generated at: 2026-06-14

## Dry-run Summary

Command:

```bash
bun --env-file=.env run workflow:project-source-check --all-active-construction
```

Result:

- total projects checked: 5
- total issues: 16
- source-of-truth status: failed before repair

## Repair Buckets

### Auto-repaired by migration

Migration:

```text
supabase/migrations/20260614073500_repair_project_workflow_runtime_source.sql
```

Projects:

| project_id | evidence | repaired runtime target |
| --- | --- | --- |
| `e0f49640-f712-4bb4-b782-ddd134b4d78b` | no confirmed construction acceptances | `construction_start` |
| `54f11aa5-09a8-4410-a9c5-604a7fe9e09c` | demolition acceptance confirmed | `procedure_plumbing_electrical` |
| `b2f0a85c-0084-44ba-a988-438b6dcbec23` | demolition and plumbing/electrical acceptances confirmed; no `stage_2` payment | `payment_stage_2` |
| `2d710a84-1045-4750-8dfd-51a0f463a4db` | demolition and plumbing/electrical acceptances confirmed; no `stage_2` payment | `payment_stage_2` |

The migration cancels stale running construction workflow instances, starts a
fresh active construction runtime, replays only audited completed nodes, creates
the correct pending task for the target node, and upserts
`workflow_subject_states`.

### Requires manual business confirmation

| project_id | reason |
| --- | --- |
| `634ff402-ff84-4541-aa7c-3cdcd4fd5460` | all construction and completion acceptances are customer-confirmed, but no payment records exist. The workflow contains payment gates, so the repair must not synthesize payment completion or skip payment nodes without finance confirmation. |

## Rollback

The migration does not delete old workflow instances. Previous running
instances are retained as `canceled`.

Rollback for a repaired project:

1. Cancel the newly created running workflow instance.
2. Replay the desired audited runtime with `start_workflow_instance` and
   `complete_workflow_instance_node`.
3. Upsert `workflow_subject_states` from the active runtime instance.

## Verification

Pre-apply migration status check:

```bash
set -a; source .env.local; set +a; npx supabase migration list
```

Observed before applying this repair:

- `20260612133000` is local-only on the remote migration list.
- `20260612143000` is local-only on the remote migration list.
- `20260612143000_drop_legacy_state_machine_objects.sql` is destructive and
  has explicit readiness preconditions, so it must not be applied implicitly as
  part of this repair.

Because Supabase CLI does not support applying only one selected remote
migration, the repair migration should be applied after the existing migration
history drift is resolved deliberately.

After applying the migration:

```bash
supabase migration list
bun --env-file=.env run workflow:project-source-check --project-id 2d710a84-1045-4750-8dfd-51a0f463a4db
bun --env-file=.env run workflow:project-source-check --all-active-construction
```

Expected for `2d710a84-1045-4750-8dfd-51a0f463a4db`:

- `workflow_current_node_key = payment_stage_2`
- `construction_stages.current_stage` does not show `tiling`
- `payment_stage_2` remains pending until a confirmed `stage_2` payment exists
