# Finance Generated Ledger Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include generated project payment ledgers in the finance correction audit API and Admin audit filter.

**Architecture:** Reuse existing ledger metadata from `paymentService.generateProjectPaymentLedger()` instead of adding tables or migrations. Extend the ledger audit repository with a third bounded query, map it in the service, and expose the already-defined `generate_payment_ledger` operation in Admin filters.

**Tech Stack:** Bun, TypeScript, Fastify API, Supabase query builder, Next.js Admin, shadcn/Tailwind UI, Bun tests.

---

### Task 1: API Generated Ledger Audit

**Files:**
- Modify: `apps/api/src/services/finance-correction-audits.test.ts`
- Modify: `apps/api/src/repositories/finance-correction-audits.ts`
- Modify: `apps/api/src/services/finance-correction-audits.ts`

- [ ] **Step 1: Write failing service test**

Add one ledger fixture with generated ledger fields, assert the merged order starts with
`generate_payment_ledger`, summary total becomes `5`, and the target is
`/finance/ledger?ledger_id=ledger-generated`.

- [ ] **Step 2: Run failing API test**

Run:

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
```

Expected: fails because `mapLedgerRow()` does not emit `generate_payment_ledger`.

- [ ] **Step 3: Implement repository query**

Extend `LedgerCorrectionAuditRow` with generated ledger audit fields, add
`listGeneratedLedgerRows()`, and include it in `listLedgerCorrectionAudits()`.

- [ ] **Step 4: Implement service mapping**

In `mapLedgerRow()`, emit a `generate_payment_ledger` record when generated ledger fields are present.

- [ ] **Step 5: Run passing API test**

Run:

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
```

Expected: all tests pass.

### Task 2: Admin Filter Exposure

**Files:**
- Modify: `apps/admin/app/(console)/finance/audits/page.tsx`
- Modify: `apps/admin/components/finance/finance-correction-audit-utils.test.ts`

- [ ] **Step 1: Cover Admin label**

In `finance-correction-audit-utils.test.ts`, assert:

```ts
expect(financeCorrectionAuditOperationLabel("generate_payment_ledger"))
  .toBe("补生成收款台账");
```

- [ ] **Step 2: Add operation select option**

Add this option to `OPERATION_OPTIONS` in `apps/admin/app/(console)/finance/audits/page.tsx`:

```ts
{ value: "generate_payment_ledger", label: "补生成收款台账" },
```

- [ ] **Step 3: Run Admin tests**

Run:

```bash
cd apps/admin
bun test components/finance/finance-correction-audit-utils.test.ts components/finance/finance-module-tabs.test.ts
```

Expected: all tests pass.

### Task 3: Docs And Verification

**Files:**
- Create: `docs/decoration-finance/2026-06-30-phase7-5-1-generated-ledger-audit.md`
- Modify: `docs/decoration-finance/README.md`

- [ ] **Step 1: Document scope**

Record API/Admin behavior, no migration rationale, small-program boundary, and verification commands.

- [ ] **Step 2: Run full relevant verification**

Run:

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
pnpm exec tsc -p tsconfig.json --noEmit

cd ../admin
bun test components/finance/finance-correction-audit-utils.test.ts components/finance/finance-module-tabs.test.ts
pnpm run check

cd ../..
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/api/src/repositories/finance-correction-audits.ts apps/api/src/services/finance-correction-audits.ts apps/api/src/services/finance-correction-audits.test.ts apps/admin/app/\(console\)/finance/audits/page.tsx apps/admin/components/finance/finance-correction-audit-utils.test.ts docs/decoration-finance/README.md docs/decoration-finance/2026-06-30-phase7-5-1-generated-ledger-audit.md docs/superpowers/specs/2026-06-30-finance-generated-ledger-audit-design.md docs/superpowers/plans/2026-06-30-finance-generated-ledger-audit.md
git commit -m "feat(finance): 纳入补生成台账审计"
```
