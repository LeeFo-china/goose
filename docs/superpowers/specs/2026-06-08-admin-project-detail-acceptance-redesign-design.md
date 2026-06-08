# Admin Project Detail And Acceptance Redesign

## Context

The current admin project detail experience is a modal opened from `/projects`. It contains overview, members, logs, and process acceptance tabs inside an `88vh` dialog. The process acceptance workflow already has meaningful client-side modules (`ProjectAcceptancesPanel`, sidebar, detail view, state hook, API helpers), but the modal container makes the workflow crowded and weakens project context.

This redesign upgrades tenant-side project detail into a standalone page and makes process acceptance the default work area.

## Goals

- Replace the project detail modal as the primary detail experience with `/projects/[id]`.
- Make process acceptance easy to scan, start, fill, review, reject, approve, and notify customers from one page.
- Preserve project context while users handle acceptance tasks.
- Reuse existing acceptance business logic and API helpers where possible.
- Keep the Gooes Admin design language: compact, operational, restrained yellow/black identity, semantic status states.

## Non-goals

- Do not change backend APIs.
- Do not redesign the project status machine or acceptance business rules.
- Do not redesign construction logs into a full stage pipeline in this pass.
- Do not change the upload protocol.
- Do not introduce a new design system or component library.

## Chosen Approach

Use the **acceptance-first workbench** direction.

The project detail page is a standalone route with a fixed project dossier on the left and a large work area on the right. The default tab is `acceptances`. Other project modules remain accessible, but the first version optimizes for the process acceptance workflow.

## Page Architecture

### Route

Add a tenant-side route:

```text
/projects/[id]
```

The page should support tab state through the URL:

```text
/projects/[id]?tab=acceptances
/projects/[id]?tab=logs
/projects/[id]?tab=members
/projects/[id]?tab=overview
```

If the tab is missing or invalid, default to `acceptances`.

Support direct acceptance selection in the first implementation:

```text
/projects/[id]?tab=acceptances&acceptanceId=<id>
```

If `acceptanceId` is invalid or no longer visible in the loaded acceptance list, fall back to the first available acceptance record.

### Layout

Use a two-column product layout on desktop:

- Left rail: project dossier and module navigation.
- Main content: active work area.

The left rail should show:

- Project name.
- Customer and phone visibility as currently permitted by data.
- Property summary and location status.
- Project status and current stage.
- Designer, supervisor, and key members when available.
- Important blockers or missing context.
- Navigation entries: `工序验收`, `施工日志`, `成员/状态`, `总览`.

The main content should default to the process acceptance work area. The top of the main content should be compact, not hero-like:

- Current module title.
- Stage/acceptance summary.
- Primary action for the current state.
- Refresh or secondary actions when useful.

### Responsive Behavior

Desktop:

- Two-column layout.
- Acceptance work area may use a nested split layout for stage list and detail content.

Tablet and narrow screens:

- Project dossier collapses above the content or into a compact navigation drawer.
- Acceptance stage list stacks above detail or becomes a collapsible panel.
- Primary actions remain visible near the acceptance title.

Text must not overflow project names, stage labels, buttons, tabs, or badges.

## Acceptance Work Area

### Stage And Record List

The acceptance navigation should separate completion acceptance from normal process acceptance:

- `竣工交付验收` has its own block with template and start actions.
- `工序验收` lists stage-based records and available stages.

Each stage/record row should show:

- Stage or acceptance title.
- Status badge.
- Updated time.
- Item count where available.
- Disabled or blocked reason when the stage cannot be started.

The current available action should be attached to the relevant stage or block. Avoid a detached global "发起验收" button that leaves users guessing which scope it applies to.

### Acceptance Detail

The selected acceptance detail should have a sticky or stable title bar:

- Acceptance title.
- Final/process badge when needed.
- Status badge.
- Statistics: total, passed, failed, pending.
- Initiator, reviewer, updated time.
- Latest reject reason or customer dispute summary.

Primary actions are determined by status:

- Draft/rejected: delete draft, save draft, submit acceptance.
- Submitted: return for rectification, approve.
- Leader approved: send or resend customer notification.

`can_submit=false` and `blocked_reason` should appear close to the submit action and remain visible in the content area as a `StatusAlert`.

### Acceptance Items

Acceptance items stay grouped by sections, but the visual treatment should become more compact:

