# Customer Workflow Initialization Verification

- date: 2026-06-17
- generated at: 2026-06-17T12:04:05+08:00
- repository commit under test: `4e9c3f3`
- target tenant: `3eebca47-961f-4899-b976-a3d3208d326b`
- backfilled customer: `2327ae27-658a-4db3-aef5-9d69e0eab37c`
- migration: `20260617173000_add_customer_potential_workflow_node.sql`
- status: customer workflow initialization applied and verified at API/runtime level

## Scope

This verification covers the backend path needed for a manager to assign a
potential customer and for the assigned salesperson to continue the workflow
from `potential` to `following`.

Implemented scope:

- customer workflow template includes `potential` before `following`;
- active Supabase `customer_main` definitions missing `potential` were upgraded
  through a migration-created published workflow version;
- new customer creation initializes workflow runtime without changing customer
  status;
- existing state-machine customer rows can be backfilled by subject type;
- owner assignment syncs the current pending customer workflow task to the new
  owner;
- `potential` customer tasks expose `start_following` and `mark_invalid`
  actions.

This run did not perform a live manager reassignment on production-like business
data. The existing pending task is assigned to the current owner. The reassignment
path is covered by the focused owner-assignment service test and should be
verified in the next manual/API smoke with a dedicated test customer.

## Commits In Scope

| commit | subject |
| --- | --- |
| `59e63f4` | `fix(customer): 同步负责人客户待办` |
| `85bbd7e` | `docs(workflow): 增加客户初始化计划` |
| `f014cc9` | `fix(workflow): 补齐潜在客户任务动作` |
| `01f5a8a` | `fix(workflow): 客户主流程增加潜在节点` |
| `b16a863` | `fix(workflow): 修正潜在客户回填节点` |
| `16976f5` | `fix(workflow): 迁移补齐客户潜在节点` |
| `04f8256` | `fix(customer): 新建客户同步初始化流程` |
| `4e9c3f3` | `chore(workflow): 支持按主体回填流程` |

## Migration Verification

The migration was dry-run before apply. The dry-run showed only the intended
local migration:

```text
20260617173000_add_customer_potential_workflow_node.sql
```

The migration was applied with:

```bash
set -a
source /Users/leefo/Public/work/gooes/.env.local
set +a
supabase db push --yes
```

Apply result:

```text
Applying migration 20260617173000_add_customer_potential_workflow_node.sql...
Finished supabase db push.
```

Post-apply migration status:

```bash
set -a
source /Users/leefo/Public/work/gooes/.env.local
set +a
supabase migration list | tail -n 20
```

Observed final row:

```text
20260617173000 | 20260617173000 | 2026-06-17 17:30:00
```

## Backfill Verification

Customer-only dry-run:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local \
  src/scripts/backfill-workflow-runtime-from-state-machine.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --subject-type customer \
  --dry-run \
  --report /Users/leefo/Public/work/gooes/docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-dry-run.md
```

Result:

```json
{
  "apply": false,
  "scanned": 4,
  "summary": {
    "customer.skip.instance_exists": 2,
    "customer.skip.running_instance_exists": 1,
    "customer.dry_run_create": 1
  }
}
```

Customer-only apply:

```bash
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env.local \
  src/scripts/backfill-workflow-runtime-from-state-machine.ts \
  --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b \
  --subject-type customer \
  --apply \
  --report /Users/leefo/Public/work/gooes/docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-apply.md
```

Result:

```json
{
  "apply": true,
  "scanned": 4,
  "summary": {
    "customer.skip.instance_exists": 2,
    "customer.skip.running_instance_exists": 1,
    "customer.create": 1
  }
}
```

Audit reports:

- `docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-dry-run.md`
- `docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-apply.md`

## Runtime Evidence

Read-only query after apply confirmed the backfilled customer has a running
workflow instance at `potential` and a pending task on the same node.

```json
{
  "instances": [
    {
      "id": "c23cf757-5109-4ffa-92c0-52ebb2ef8719",
      "status": "running",
      "current_node_key": "potential",
      "version_id": "16f61371-629c-4c96-9d56-f78a8993bc86"
    }
  ],
  "tasks": [
    {
      "id": "c1ccd538-a2e9-4fab-bdc6-497a0fa25941",
      "instance_id": "c23cf757-5109-4ffa-92c0-52ebb2ef8719",
      "node_key": "potential",
      "status": "pending",
      "assignee_employee_id": "d8ecc522-e6a1-49d6-b7b7-aaa0f3084826",
      "title": "潜在客户"
    }
  ]
}
```

## Static Verification

Focused API tests:

```bash
cd apps/api
bun test \
  src/services/workflow-task-action-metadata.test.ts \
  src/services/workflow-templates.test.ts \
  src/scripts/workflow-runtime-backfill/plan.test.ts \
  src/services/customer-workflow-runtime.test.ts \
  src/services/customer-owner-assignments.test.ts \
  src/scripts/customer-workflow-potential-migration-content.test.ts \
  src/scripts/workflow-runtime-backfill/cli.test.ts \
  src/scripts/workflow-runtime-backfill/runner.test.ts
```

Result:

```text
19 pass
0 fail
47 expect() calls
```

API checks:

| command | result |
| --- | --- |
| `cd apps/api && bun run typecheck` | passed |
| `cd apps/api && bun run build` | passed, bundled `866` modules |
| `cd apps/api && bun run check:file-size` | passed |
| `git diff --check` | passed |
| `bun run check:file-size` | passed for API and admin file-size checks |

## Next Manual Smoke

Use a dedicated test customer for the remaining business smoke:

1. Manager creates or selects a `potential` customer.
2. Manager assigns the customer to a salesperson.
3. Confirm the pending `potential` workflow task is assigned to that salesperson.
4. Salesperson opens task center, enters the customer task, and completes
   `start_following`.
5. Confirm the old pending task disappears and the customer workflow advances to
   `following`.

This final smoke should be recorded separately because it intentionally changes
business ownership and workflow state.
