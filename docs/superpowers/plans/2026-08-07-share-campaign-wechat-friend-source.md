# Share Campaign WeChat Friend Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept and persist `wechat_friend` as the source for existing share-campaign open and assist requests while preserving all existing defaults and business rules.

**Architecture:** Extend the single shared Zod source enum used by both public endpoints, and add one forward-only Supabase migration that replaces both event-table source check constraints. Existing service and repository code already passes `input.source` through unchanged, so it remains untouched and is protected by focused contract tests.

**Tech Stack:** Bun, TypeScript, Zod 4, Fastify, Supabase/PostgreSQL migrations, Bun test.

---

### Task 1: Lock the new request and database contract with failing tests

**Files:**
- Create: `apps/api/src/schema/customer-project-log-share-source.test.ts`

- [x] **Step 1: Write the failing request and migration contract tests**

Create `apps/api/src/schema/customer-project-log-share-source.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AssistCustomerProjectLogShareCampaignSchema,
  OpenCustomerProjectLogShareCampaignSchema,
} from "./customer-project-log-share";

const migration = new URL(
  "../../../../supabase/migrations/20260807143000_add_wechat_friend_share_source.sql",
  import.meta.url,
);

describe("好友助力微信好友转发来源", () => {
  test("打开和助力请求接受 wechat_friend", () => {
    expect(OpenCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_open",
      source: "wechat_friend",
    }).source).toBe("wechat_friend");
    expect(AssistCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_assist",
      source: "wechat_friend",
    }).source).toBe("wechat_friend");
  });

  test("未传来源继续默认 qrcode 且拒绝未知来源", () => {
    expect(OpenCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_default",
    }).source).toBe("qrcode");
    expect(AssistCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_default",
    }).source).toBe("qrcode");

    const invalid = OpenCustomerProjectLogShareCampaignSchema.safeParse({
      share_token: "st_invalid",
      source: "unknown",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toBe("无效的分享来源");
    }
  });

  test("migration 同时扩展打开和助力记录约束", () => {
    const migrationPath = fileURLToPath(migration);
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const sql = readFileSync(migrationPath, "utf8")
      .replace(/--.*$/gm, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    for (const table of [
      "customer_log_share_opens",
      "customer_log_share_assists",
    ]) {
      expect(sql).toContain(`alter table public.${table}`);
      expect(sql).toContain(`${table}_source_check`);
    }
    expect(sql.match(/'wechat_friend'/g)?.length).toBe(2);
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/api
bun test src/schema/customer-project-log-share-source.test.ts
```

Expected: the first test fails because `wechat_friend` is rejected, and the migration
test fails because the migration does not exist. The compatibility/default test passes.

- [x] **Step 3: Commit the failing contract test**

```bash
git add apps/api/src/schema/customer-project-log-share-source.test.ts
git commit -m "test(share): 覆盖微信好友分享来源"
```

### Task 2: Extend API validation and both database constraints

**Files:**
- Modify: `apps/api/src/schema/customer-project-log-share.ts:46-51`
- Create: `supabase/migrations/20260807143000_add_wechat_friend_share_source.sql`

- [x] **Step 1: Extend the shared Zod enum**

Replace the source values in `CustomerProjectLogShareSourceSchema` with:

```typescript
  ["qrcode", "poster", "wechat_friend"],
```

Do not change the `.default("qrcode")` declarations on the open and assist request
schemas.

- [x] **Step 2: Add the forward database migration**

Create `supabase/migrations/20260807143000_add_wechat_friend_share_source.sql`:

```sql
BEGIN;

ALTER TABLE public.customer_log_share_opens
DROP CONSTRAINT IF EXISTS customer_log_share_opens_source_check;

ALTER TABLE public.customer_log_share_opens
ADD CONSTRAINT customer_log_share_opens_source_check
CHECK (source IN ('qrcode', 'poster', 'wechat_friend'));

ALTER TABLE public.customer_log_share_assists
DROP CONSTRAINT IF EXISTS customer_log_share_assists_source_check;

ALTER TABLE public.customer_log_share_assists
ADD CONSTRAINT customer_log_share_assists_source_check
CHECK (source IN ('qrcode', 'poster', 'wechat_friend'));

COMMIT;
```

