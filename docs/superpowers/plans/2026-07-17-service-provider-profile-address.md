# Service Provider Profile Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the tenant admin service provider profile page so users do not manually type administrative codes or coordinates, and use guided region/address picking instead.

**Architecture:** Keep the service provider workspace as the owner of profile state, but extract address-specific UI into focused components. Reuse the existing administrative-area API and Tencent map preview patterns; expose tenant-safe location endpoints only if address suggestion search is implemented in this phase.

**Tech Stack:** Next.js App Router, React client components, shadcn/Radix/Tailwind, Bun tests, Fastify API if tenant location endpoints are added.

---

### Task 1: Lock The Service Provider Layout Contract

**Files:**
- Modify: `apps/admin/components/service-provider/service-provider-workspace.test.ts`
- Modify: `apps/admin/components/service-provider/service-provider-workspace.tsx`

- [ ] **Step 1: Write the failing test**

Add expectations that the content card no longer contains visible section copy and no longer exposes manual address code or coordinate fields:

```ts
expect(workspaceSource).not.toContain("<CardTitle>当前资料状态</CardTitle>");
expect(workspaceSource).not.toContain("statusNotice");
expect(workspaceSource).not.toContain("公开资料</h2>");
expect(workspaceSource).not.toContain("服务区域</h2>");
expect(workspaceSource).not.toContain("地址区域代码");
expect(workspaceSource).not.toContain("地址纬度");
expect(workspaceSource).not.toContain("地址经度");
```

- [ ] **Step 2: Run red test**

Run:

```bash
bun test components/service-provider/service-provider-workspace.test.ts
```

Expected: FAIL while old headings and manual fields still exist.

- [ ] **Step 3: Implement minimal layout cleanup**

Remove visible content-section titles/descriptions from `ServiceProviderWorkspace`, `ProfileFormSection`, and `AreaSection`. Keep status and version as badges, keep action buttons, and keep hidden or generated values out of visible text inputs.

- [ ] **Step 4: Run green test**

Run:

```bash
bun test components/service-provider/service-provider-workspace.test.ts
```

Expected: PASS.

### Task 2: Add Reusable Tenant Profile Region Picker

**Files:**
- Create: `apps/admin/components/service-provider/service-provider-region-picker.tsx`
- Modify: `apps/admin/components/service-provider/service-provider-workspace.tsx`
- Test: `apps/admin/components/service-provider/service-provider-workspace.test.ts`

- [ ] **Step 1: Write failing test**

Assert that the workspace imports `ServiceProviderRegionPicker`, uses `fetchPublicAdministrativeAreas`, and does not render province/city/district as `TextField` inputs.

- [ ] **Step 2: Implement picker**

Create a client component that loads provinces on mount, loads cities when province changes, loads districts when city changes, and calls:

```ts
onChange({
  address_province: province?.name || "",
  address_city: city?.name || "",
  address_district: district?.name || "",
  address_region_code: district?.adcode || city?.adcode || "",
});
```

Use the existing searchable location field pattern from `service-provider-area-dialog.tsx`.

- [ ] **Step 3: Wire profile save**

Keep `address_region_code` in `ProfileForm` state and request payload, but do not render it as a user-editable input.

- [ ] **Step 4: Verify**

Run:

```bash
bun test components/service-provider/service-provider-workspace.test.ts
pnpm --dir apps/admin run check
```

Expected: both pass.

### Task 3: Add Tenant-Safe Address Search And Map Confirmation

**Files:**
- Create: `apps/admin/components/service-provider/service-provider-address-picker.tsx`
- Modify: `apps/admin/components/platform-tenants/platform-tenant-address-map-preview.tsx`
- Modify: `apps/admin/components/service-provider/service-provider-workspace.tsx`
- Optional API: `apps/api/src/controllers/tenant-location/index.ts`
- Optional API: `apps/api/src/schema/platform-location.ts`
- Optional API: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing tests**

Add source-level admin tests that require `ServiceProviderAddressPicker`, `address_latitude` and `address_longitude` to be generated state rather than manual `TextField`s.

- [ ] **Step 2: Expose tenant-safe location endpoints if needed**

Add tenant endpoints guarded by tenant auth and service provider manage/read permissions:

```ts
GET /tenant/location/address-suggestions
GET /tenant/location/map-config
```

Use `PlatformAddressSuggestionQuerySchema` for query validation and `tencentLbsService` for data. Return via `ResponseHandler.success`.

- [ ] **Step 3: Implement address picker**

Use `InputGroup`, `Popover`, `Command`, and the map preview. Selecting a suggestion updates detailed address, province, city, district, region code, latitude, and longitude. Manual text edits keep the address value but clear coordinate metadata until a suggestion or map confirmation restores it.

- [ ] **Step 4: Verify**

Run:

```bash
bun test components/service-provider/service-provider-workspace.test.ts
pnpm --dir apps/admin run check
bun test src/controllers/tenant-service-provider/routes.test.ts
```

Expected: all pass. If API routes are added, also add and run route tests for tenant location.

### Task 4: Final Verification

**Files:**
- All modified files.

- [ ] **Step 1: Static checks**

Run:

```bash
git diff --check
pnpm --dir apps/admin run check
```

- [ ] **Step 2: Targeted tests**

Run the service provider workspace tests and any API tests touched by tenant location endpoints.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff --stat
git status --short
```

Confirm only intended service provider, location, test, and plan files changed.
