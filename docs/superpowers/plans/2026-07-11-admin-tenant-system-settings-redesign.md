# Admin Tenant System Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tenant-only system settings workspace that is simpler to scan and operate while preserving the existing platform settings experience and backend behavior.

**Architecture:** Keep the server page responsible for data loading and mode selection. Extract shared group typing, render a dedicated tenant header and client-side workspace only for tenant sessions, and keep the existing `SettingsTabs` path for platform sessions. Move tenant SMS behavior into a focused component so the platform settings component no longer owns tenant-only interaction logic.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, shadcn/ui on Radix, Tailwind CSS 3, Bun tests, Playwright browser verification.

---

## File map

- Create `apps/admin/components/settings/settings-group-types.ts`: shared `SettingsGroup` contract used by server and client components.
- Create `apps/admin/components/settings/settings-page-header.tsx`: separate tenant and platform page headers.
- Create `apps/admin/components/settings/tenant-sms-settings-panel.tsx`: tenant SMS channel selection and progressive field disclosure.
- Create `apps/admin/components/settings/tenant-settings-workspace.tsx`: tenant-only responsive navigation and settings content.
- Create `apps/admin/components/settings/tenant-settings-workspace.test.ts`: static contract tests for mode isolation and tenant UX copy.
- Modify `apps/admin/app/(console)/settings/page.tsx`: keep data loading, branch platform and tenant rendering.
- Modify `apps/admin/components/settings/settings-tabs.tsx`: retain platform workspace and remove tenant-only SMS logic.
- Modify `apps/admin/app/(console)/settings/loading.tsx`: align route loading skeleton with the compact settings workspace.
- Modify `apps/admin/components/settings/settings-localization.test.ts`: update header assertions without weakening platform localization coverage.

### Task 1: Establish tenant and platform rendering contracts

**Files:**
- Create: `apps/admin/components/settings/tenant-settings-workspace.test.ts`
- Modify: `apps/admin/components/settings/settings-localization.test.ts`

- [ ] **Step 1: Write the failing mode-isolation tests**

Create `tenant-settings-workspace.test.ts` with source-level tests matching the repository's existing Bun test pattern:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("tenant settings workspace", () => {
  test("renders a dedicated workspace only for tenant mode", () => {
    const pageSource = readSource("../../app/(console)/settings/page.tsx");

    expect(pageSource).toContain("TenantSettingsWorkspace");
    expect(pageSource).toContain("TenantSettingsHeader");
    expect(pageSource).toContain("PlatformSettingsHeader");
    expect(pageSource).toContain("isPlatformMode ?");
  });

  test("uses operational tenant copy and progressive SMS disclosure", () => {
    const headerSource = readSource("./settings-page-header.tsx");
    const workspaceSource = readSource("./tenant-settings-workspace.tsx");
    const smsSource = readSource("./tenant-sms-settings-panel.tsx");

    expect(headerSource).toContain("管理本租户使用的短信服务和客服入口");
    expect(headerSource).toContain("配置已就绪");
    expect(workspaceSource).toContain("短信配置");
    expect(workspaceSource).toContain("客服配置");
    expect(smsSource).toContain("继承平台短信通道");
    expect(smsSource).toContain("自有阿里云短信通道");
    expect(smsSource).toContain("自有腾讯云短信通道");
  });

  test("keeps platform-only panels out of the tenant workspace", () => {
    const tenantSource = readSource("./tenant-settings-workspace.tsx");

    expect(tenantSource).not.toContain("PlatformPaymentSettingsPanel");
    expect(tenantSource).not.toContain("SocialVideoTranscriptionTester");
    expect(tenantSource).not.toContain("TencentLbsConfigTester");
  });
});
```

- [ ] **Step 2: Update the existing header contract**

Replace the old tenant-agnostic metric assertion in `settings-localization.test.ts` with assertions that the metric component lives in the platform header while tenant copy lives in the tenant header:

```ts
test("separates platform metrics from the tenant header", () => {
  const source = readSource("./settings-page-header.tsx");

  expect(source).toContain("PlatformSettingsHeader");
  expect(source).toContain("SettingsHeaderMetric");
  expect(source).toContain('label="配置项"');
  expect(source).toContain('label="未配置"');
  expect(source).toContain("TenantSettingsHeader");
  expect(source).toContain("管理本租户使用的短信服务和客服入口");
});
```

- [ ] **Step 3: Run tests and verify the expected failure**

Run:

```bash
bun test apps/admin/components/settings/tenant-settings-workspace.test.ts apps/admin/components/settings/settings-localization.test.ts
```

Expected: FAIL because the three tenant components and mode-separated headers do not exist yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add apps/admin/components/settings/tenant-settings-workspace.test.ts apps/admin/components/settings/settings-localization.test.ts
git commit -m "test(admin): 定义租户配置页重构契约"
```