- [x] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
cd apps/api
bun test src/schema/customer-project-log-share-source.test.ts
```

Expected: 3 tests pass and 0 fail.

- [x] **Step 4: Confirm existing pass-through code remains unchanged**

Run:

```bash
rg -n -C 3 "source: input.source" \
  apps/api/src/services/customer-project-log-shares/legacy/public-campaigns.ts \
  apps/api/src/repositories/customer-project-log-share-campaigns/legacy/engagement.ts
```

Expected: one open and one assist pass-through in both the service and repository. No
business-logic files are modified.

- [x] **Step 5: Commit the implementation**

```bash
git add \
  apps/api/src/schema/customer-project-log-share.ts \
  supabase/migrations/20260807143000_add_wechat_friend_share_source.sql
git commit -m "feat(share): 支持微信好友分享来源"
```

### Task 3: Validate migration and API release gates

**Files:**
- Modify: `docs/superpowers/plans/2026-08-07-share-campaign-wechat-friend-source.md`

- [x] **Step 1: Inspect pending migrations before applying**

Run with the intended environment configuration:

```bash
supabase migration list
```

Expected: `20260807143000` is present locally and not yet present remotely. If any other
unexpected migration is pending, stop before applying and report it.

- [x] **Step 2: Validate the migration in an isolated local Supabase stack**

Run:

```bash
colima status
supabase start --exclude edge-runtime,vector
supabase db reset
docker exec supabase_db_gooes psql -U postgres -d postgres -Atc \
  "SELECT conname || ':' || pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conname IN (
     'customer_log_share_opens_source_check',
     'customer_log_share_assists_source_check'
   )
   ORDER BY conname;"
```

Expected: the migration applies without rewriting data; both constraints allow all three
values.

- [x] **Step 3: Run focused and adjacent tests**

Run:

```bash
cd apps/api
bun test \
  src/schema/customer-project-log-share-source.test.ts \
  src/services/customer-project-log-shares/visitor-assist-contract.test.ts \
  src/services/customer-project-log-shares/campaign-summary-contract.test.ts
```

Expected: all selected tests pass with 0 failures.

- [x] **Step 4: Run API static and build gates**

Run from the repository root:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
git diff --check
```

Expected: every command exits 0.

- [x] **Step 5: Verify migration alignment after the approved dev application**

After applying the migration to the development database through Supabase CLI, run:

```bash
supabase migration list
```

Expected: Local and Remote both contain `20260807143000`. Do not apply manual DDL or DML.

- [x] **Step 6: Record verification evidence and commit the completed plan**

Mark completed checkboxes and append the exact test, build, and migration verification
results to this document, then commit:

```bash
git add docs/superpowers/plans/2026-08-07-share-campaign-wechat-friend-source.md
git commit -m "docs(share): 记录微信好友来源验收"
```

## Verification Evidence

- TDD RED: `customer-project-log-share-source.test.ts` returned 1 pass and 2
  expected failures before implementation: `wechat_friend` was rejected and the
  migration file was absent.
- TDD GREEN and adjacent regressions: 8 tests passed, 0 failed, 33 assertions.
- Existing data flow: both open and assist paths still pass `input.source` unchanged
  through service and repository; no business-logic files changed.
- Local migration replay: `supabase db reset` applied every migration from an empty
  local database and finished with `20260807143000_add_wechat_friend_share_source.sql`.
- Local constraint query: both `customer_log_share_opens_source_check` and
  `customer_log_share_assists_source_check` contain `qrcode`, `poster`, and
  `wechat_friend`.
- API gates after installing the frozen-lockfile dependencies in the isolated worktree:
  TypeScript check passed, Bun build bundled 932 modules, and API file-size check passed.
- Development database: `supabase db push` applied only `20260807143000`; the final
  migration list reports `20260807143000 | 20260807143000` for Local and Remote.
