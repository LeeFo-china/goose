# Customer Assignment Workflow Smoke

- date: 2026-06-17
- repository commit under test: `200eb33`
- API base URL: `http://127.0.0.1:3000`
- tenant: `3eebca47-961f-4899-b976-a3d3208d326b`
- manager account: `18800000001`
- salesperson account: `18800001002`
- salesperson employee_id: `80a9c2ff-9bbb-444b-af9c-0594f5116ff7`
- status: passed

## Purpose

Verify that a manager can create and assign a potential customer to a
salesperson, and that the salesperson can continue the customer workflow through
the task center path.

## Issues Found During Smoke

Two backend issues were found before the final passing run:

1. `start_following` used the old runtime start path. When a customer already
   had a running `potential` workflow instance, task completion updated the
   customer status but did not complete the runtime node.
2. `workflowTaskRepository.assignPendingTask()` updated Supabase rows without a
   selected response body. In this Bun/Supabase runtime, the update could apply
   in the database but leave the request unresolved, causing
   `/customers/assign-owner/batch` to hang.

Commit `200eb33` fixes both issues:

- `start_following` now completes the current `potential` runtime node.
- Customer status transitions assign the next pending customer task to the
  current customer owner.
- `assignPendingTask()` now selects `id` after update so the request returns.

## Passing HTTP Smoke

Command shape:

```bash
POST /admin/auth/login
POST /customers
POST /customers/assign-owner/batch
POST /admin/auth/login
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=customer&subject_id=<customer_id>
POST /workflow-tasks/<task_id>/complete
GET /customers/<customer_id>/detail
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=customer&subject_id=<customer_id>
```

Observed result:

```json
{
  "ok": true,
  "duration_ms": 54418,
  "customer": {
    "id": "e646e8e2-e502-49be-9118-8c2df7fed08d",
    "name": "WF接口烟测651205",
    "phone": "19171651205",
    "status_after_complete": "following",
    "owner_id": "80a9c2ff-9bbb-444b-af9c-0594f5116ff7"
  },
  "assign_result": {
    "success_count": 1,
    "failed_count": 0,
    "target_owner": {
      "id": "80a9c2ff-9bbb-444b-af9c-0594f5116ff7",
      "name": "珠珠"
    },
    "failed_items": []
  },
  "potential_task": {
    "id": "f9eb3c9c-8dea-43d8-86d1-40ef1289b124",
    "assignee_employee_id": "80a9c2ff-9bbb-444b-af9c-0594f5116ff7"
  },
  "complete_result": {
    "result": {
      "ok": true,
      "bridged": true,
      "operation": "start_following"
    },
    "customer_status": "following"
  },
  "pending_after_complete": {
    "total": 1,
    "tasks": [
      {
        "id": "d524e9e4-6689-4c20-88d9-19ceb62c7494",
        "node_key": "following",
        "status": "pending",
        "assignee_employee_id": "80a9c2ff-9bbb-444b-af9c-0594f5116ff7"
      }
    ]
  }
}
```

## Service And DB Evidence

Service-level verification used customer
`8633b724-5e9a-4b93-80c4-10aabdf53094` and completed the salesperson's
`potential` task.

Observed DB state after completion:

```json
{
  "customer": {
    "id": "8633b724-5e9a-4b93-80c4-10aabdf53094",
    "status": "following",
    "owner_id": "80a9c2ff-9bbb-444b-af9c-0594f5116ff7"
  },
  "runtime_instances": [
    {
      "id": "13499eeb-7113-4155-b76a-cfb12c0854af",
      "status": "running",
      "current_node_key": "following"
    }
  ],
  "db_tasks": [
    {
      "id": "dc17c780-a814-420e-8fe4-e041de016831",
      "node_key": "potential",
      "status": "completed",
      "assignee_employee_id": "80a9c2ff-9bbb-444b-af9c-0594f5116ff7"
    },
    {
      "id": "8d704e1a-daaa-4659-8c19-7da91569edb1",
      "node_key": "following",
      "status": "pending",
      "assignee_employee_id": "80a9c2ff-9bbb-444b-af9c-0594f5116ff7"
    }
  ]
}
```

## Verification Commands

Relevant tests were run one file per process because several files use
`mock.module` and share module names.

```bash
cd apps/api
bun test src/repositories/workflow-tasks.test.ts
bun test src/services/customer-status.test.ts
bun test src/services/customer-workflow-runtime.test.ts
bun test src/services/workflow-task-action-metadata.test.ts
bun test src/services/workflow-templates.test.ts
bun test src/scripts/workflow-runtime-backfill/plan.test.ts
bun test src/services/customer-owner-assignments.test.ts
bun test src/scripts/customer-workflow-potential-migration-content.test.ts
bun test src/scripts/workflow-runtime-backfill/cli.test.ts
bun test src/scripts/workflow-runtime-backfill/runner.test.ts
bun run typecheck
bun run build
bun run check:file-size
```

Result:

- focused tests: `24 pass`, `0 fail`;
- `bun run typecheck`: passed;
- `bun run build`: passed;
- `bun run check:file-size`: passed;
- `bun run check:file-size` from repository root: passed for API and admin;
- `git diff --check`: passed.

## Notes

The smoke created several records with names beginning `WF` and internal
`191...` phone numbers. They are test artifacts marked as deletable in names or
internal smoke naming and should not be treated as real leads.
