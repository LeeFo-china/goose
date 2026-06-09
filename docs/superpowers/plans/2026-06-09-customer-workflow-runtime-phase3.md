# Customer Workflow Runtime Phase 3 Plan

## Steps

1. Add a runtime instance subject filter to workflow repository/service query
   inputs.
2. Add a customer workflow runtime bridge service that:
   - finds active `customer_main` or `sales_main` definitions,
   - starts customer runtime instances on `start_following`,
   - advances running instances on supported status actions,
   - returns structured sync metadata.
3. Wire the bridge into:
   - `CustomerStatusService.transitionCustomerStatus`,
   - project signing customer status sync.
4. Run API type check, admin check, migration list, and targeted smoke where
   credentials/environment allow.

## Acceptance

- Existing customer status transitions still work when no workflow is published.
- Published customer/sales workflow instances can be started and advanced by
  customer status actions.
- Status transition logs include `workflow_runtime` metadata for started,
  advanced, skipped, or failed runtime sync.
- No database migration is introduced for this phase.
