# Platform Service Response Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the published service terms to tenant product responses and the immutable order pricing version to tenant order responses without changing routes or request payloads.

**Architecture:** Extend the existing response serializers rather than adding endpoint-specific response branches. Read product terms from the joined published version and read `pricing_version` from the immutable `product_snapshot`; load that snapshot only for single-order detail/payment paths so paginated responses do not load the full JSON.

**Tech Stack:** Bun, TypeScript, Fastify services/controllers, Supabase PostgREST repository, `bun:test`.

---

### Task 1: Lock the response contract with failing serializer tests

**Files:**
- Modify: `apps/api/src/services/platform-service-order-views.test.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.test.ts`

- [x] **Step 1: Add the published terms assertion**

Extend the existing tenant product serializer test with:

```ts
expect(view).toMatchObject({
  terms_content: "服务条款",
});
```

- [x] **Step 2: Add the immutable order pricing assertion**

Give the order fixture `product_snapshot: { pricing_version: 3 }`, then assert create, detail, and payment-request results expose:

```ts
expect(result.order.pricing_version).toBe(3);
```

- [x] **Step 3: Run the focused tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/platform-service-order-views.test.ts \
  src/services/tenant-platform-service-orders.test.ts
```

Expected: failures show `terms_content` and `pricing_version` are missing from serialized responses.

### Task 2: Expose the two fields through existing serializers and repository selects

**Files:**
- Modify: `apps/api/src/services/platform-service-order-views.ts`
- Modify: `apps/api/src/repositories/platform-service-order-records.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.test.ts`
- Modify: order fixtures typed as `OrderRecord` under `apps/api/src/services/*.test.ts`

- [x] **Step 1: Add the product field from the published version**

Add to `serializeTenantServiceProduct()`:

```ts
terms_content: publishedVersion.terms_content,
```

- [x] **Step 2: Load the immutable order snapshot for detail responses**

Keep `product_snapshot` excluded from paginated public selects. Extend only `findOrderByTenantAndId()` with `product_snapshot`; create and payment-request paths already return internal order records containing the snapshot.

- [x] **Step 3: Add the order field to the serializer**

Add to `serializeTenantServiceOrder()`:

```ts
pricing_version: getSnapshotPricingVersion(record),
```

- [x] **Step 4: Update repository contract tests**

Assert the public list still excludes `product_snapshot`, the single-order detail includes it, and neither response selects payment secrets.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
cd apps/api
bun test src/services/platform-service-order-views.test.ts \
  src/services/tenant-platform-service-orders.test.ts \
  src/repositories/platform-service-orders.test.ts
```

Expected: all focused tests pass.

### Task 3: Verify API compatibility and repository quality gates

**Files:**
- Verify only; no additional production files expected.

- [x] **Step 1: Run the API type check**

Run:

```bash
bun run api:typecheck
```

Expected: exit code 0.

- [x] **Step 2: Run the API build and file-size check**

Run:

```bash
bun run api:build
bun run api:check-file-size
```

Expected: both commands exit with code 0.

- [x] **Step 3: Review the final diff**

Confirm there are no route, request schema, migration, dependency, or Orange repository changes, and the response additions are backward-compatible.
