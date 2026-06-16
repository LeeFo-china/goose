# State Machine Runtime Backfill Report

- tenant_id: 3eebca47-961f-4899-b976-a3d3208d326b
- mode: apply
- generated_at: 2026-06-16T03:32:54.471Z
- scanned: 7

## Summary

| key | count |
| --- | ---: |
| customer.create | 2 |
| customer.skip.running_instance_exists | 1 |
| expense_request.create | 1 |
| project.create | 3 |

## Skipped Or Failed Rows

| subject_type | subject_id | status | step | workflow_key | node_key | action | reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| customer | 3718dc44-0212-4f3b-b1fd-feea982af0a4 | signed |  | customer_main |  | skip | running_instance_exists |

