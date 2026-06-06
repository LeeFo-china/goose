---
name: admin-design
description: |
  Apply Gooes admin console design standards inspired by TDesign React Starter,
  adapted to the existing Next.js + shadcn/Radix + Tailwind stack. Use when
  designing, reviewing, or implementing admin后台 pages, dashboards, forms,
  tables, cards, ops panels, settings pages, and other middle/back-office UI.
---

# Admin Design

Use this skill to keep `apps/admin` visually consistent, quiet, scannable, and work-focused.
This is a design-language skill, not a request to install or migrate to TDesign React.

## Stack Boundary

- Keep using this repository's existing admin stack: Next.js, shadcn/ui, Radix, Tailwind, lucide-react.
- Do not add `tdesign-react` unless the user explicitly asks for a technical migration.
- Translate TDesign Starter principles into the local shadcn/Tailwind component system.

## Workflow

1. Inspect nearby admin pages/components before editing.
2. Use existing `components/ui/*` and local admin patterns first.
3. Apply the middle/back-office rules below.
4. Verify responsive layout, text fit, empty/loading/error states, and no card nesting.
5. For substantial UI changes, run `pnpm --dir apps/admin check` and inspect in browser when feasible.

## Core Rules

- Layout: left navigation + top bar + content area; content uses restrained page padding and predictable section spacing.
- Color: prefer neutral surfaces and TDesign-like token roles: brand blue, semantic success/warning/error, layered text colors.
- Typography: system font stack, 14px body, compact headings, no hero-scale text inside admin panels.
- Cards: use cards for repeated items, tool panels, dashboards, and modals; avoid cards inside cards.
- Forms: group fields, align labels consistently, use select/search/selectors for structured choices, keep primary actions obvious.
- Tables: provide toolbar, filters/search, selection feedback, status tags, fixed action column when useful.
- Dashboard: KPI cards, charts, rank/list tables, and summaries should optimize scanning over decoration.
- Icons: use `lucide-react` icons for actions and states; icons support recognition, not decoration.
- Avoid: marketing hero layouts, decorative gradients/orbs, oversized rounded cards, one-note purple/blue palettes, dense unexplained text blocks.

## References

Read only the relevant reference for the task:

- `references/tdesign-admin-principles.md`: visual language, tokens, layout, dashboard/form/table patterns.
- `references/shadcn-mapping.md`: how to translate those principles to this repository's shadcn/Tailwind admin stack.
