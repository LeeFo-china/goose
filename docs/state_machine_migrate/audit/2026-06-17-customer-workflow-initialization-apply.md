# State Machine Runtime Backfill Report

- tenant_id: 3eebca47-961f-4899-b976-a3d3208d326b
- mode: apply
- generated_at: 2026-06-17T03:59:34.755Z
- scanned: 4

## Summary

| key | count |
| --- | ---: |
| customer.create | 1 |
| customer.skip.instance_exists | 2 |
| customer.skip.running_instance_exists | 1 |

## Skipped Or Failed Rows

| subject_type | subject_id | status | step | workflow_key | node_key | action | reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| customer | 91844a75-93ae-4284-960a-5996524f8ad5 | signed |  | customer_main |  | skip | instance_exists |
| customer | 1d576055-f749-46b9-83d5-d8296e125c6c | signed |  | customer_main |  | skip | instance_exists |
| customer | 3718dc44-0212-4f3b-b1fd-feea982af0a4 | signed |  | customer_main |  | skip | running_instance_exists |