- Section headers show section title, description, and item count.
- Item rows show title, result badge, category, required/photo-required tags, standard, remark, and images.
- Editable controls remain close to the item they affect.
- Result, remark, normal photos, rectification remark, and rectification photos remain supported.

Avoid a heavy card stack. Use borders, dividers, compact spacing, and semantic badges to preserve scanability.

### Context And Timeline

Use a right-side context area on wide screens when space allows. It should contain:

- Acceptance operation timeline.
- Customer notification state.
- Latest customer dispute.
- Latest leader rejection reason.

On narrow screens, this context moves below the detail content or into a collapsible panel.

## Empty, Loading, Error, And Permission States

Loading:

- Use skeletons for stage list and detail content.
- Avoid a single centered spinner for the whole page when partial content is already known.

Empty:

- If there are no acceptance records, show the first available stage and why it can or cannot be started.
- If final acceptance is blocked, show the exact blocker.
- If no template exists for final acceptance, keep the template action visible and explain the missing template.

Errors:

- Network and server errors stay as `StatusAlert` near the affected area.
- Validation and blocked-state errors should be attached to the action or panel that caused them.
- Existing handling for normal backend errors must remain unchanged.

Permissions:

- Unavailable actions should be disabled with visible reasons where the backend data provides them.
- Do not hide the whole workflow when only one action is unavailable.

## Technical Design

### New Route And Shell

Add:

```text
apps/admin/app/(console)/projects/[id]/page.tsx
```

This server component loads the project detail using the existing backend request pattern used by `/projects`.

Add a client component such as:

```text
apps/admin/components/projects/project-detail-page-client.tsx
```

Responsibilities:

- Manage active tab from URL.
- Render the left project dossier.
- Render the active work area.
- Coordinate project refresh and child panel refresh without forcing full-page churn.

### Acceptance Component Refactor

Reuse existing acceptance modules but make the container page-aware:

- Keep API helpers in `project-acceptances-panel-api.ts`.
- Keep business state orchestration in `useProjectAcceptancesPanel`.
- Move layout-specific concerns out of the hook.
- Split current sidebar/detail into smaller presentational units as needed:
  - acceptance stage list
  - final acceptance block
  - acceptance detail header
  - acceptance item section list
  - acceptance context/timeline panel

The existing `ProjectAcceptancesPanel` can either:

- Remain as the dialog compatibility component during migration.
- Share API helpers, state derivation, and smaller presentational pieces with the new page workbench where doing so stays simple.

The new standalone page should not be forced through a `variant="dialog" | "page"` abstraction unless that abstraction removes real duplication.

### Project List Entry

Update project list row actions:

- "详情" navigates to `/projects/[id]`.
- "工序验收" can navigate to `/projects/[id]?tab=acceptances`.
- Project create/edit still uses the existing project form dialog.

The old detail dialog can remain during the migration if any caller still depends on it, but it should no longer be the primary path.

### Other Tabs

First pass tabs:

- `acceptances`: full workbench.
- `logs`: existing construction stage summary and logs panel adapted to page height.
- `members`: existing member list and add-member flow adapted to page layout.
- `overview`: property location, status panel, and project summary.

Do not expand these secondary tabs beyond what is needed to preserve current capability.

## Design Rules

Follow `PRODUCT.md` and `DESIGN.md`:

- Compact operational layout.
- No marketing hero section.
- No dark control-room dashboard treatment.
- No decorative card stacks or nested cards for ordinary sections.
- Gooes yellow only for active state, focus, and primary attention.
- Use existing shadcn/Radix/Tailwind/lucide primitives.
- Keep status communication semantic and not color-only.

## Verification

Required checks after implementation:

- `pnpm --dir apps/admin check`
- Browser check for `/projects` to `/projects/[id]` navigation.
- Browser check for `/projects/[id]?tab=acceptances`.
- Desktop and narrow-width layout inspection.
- Verify loading, empty, blocked, disabled, and error states where they are reachable.

E2E coverage should be updated or added for:

- Project list opens standalone detail page.
- Acceptance tab/workbench is visible.
- Existing admin smoke behavior around opening process acceptance remains covered through the new path.

## Migration Decisions

- `acceptanceId` is part of the first implementation. Invalid IDs fall back to the first available acceptance.
- `ProjectDetailDialog` stays temporarily for compatibility, but project list detail entry points move to the standalone page.