### Task 2: Separate shared types and page headers

**Files:**
- Create: `apps/admin/components/settings/settings-group-types.ts`
- Create: `apps/admin/components/settings/settings-page-header.tsx`
- Modify: `apps/admin/app/(console)/settings/page.tsx`
- Modify: `apps/admin/components/settings/settings-tabs.tsx`

- [ ] **Step 1: Add the shared group contract**

Create `settings-group-types.ts`:

```ts
import type { SystemSetting } from "@/components/settings/settings-types";

export type SettingsGroup = {
  code: string;
  label: string;
  settings: SystemSetting[];
  emptyCount: number;
  secretCount: number;
};
```

Import this type in `settings-tabs.tsx` and remove its private duplicate.

- [ ] **Step 2: Create mode-specific headers**

Create `settings-page-header.tsx` using the installed `Badge` and existing Lucide icon vocabulary. The tenant header accepts `groups: SettingsGroup[]`, computes incomplete groups, and renders only one actionable status badge. The platform header receives the existing counts and renders the current five metric badges unchanged.

```tsx
import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import type { SettingsGroup } from "@/components/settings/settings-group-types";
import { Badge } from "@/components/ui/badge";

export function TenantSettingsHeader({ groups }: { groups: SettingsGroup[] }) {
  const incompleteGroupCount = groups.filter((group) => group.emptyCount > 0).length;

  return (
    <div className="flex min-w-0 shrink-0 items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
        <SlidersHorizontal aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-normal">租户系统配置</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            管理本租户使用的短信服务和客服入口。平台密钥及模板不会在租户侧展示。
          </p>
        </div>
        <Badge
          variant={incompleteGroupCount > 0 ? "warning" : "success"}
          className="w-fit"
        >
          <CheckCircle2 aria-hidden="true" />
          {incompleteGroupCount > 0
            ? `${incompleteGroupCount} 个分组待完善`
            : "配置已就绪"}
        </Badge>
      </div>
    </div>
  );
}
```

Implement `PlatformSettingsHeader` by moving the current description and all five `SettingsHeaderMetric` instances out of `page.tsx`; do not alter their labels, variants, or count semantics.

- [ ] **Step 3: Branch the server render by session mode**

In `page.tsx`, import both headers and the new tenant workspace. Keep all data fetching unchanged, then render:

```tsx
{isPlatformMode ? (
  <>
    <PlatformSettingsHeader
      totalCount={list.length}
      databaseCount={databaseCount}
      envCount={envCount}
      emptyCount={emptyCount}
      secretCount={secretCount}
    />
    {error ? <StatusAlert>{error}</StatusAlert> : null}
    <SettingsTabs
      groups={groupEntries}
      isPlatformMode
      paymentProfiles={paymentProfiles}
    />
  </>
) : (
  <>
    <TenantSettingsHeader groups={groupEntries} />
    {error ? <StatusAlert>{error}</StatusAlert> : null}
    <TenantSettingsWorkspace groups={groupEntries} />
  </>
)}
```

