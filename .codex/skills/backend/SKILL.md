---
name: backend
description: Use this skill when building or improving backend-connected admin management pages with Next.js and shadcn/ui, especially when the user asks for an admin template, CRUD console, shadcn Data Table, shadcn Form, react-hook-form, Zod validation, list filtering, pagination, row actions, or front-end pages that consume backend REST APIs. This skill should trigger for admin pages such as employees, customers, projects, permissions, expenses, cameras, roles, approvals, and other operational back-office workflows, even if the user only says “完善页面”, “实现 CRUD”, “加数据表格”, or “用 shadcn 表单”.
---

# Backend Admin UI Skill

Build production-grade admin console pages that connect to backend APIs using Next.js, shadcn/ui, TanStack Table, React Hook Form, and Zod.

This skill is for operational CRUD and workflow pages. Treat the first screen as the usable admin tool, not a marketing page.

## Source Of Truth

When current API details matter, inspect the local codebase first:

- Existing admin app structure, routes, components, and styling conventions.
- Backend controllers, services, schemas, response envelope, and auth proxy.
- Existing table, dialog, filter, pagination, loading, error, and empty-state patterns.

For shadcn/ui implementation choices, align with official shadcn guidance:

- Admin/dashboard layout: use shadcn Blocks such as `dashboard-01` as the baseline pattern when starting a new admin shell.
- Data table: build from shadcn `<Table />` plus `@tanstack/react-table`; keep tables customized per resource rather than forcing one over-generic table abstraction.
- Forms: use React Hook Form with Zod validation; use shadcn form/field primitives for accessible labels, descriptions, invalid states, and errors.

## Default Stack

Use this stack unless the repo clearly uses another established pattern:

- Next.js App Router.
- TypeScript.
- shadcn/ui components.
- Tailwind CSS.
- `@tanstack/react-table` for rich data tables.
- `react-hook-form`, `@hookform/resolvers/zod`, and `zod` for forms.
- lucide-react icons for buttons and row actions.

## Workflow

1. Inspect the existing admin and backend patterns before editing:
   - `apps/admin/app`
   - `apps/admin/components`
   - `apps/admin/lib`
   - backend route/controller/schema/service files for the target resource
   - `package.json` scripts and installed dependencies

2. Decide the page shape:
   - Server component page for initial list data when practical.
   - Client components for table interactivity, dialogs, forms, row actions, optimistic UI, and mutations.
   - Keep API calls behind the existing admin proxy when the app uses one, for example `/api/backend/...`.

3. Implement the admin shell or page:
   - Use the shadcn admin/dashboard block style for navigation, sidebar, top bar, and content rhythm.
   - Keep operational layouts dense and scannable.
   - Avoid landing-page heroes, decorative cards, and promotional copy.

4. Implement the data table:
   - Use shadcn `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`.
   - Use TanStack Table for client-side sorting, filtering, visibility, selection, and row models when those features are local.
   - Use backend pagination, filtering, and sorting when the backend already supports those query parameters or when datasets can grow.
   - Add row actions for detail, edit, delete/disable, approve/reject, or other resource-specific actions.
   - Add loading, error, empty, and pagination states.

5. Implement forms:
   - Define a Zod schema for create/update form data.
   - Use `useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues })`.
   - Use shadcn form/field primitives with accessible labels, `aria-invalid`, field errors, and descriptions where helpful.
   - Convert nullable backend fields explicitly at the form boundary.
   - Use selects, checkboxes, switches, date inputs, and textareas according to field semantics.
   - Keep create and edit forms shared when the schemas and fields mostly overlap.

6. Wire mutations:
   - POST for create, PATCH/PUT for update, DELETE for delete or soft-delete according to backend behavior.
   - Disable submit buttons while pending.
   - Show backend error messages.
   - Refresh list data after successful mutation.
   - Confirm destructive actions.

7. Verify:
   - Run the repo’s build/typecheck command.
   - If the user or repo policy says backend/API runtime tests must happen only after commit/push, commit and push before hitting live backend endpoints.
   - Use Playwright or browser checks for layout, loading states, table behavior, and form submission flows.

## Admin Page Requirements

Every admin resource page should include the following unless the request is explicitly narrower:

- Page title and concise operational description.
- Primary action button, usually “新增”.
- Filters/search that map to backend-supported query parameters.
- Data table with stable column widths for short fields.
- No accidental text wrapping in short columns such as status, phone, date, amount, role, action, or badge columns.
- Empty state for no records.
- Error state for failed fetch.
- Loading state for client-side fetches.
- Pagination.
- Create dialog or drawer.
- Edit dialog or drawer.
- Detail dialog/drawer when row data is too large for the table.
- Delete/disable/void action with confirmation when supported.

