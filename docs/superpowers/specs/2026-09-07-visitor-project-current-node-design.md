# Visitor Project Current Node Design

## Goal

`GET /front/projects` must return a public-safe `display_status_label` for every
project. A running project uses its current workflow node title, such as
`拆改` or `水电`; projects without a usable current node fall back to the
existing project status label.

## Scope

- Keep the existing endpoint, pagination, ordering, visibility checks, and
  audience isolation unchanged.
- Add only `display_status_label: string | null` to each public list item.
- Do not expose workflow tasks, assignees, actions, internal node keys, or a
  complete workflow projection.
- Do not change `/front/projects/:id` or visitor following-project responses in
  this iteration.

## Data Flow

1. Load or reuse the cached public project page containing project base data
   and public assignee fields.
2. Extract at most 100 `(tenant_id, project_id)` pairs from that page.
3. Query `workflow_subject_states` for those exact tenant/project pairs in
   chunks of 25, with at most four bounded queries running in parallel.
4. Match results back by tenant and project ID.
5. Build the public label from the current state and return a new row object.

The workflow-state enrichment runs after every cache hit, cache miss, and
in-flight request reuse. The base project page remains cached, but current node
labels do not. Therefore a workflow transition from `拆改` to `水电` is visible
on the next request even when `projects.status` remains `constructing`.

## Label Rules

1. For a running workflow, use a trimmed non-empty `current_node_title`.
2. Never expose terminal implementation values such as node key `end` or title
   `结束` as a current construction node.
3. For a completed workflow, return `已完成`.
4. Otherwise use the label in `ProjectStatusConfig` for the project's current
   business status.
5. If neither source is usable, return `null`.

## Performance And Isolation

- Public list `pageSize` remains capped at 100.
- Enrichment performs at most four bounded repository queries per response,
  not one query per project or tenant. Each query contains no more than 25
  exact pairs so the PostgREST request URL stays within proxy limits.
- The repository filters by `subject_type=project` and an exact OR-of-AND set
  of requested tenant/project pairs, then the service verifies both IDs again
  while joining results.
- The existing workflow subject-state uniqueness/indexing is reused; no schema
  migration is required.

## Verification

- Unit tests cover running node labels, terminal/completed handling, status
  fallback, and tenant-safe matching.
- A public-cache test proves a cached project page can return `拆改` and then
  `水电` on consecutive requests without invalidating the base cache.
- A development database boundary smoke covers 100 exact tenant/project pairs
  to verify the chunked PostgREST requests do not exceed proxy URL limits.
- Run targeted Bun tests, API build, and a development endpoint smoke using a
  visitor session when credentials are available.
