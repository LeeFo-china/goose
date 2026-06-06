# shadcn/Tailwind Mapping For Gooes Admin

This repository uses Next.js, shadcn/ui, Radix, Tailwind, and lucide-react. Keep that stack.

## Component Mapping

- TDesign `Card` -> local `Card`, `CardHeader`, `CardTitle`, `CardContent`.
- TDesign `Table` -> local table abstraction or existing table markup; preserve local data-loading patterns.
- TDesign `Tag` -> `Badge` with semantic variants or local status chip pattern.
- TDesign `Button` -> local `Button`; use `variant="ghost"` or link-style buttons for row actions.
- TDesign `Input` -> local `Input`; search inputs should include lucide `Search`.
- TDesign `Select` -> local `Select` or searchable Combobox pattern where options are large.
- TDesign `Radio.Group` -> local radio/segmented controls, depending on existing page conventions.
- TDesign `DatePicker` -> existing date picker pattern in the repo; do not introduce a new date library casually.
- TDesign icon usage -> lucide-react icons.

## Tailwind Token Translation

Use local CSS variables and Tailwind semantic classes first:

- Brand: `primary`, `ring`, `accent` where locally configured.
- Text primary: `text-foreground`.
- Text secondary: `text-muted-foreground`.
- Surface: `bg-background`, `bg-card`, `bg-muted`.
- Border: `border-border`.
- Error: `destructive` classes.

If exact TDesign colors are needed for a new admin theme proposal, prefer adding semantic variables rather than hardcoding scattered hex values.

## Page Shell

Preferred structure:

```tsx
<div className="space-y-4 p-6">
  <PageHeader />
  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" />
  <section className="grid gap-4 xl:grid-cols-3" />
</div>
```

Keep pages dense but breathable:

- `gap-4` for dashboard grids.
- `p-6` for page padding or card content where local patterns allow.
- Avoid full-screen marketing sections.

## Cards

Use cards for:

- KPI items.
- Repeated list items.
- Dashboard chart panels.
- Forms or tool panels.
- Modals/dialog content.

Avoid:

- Cards wrapping page sections that already contain cards.
- Decorative nested cards.
- Oversized rounded corners.

## Forms

Recommended layout:

```tsx
<Card>
  <CardHeader>
    <CardTitle>基础信息</CardTitle>
  </CardHeader>
  <CardContent className="grid gap-4 md:grid-cols-2">
    {/* fields */}
  </CardContent>
</Card>
```

Rules:

- Labels above fields unless nearby pages use a different convention.
- Use 2 columns on desktop for related fields; full width for textareas and long descriptions.
- Keep action rows compact with primary first.
- Use loading/disabled states during submit.

## Tables

Recommended pattern:

```tsx
<div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2">{/* actions */}</div>
    <div className="flex items-center gap-2">{/* search/filter */}</div>
  </div>
  <DataTable />
</div>
```

Rules:

- Toolbar before table.
- Selected count visible when selection exists.
- Search on the right where space allows.
- Status displayed as badges, not plain text.
- Row actions stay compact and predictable.

## Dashboard

Translate TDesign Starter dashboard into local primitives:

- KPI row: `grid gap-4 md:grid-cols-2 xl:grid-cols-4`.
- Chart row: primary chart spans 2 columns; secondary chart/list occupies 1 column on wide screens.
- Rank/list panels use cards with small header actions.
- KPI icon circles may use light primary background and primary icon color.

## Review Checklist

- Does the page look operational rather than promotional?
- Are colors semantic and restrained?
- Is hierarchy clear at a glance?
- Are table/form controls discoverable without explanatory copy?
- Does text fit on mobile and desktop?
- Are loading, empty, disabled, and error states present where needed?
- Does the implementation reuse local components and patterns?