Remove tenant-only count calculations that are no longer rendered. Keep platform counts and the platform payment fetch gate unchanged.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
bun test apps/admin/components/settings/tenant-settings-workspace.test.ts apps/admin/components/settings/settings-localization.test.ts
```

Expected: mode/header assertions pass; workspace tests still fail only because tenant workspace files are not implemented.

- [ ] **Step 5: Commit the header split**

```bash
git add apps/admin/app/\(console\)/settings/page.tsx apps/admin/components/settings/settings-group-types.ts apps/admin/components/settings/settings-page-header.tsx apps/admin/components/settings/settings-tabs.tsx
git commit -m "refactor(admin): 分离租户与平台配置页头部"
```

### Task 3: Extract the tenant SMS interaction

**Files:**
- Create: `apps/admin/components/settings/tenant-sms-settings-panel.tsx`
- Modify: `apps/admin/components/settings/settings-tabs.tsx`

- [ ] **Step 1: Move tenant SMS behavior into a focused component**

Move `smsChannelModeLabels`, provider key sets, `findSetting`, `countMissing`, and `TenantSmsSettingsPanel` from `settings-tabs.tsx` to `tenant-sms-settings-panel.tsx`. Export only the component:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageSquareText } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { SettingEditor, updateSetting } from "@/components/settings/settings-actions";
import type { SystemSetting } from "@/components/settings/settings-types";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TenantSmsSettingsPanel({ settings }: { settings: SystemSetting[] }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="border-b px-4 py-4 sm:px-5">
        <Field>
          <FieldLabel htmlFor="tenant-sms-channel-mode">短信发送通道</FieldLabel>
          <Select value={mode} onValueChange={changeMode} disabled={pending || !modeSetting}>
            <SelectTrigger id="tenant-sms-channel-mode">
              <SelectValue placeholder="选择短信发送通道" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="platform">继承平台短信通道</SelectItem>
                <SelectItem value="tenant_aliyun">自有阿里云短信通道</SelectItem>
                <SelectItem value="tenant_tencent">自有腾讯云短信通道</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            选择平台统一通道，或使用本租户自己的短信服务商配置。
          </FieldDescription>
          {pending ? <p className="text-xs text-muted-foreground">正在保存短信发送通道...</p> : null}
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          {saved ? <StatusAlert tone="success">短信发送通道已保存</StatusAlert> : null}
        </Field>
      </section>
      {mode === "platform" ? (
        <section className="flex items-start gap-3 px-4 py-5 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <MessageSquareText aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium">当前使用平台统一短信通道</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              短信服务商、签名、模板和密钥由平台统一维护，本租户无需填写参数。
            </p>
          </div>
        </section>
      ) : (
        <section aria-label={mode === "tenant_aliyun" ? "阿里云短信参数" : "腾讯云短信参数"}>
          {configSettings.map((setting) => (
            <SettingEditor key={setting.key} setting={setting} />
          ))}
        </section>
      )}
    </div>
  );
}
```

The implementation must keep every existing SMS key and value unchanged. Use `Field` for the channel control, `SelectGroup` around all `SelectItem` elements, `StatusAlert` for feedback, and existing `Badge` variants for completion state.

- [ ] **Step 2: Remove tenant-only branches from platform tabs**

Delete the extracted constants, helpers, imports, and `TenantSmsSettingsPanel` from `settings-tabs.tsx`. The platform content branch must always render its existing settings list and platform-specific panels; do not change payment, social-video, or Tencent LBS logic.

- [ ] **Step 3: Run type checking for real API validation**

Run:

```bash
pnpm --dir apps/admin typecheck
```

Expected: PASS with no missing import, Radix Select, or React type errors.

- [ ] **Step 4: Commit the extraction**