## Data Table Pattern

Prefer this shape for rich client tables:

```tsx
"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="whitespace-nowrap">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                暂无数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

Use the pattern above as a starting point, not a rigid component for every case. Backend-connected pages often need server pagination, URL query params, and resource-specific columns.

## Column Design Rules

Make tables readable before adding features:

- Use `whitespace-nowrap` for short fields: status, phone, amount, date, count, badge, role, owner, and actions.
- Use `truncate` for long names, addresses, descriptions, and IDs.
- Give action columns enough width and use `flex-nowrap`.
- Use sticky action columns when horizontal scrolling would hide primary operations.
- Prefer badges for statuses and compact icon+text buttons for common actions.
- Keep numeric columns right-aligned when comparisons matter.
- Keep dates in a consistent format.
- Do not allow header text like “工程负责人” or action buttons to wrap into multiple lines.

## Form Pattern

Prefer this shape for shadcn + React Hook Form + Zod:

```tsx
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const formSchema = z.object({
  name: z.string().min(1, "请输入名称"),
})

type FormValues = z.infer<typeof formSchema>

export function ResourceForm({
  defaultValues,
  onSubmit,
  pending,
}: {
  defaultValues: FormValues
  onSubmit: (values: FormValues) => Promise<void> | void
  pending?: boolean
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>名称</FieldLabel>
              <Input
                {...field}
                id={field.name}
                aria-invalid={fieldState.invalid}
                disabled={pending}
              />
              {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
            </Field>
          )}
        />
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          保存
        </Button>
      </div>
    </form>
  )
}
```

If the repo uses the older shadcn `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` pattern, follow the existing repo pattern instead of mixing both styles in one app.

## Form Field Decisions

Choose controls by data shape:

- Free text: `Input`.
- Long notes/reason/address: `Textarea`.
- Enum values: `Select`.
- Boolean flags: `Switch` or `Checkbox`.
- Multi-select tags: checkbox group or token input, depending on existing components.
- Date-only values: date input or date picker, matching existing project convention.
- Money/amount: numeric input with parsing at submit boundary.
- Foreign keys: searchable select or async select when the related list can grow.

Normalize before sending to backend:

- Convert empty strings to `null` for nullable backend fields.
- Convert numeric strings to numbers.
- Trim strings.
- Preserve IDs as strings.
- Keep enum values exactly aligned with backend schema.

## API Integration Rules

Backend-connected admin pages should:

- Use the existing API client/proxy/helper before adding a new fetch wrapper.
- Respect the backend response envelope.
- Surface backend `message` to the user.
- Avoid leaking tokens to client JavaScript when the app uses HttpOnly cookies and a server/API proxy.
- Keep request payloads close to backend schema names unless a mapping layer already exists.
- Refresh or revalidate data after mutations.

## CRUD Checklist

Before calling the task done, verify:

- List loads from backend.
- Search and filters hit expected query params.
- Pagination works at boundaries.
- Create form validates and persists.
- Edit form pre-fills current values and persists.
- Delete/disable action confirms and updates the list.
- Backend errors show useful messages.
- Loading state appears for client fetches or pending mutations.
- Empty list does not look broken.
- Short table content does not wrap.
- Build/typecheck passes.

## Visual Quality Bar

For admin pages:

- Use compact, scannable layouts.
- Prefer restrained cards only for summaries, forms, dialogs, and repeated records.
- Do not nest cards inside cards.
- Do not use large decorative hero sections.
- Keep labels and buttons readable on mobile and desktop.
- Use icons inside action buttons where helpful.
- Keep table row height stable.
- Avoid one-color theme drift; follow the existing app theme.

## When To Ask For Clarification

Proceed with reasonable defaults when the backend shape can be discovered locally.

Ask only when:

- The target backend endpoint does not exist and creating one is outside scope.
- The destructive action semantics are ambiguous, for example hard delete vs soft delete.
- The user asks for permissions or workflow behavior that conflicts with existing backend rules.

## References

The shadcn guidance this skill follows:

- shadcn/ui Blocks: admin/dashboard blocks such as `dashboard-01`.
- shadcn/ui Data Table: build custom data tables with TanStack Table and shadcn `<Table />`.
- shadcn/ui React Hook Form guide: use `useForm`, `Controller`, `zodResolver`, Zod schemas, field invalid states, and accessible field errors.
