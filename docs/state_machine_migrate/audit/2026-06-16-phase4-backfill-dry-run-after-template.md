# State Machine Runtime Backfill Report

- tenant_id: 3eebca47-961f-4899-b976-a3d3208d326b
- mode: dry-run
- generated_at: 2026-06-16T03:31:51.751Z
- scanned: 7

## Summary

| key | count |
| --- | ---: |
| customer.dry_run_create | 2 |
| customer.skip.running_instance_exists | 1 |
| expense_request.dry_run_create | 1 |
| project.dry_run_create | 3 |

## Skipped Or Failed Rows

| subject_type | subject_id | status | step | workflow_key | node_key | action | reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| customer | 3718dc44-0212-4f3b-b1fd-feea982af0a4 | signed |  | customer_main |  | skip | running_instance_exists |