```bash
git add apps/admin/components/settings/tenant-sms-settings-panel.tsx apps/admin/components/settings/settings-tabs.tsx
git commit -m "refactor(admin): 提取租户短信配置面板"
```

### Task 4: Build the tenant settings workspace

**Files:**
- Create: `apps/admin/components/settings/tenant-settings-workspace.tsx`
- Test: `apps/admin/components/settings/tenant-settings-workspace.test.ts`

- [ ] **Step 1: Implement group metadata and URL state**

Create the client component with a small metadata map and existing query-state behavior:

```tsx
"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Headphones, Loader2, MessageSquareText, Settings2 } from "lucide-react";
import type { SettingsGroup } from "@/components/settings/settings-group-types";
import { SettingEditor } from "@/components/settings/settings-actions";
import { TenantSmsSettingsPanel } from "@/components/settings/tenant-sms-settings-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tenantGroupMeta = {
  sms: {
    description: "选择平台统一通道或租户自有通道。",
    icon: MessageSquareText,
  },
  customer_service: {
    description: "维护客户可见的客服入口与联系方式。",
    icon: Headphones,
  },
} as const;
```

Use the same `normalizeGroup` and `router.replace(..., { scroll: false })` behavior as the existing tabs. Unknown groups use `Settings2` and `管理本租户可维护的业务配置。`.

- [ ] **Step 2: Compose the responsive one-card workspace**

Use one top-level `Card`. On `lg`, render a `14rem` left rail and right content separated by `border-r`. Below `lg`, make `TabsList` horizontally scrollable. Each `TabsTrigger` includes the group icon, label, and textual completion state. Do not nest cards or apply shadows to tab items.

```tsx
<Tabs
  orientation="vertical"
  value={activeGroup.code}
  onValueChange={switchGroup}
  className="flex min-h-0 flex-1 flex-col"
>
  <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="shrink-0 border-b bg-muted/25 lg:min-h-0 lg:border-b-0 lg:border-r">
        <TabsList
          aria-label="租户系统配置分组"
          className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-2 lg:flex-col lg:items-stretch lg:overflow-y-auto"
        >
          {groups.map((group) => {
            const meta = getTenantGroupMeta(group.code);
            const GroupIcon = meta.icon;
            const isActive = group.code === activeGroup.code;

            return (
              <TabsTrigger
                key={group.code}
                value={group.code}
                disabled={pending}
                className="h-auto min-w-44 justify-start gap-3 rounded-md px-3 py-2.5 text-left lg:w-full lg:min-w-0"
              >
                {pending && isActive ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <GroupIcon aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{group.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {group.emptyCount > 0 ? `待完善 ${group.emptyCount} 项` : "已完成"}
                  </span>
                </span>
                {group.emptyCount === 0 ? <CheckCircle2 aria-hidden="true" /> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0 border-b px-4 py-4 sm:px-5">
          <CardTitle className="text-base">{activeGroup.label}</CardTitle>
          <CardDescription>{activeMeta.description}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
          {groups.map((group) => (
            <TabsContent key={group.code} value={group.code} className="m-0">
              {group.code === "sms" ? (
                <TenantSmsSettingsPanel settings={group.settings} />
              ) : group.settings.length > 0 ? (
                group.settings.map((setting) => (
                  <SettingEditor key={setting.key} setting={setting} />
                ))
              ) : (
                <p className="p-5 text-sm text-muted-foreground">该分组暂无配置项</p>
              )}
            </TabsContent>
          ))}
        </CardContent>
      </div>
    </div>
  </Card>
</Tabs>
```

For no groups, render a full-composition `Card` with `CardHeader`, `CardTitle`, `CardDescription`, and `CardContent`, using the installed `Empty` component if its current local API supports the required copy after inspection.

- [ ] **Step 3: Run the focused tests and verify green**

Run:

```bash
bun test apps/admin/components/settings/tenant-settings-workspace.test.ts apps/admin/components/settings/settings-localization.test.ts
```

