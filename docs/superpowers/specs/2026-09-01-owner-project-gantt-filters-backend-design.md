# Owner Project Gantt Filters Backend Design

## Goal

Extend `GET /tenant-owner/daily-dashboard/projects/gantt` with full-dataset
keyword, schedule-window, timezone, and risk filters while preserving its
response, permission, tenant-isolation, and pagination contracts.

## Query Contract

- `keyword`: optional, trimmed, at most 100 characters. It matches project
  name, customer name, project address, property community/building, project
  code when available, and active primary project member names.
- `window_start` and `window_end`: optional `YYYY-MM-DD` inclusive range. They
  must be provided together and `window_start <= window_end`.
- `timezone`: optional IANA timezone, default `Asia/Shanghai`.
- `risk`: optional `delayed | blocked | unscheduled`.
- Existing `page` and `pageSize` behavior remains unchanged.

All supplied filters are intersected. Invalid query input returns the existing
Zod-wrapped HTTP 400 response.

## Data And Filtering

A migration-managed stable SQL RPC performs tenant/status scoping, filtering,
exact counting, deterministic `updated_at DESC, id DESC` ordering, and range
pagination in one database call. The API never loads an unbounded project set.

The RPC derives workflow candidates from the latest project workflow runtime
and its immutable version snapshot:

- schedule-window: a procedure assignment overlaps the inclusive date range;
- delayed: a non-completed/non-canceled assignment ends before the business
  date resolved in the requested timezone;
- unscheduled: a current or pending procedure node has no assignment with both
  planned start and end dates;
- blocked: a completed acceptance-required procedure does not have a
  customer-confirmed acceptance.

Start/end and non-procedure technical nodes are excluded from schedule/risk
matching. These rules use the same normalized assignment and acceptance data
that supplies the returned timeline.

## API Boundaries

The controller validates query parameters. The service asserts tenant context
and `dashboard.read`, resolves the timezone business date, calls the repository
RPC, then batch-loads workflow progress only for the current page. The response
shape is unchanged.

When a workflow-dependent filter is present, RPC/workflow failures are hard
errors. The service must not return an unfiltered 200 response. Without a
workflow-dependent filter, the existing `partial_errors` fallback remains.

## Performance

The migration adds only indexes justified by the RPC predicates. Tenant,
subject, project, status, node, assignment-date, project-member, and acceptance
lookups remain bounded. The RPC returns at most 100 project rows plus a window
count; current-page workflow loading remains batched.

## Verification

Tests cover schema validation, controller forwarding, repository RPC mapping,
service hard-failure behavior, response compatibility, filter intersection,
inclusive date boundaries, risk definitions, exact totals, stable pagination,
and tenant/permission isolation. Migration SQL receives contract tests and is
applied to the local Supabase database when available before dev deployment.

## Rollback

Application rollback restores the previous repository call. Database rollback
drops the new RPC and its dedicated indexes. No source tables or historical
data are modified.
