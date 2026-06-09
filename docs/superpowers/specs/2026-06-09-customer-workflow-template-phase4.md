# Customer Workflow Template Phase 4 Spec

## Goal

Let tenant admins create a published customer main workflow from a built-in
template, so Phase 3 customer status runtime bridging can run against a real
active `customer_main` definition.

## Scope

- Add a `customer_main` workflow template.
- Template definition:
  - workflow key: `customer_main`
  - category: `sales`
  - nodes: `start`, `following`, `arrived`, `designing`, `signed`, `end`
  - business node kinds: `phone_follow_up`, `store_visit`, `design`, `contract`
  - linear edges in that order.
- Create the definition, save its draft graph, and publish it in one backend
  operation.
- Add an Admin list-page action to create and publish the customer main flow.
- Keep existing manual workflow creation unchanged.

## Non-Goals

- No database migration in this phase.
- No runtime condition routing changes.
- No miniprogram/orange changes.
- No automatic overwrite of an existing `customer_main` workflow.

## Error Behavior

- Existing workflow key conflicts return the existing workflow key conflict
  error from the workflow definition creation path.
- If graph save or publish fails after the definition is created, the tenant may
  still have a draft workflow; the error is surfaced to Admin so it can be fixed
  in the designer.