Expected: PASS, all tenant isolation, copy, and platform localization contracts are satisfied.

- [ ] **Step 4: Run admin static checks**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: PASS for file-size rules and TypeScript.

- [ ] **Step 5: Commit the workspace**

```bash
git add apps/admin/components/settings/tenant-settings-workspace.tsx apps/admin/components/settings/tenant-settings-workspace.test.ts
git commit -m "feat(admin): 重构租户系统配置工作台"
```

### Task 5: Align loading state and complete visual verification

**Files:**
- Modify: `apps/admin/app/(console)/settings/loading.tsx`
- Verify: `apps/admin/app/(console)/settings/page.tsx`
- Verify: `apps/admin/components/settings/tenant-settings-workspace.tsx`
- Verify: `apps/admin/components/settings/tenant-sms-settings-panel.tsx`

- [ ] **Step 1: Update the loading skeleton**

Keep the compact title skeleton, replace five metric pills with one status skeleton, and render a one-card workspace skeleton with a narrow left rail and right content rows. Continue using the installed `Skeleton` component and avoid custom `animate-pulse` markup.

```tsx
<Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
  <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
    <div className="flex gap-2 overflow-hidden border-b bg-muted/25 p-2 lg:flex-col lg:border-b-0 lg:border-r">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-44 shrink-0 lg:w-full" />
      ))}
    </div>
    <div className="min-h-0 flex-1">
      <div className="border-b px-5 py-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-4 p-5">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  </div>
</Card>
```

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
bun test apps/admin/components/settings/tenant-settings-workspace.test.ts apps/admin/components/settings/settings-localization.test.ts
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
```

Expected: all commands exit 0; tests report zero failures; TypeScript, file-size check, and Next.js production build pass; diff check prints no errors.

- [ ] **Step 3: Start the admin and verify tenant behavior in browser**

Start the existing admin development server only after static checks pass:

```bash
pnpm --dir apps/admin dev
```

Open `/settings` with an existing tenant session and verify:

- compact tenant header and one actionable status badge;
- flat desktop left rail and mobile horizontal tab list;
- `?group=sms` and `?group=customer_service` switching and refresh persistence;
- inherited, Aliyun, and Tencent SMS progressive disclosure;
- input, reset, save, pending, success, and error feedback;
- no platform payment or platform test tools in tenant mode;
- keyboard focus order, visible focus rings, long Chinese text, and no overflow at 375px, 768px, and desktop widths.

Open `/settings` with a platform session and verify the original platform header metrics, group navigation, payment panel, social-video tester, and Tencent LBS tester remain available.

- [ ] **Step 4: Run the Impeccable pre-flight audit**

Confirm against the implemented source and screenshots:

- restrained one-accent product palette and existing Gooes radius system;
- no gradient text, glass effects, decorative motion, nested cards, oversized type, em-dashes, or decorative status dots;
- no `space-x-*` or `space-y-*`, manual dark color overrides, or raw status colors;
- shadcn composition is valid: `TabsTrigger` inside `TabsList`, `TabsContent` inside `Tabs`, `SelectItem` inside `SelectGroup`, full top-level Card composition, and accessible labels;
- loading, empty, error, success, pending, disabled, desktop, and mobile states are represented.

- [ ] **Step 5: Commit the loading and polish pass**

```bash
git add apps/admin/app/\(console\)/settings/loading.tsx apps/admin/components/settings
git commit -m "style(admin): 完善租户配置页响应式状态"
```

## Completion audit

- Tenant sessions render the dedicated workspace and simplified header.
- Platform sessions retain the existing platform workspace and tools.
- SMS fields are progressively disclosed without changing configuration keys or save semantics.
- Tenant navigation is responsive, URL-addressable, keyboard accessible, and textually communicates completion.
- Automated tests, admin checks, production build, diff validation, and browser checks provide fresh passing evidence.
