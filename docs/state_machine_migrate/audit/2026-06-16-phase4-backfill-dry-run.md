# State Machine Runtime Backfill Report

- tenant_id: 3eebca47-961f-4899-b976-a3d3208d326b
- mode: dry-run
- generated_at: 2026-06-16T03:26:04.977Z
- scanned: 7

## Summary

| key | count |
| --- | ---: |
| customer.dry_run_create | 2 |
| customer.skip.running_instance_exists | 1 |
| expense_request.skip.active_workflow_definition_missing | 1 |
| project.skip.active_workflow_definition_missing | 3 |

## Skipped Or Failed Rows

| subject_type | subject_id | status | step | workflow_key | node_key | action | reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| customer | 3718dc44-0212-4f3b-b1fd-feea982af0a4 | signed |  | customer_main |  | skip | running_instance_exists |
| project | 634ff402-ff84-4541-aa7c-3cdcd4fd5460 | acceptance |  | construction_main |  | skip | active_workflow_definition_missing |
| project | 54f11aa5-09a8-4410-a9c5-604a7fe9e09c | constructing |  | construction_main |  | skip | active_workflow_definition_missing |
| project | 2d710a84-1045-4750-8dfd-51a0f463a4db | constructing |  | construction_main |  | skip | active_workflow_definition_missing |
| expense_request | 464876c4-0693-447f-95a0-670901d47149 | paid | done | expense_approval |  | skip | active_workflow_definition_missing |

