# Customer Workflow Runtime Phase 3 Spec

## Goal

Connect the existing customer status machine to the workflow runtime so a tenant
can publish a customer main flow and have customer status transitions advance
that runtime instance.

## Scope

- Use the existing customer status machine as the source of truth.
- Use an active workflow definition with key `customer_main`, falling back to
  `sales_main`.
- Start a `subject_type=customer` workflow instance when a customer moves from
  `potential` to `following`.
- Advance the running workflow instance on these actions:
  - `mark_arrived`: complete node `following`.
  - `start_design`: complete node `arrived`.
  - `mark_signed`: complete node `designing`.
- Record runtime sync outcome in customer status transition log metadata.
- Keep dormant, invalid, and reactivation as status-only actions for this slice.

## Non-Goals

- Do not replace the customer status machine.
- Do not add workflow condition evaluation beyond the runtime's current first
  outgoing edge behavior.
- Do not add new database schema in this phase.
- Do not change orange/miniprogram code.

## Safety

Workflow sync is a best-effort side effect after the customer status transition
has succeeded. Missing workflow definitions or inactive definitions must not
block existing customer operations. Runtime failures are returned as structured
metadata so operators can inspect drift without losing the original status log.
