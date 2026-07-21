# 微信支付结算规则选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将租户进件表单的技术 ID 输入改为主体联动的业务下拉框，并由 API 保证结算规则与行业不可错配。

**Architecture:** 在 `@gooes/domain` 提供受支持的微信结算规则目录和查询函数，API 与 Admin 共用同一来源。Admin 使用 shadcn Select 展示业务标签并提交目录中的原始微信字段；API schema 在保存前验证主体、规则和行业三者匹配。

**Tech Stack:** Bun、TypeScript、Zod 4、Next.js 15、React 19、shadcn/Radix Select、`@gooes/domain`

---

### Task 1: 共享结算规则目录

**Files:**
- Create: `packages/domain/src/wechat-pay-settlement-rule.ts`
- Create: `packages/domain/src/wechat-pay-settlement-rule.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing domain test**

```ts
import { describe, expect, test } from "bun:test";
import {
  findWechatPaySettlementRule,
  getWechatPaySettlementRulesForSubject,
} from "./wechat-pay-settlement-rule";

describe("wechat pay settlement rule catalog", () => {
  test("returns the decoration rule for each supported subject", () => {
    expect(getWechatPaySettlementRulesForSubject("SUBJECT_TYPE_ENTERPRISE")[0])
      .toMatchObject({ id: "716", qualificationType: "零售批发/生活娱乐/网上商城/其他" });
    expect(getWechatPaySettlementRulesForSubject("SUBJECT_TYPE_INDIVIDUAL")[0])
      .toMatchObject({ id: "719", qualificationType: "零售批发/生活娱乐/其他" });
  });

  test("only resolves an exact subject, id and industry combination", () => {
    expect(findWechatPaySettlementRule("SUBJECT_TYPE_ENTERPRISE", "716", "零售批发/生活娱乐/网上商城/其他")?.id).toBe("716");
    expect(findWechatPaySettlementRule("SUBJECT_TYPE_ENTERPRISE", "719", "零售批发/生活娱乐/其他")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run: `bun test packages/domain/src/wechat-pay-settlement-rule.test.ts`

Expected: FAIL because `wechat-pay-settlement-rule.ts` does not exist.

- [ ] **Step 3: Implement and export the immutable catalog**

Create typed records for enterprise `716` and individual `719`, plus exact lookup and subject-filter helpers. Export the module from `packages/domain/src/index.ts`.

- [ ] **Step 4: Run the domain test and verify GREEN**

Run: `bun test packages/domain/src/wechat-pay-settlement-rule.test.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the domain contract**

```bash
git add packages/domain/src/wechat-pay-settlement-rule.ts packages/domain/src/wechat-pay-settlement-rule.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): 定义微信结算规则目录"
```

### Task 2: API 防篡改校验

**Files:**
- Modify: `apps/api/src/schema/wechat-pay-applyments.test.ts`
- Modify: `apps/api/src/schema/wechat-pay-applyments.ts`

- [ ] **Step 1: Correct the enterprise fixture and add failing mismatch tests**

Set the enterprise base fixture to rule `716` and industry `零售批发/生活娱乐/网上商城/其他`. Add tests proving enterprise + `719` and enterprise + a mismatched industry are rejected, while an individual + `719` pair is accepted.

- [ ] **Step 2: Run the schema tests and verify RED**

Run: `bun test apps/api/src/schema/wechat-pay-applyments.test.ts`

Expected: mismatch cases fail because the current schema accepts arbitrary non-empty strings.

- [ ] **Step 3: Add an exact catalog refinement**

Import `findWechatPaySettlementRule` from `@gooes/domain`. In the shared create/update refinement, add a custom issue on `settlement_id` when the rule is unavailable for the subject and a custom issue on `qualification_type` when the ID exists but the industry does not match.

- [ ] **Step 4: Run the schema tests and verify GREEN**

Run: `bun test apps/api/src/schema/wechat-pay-applyments.test.ts`

Expected: all schema tests pass.

- [ ] **Step 5: Commit API validation**

```bash
git add apps/api/src/schema/wechat-pay-applyments.ts apps/api/src/schema/wechat-pay-applyments.test.ts
git commit -m "fix(finance): 校验进件结算规则组合"
```

### Task 3: Admin shadcn 联动选择

**Files:**
- Create: `apps/admin/components/finance/finance-wechat-pay-settlement-rule-field.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-steps.tsx`
- Modify: `apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

- [ ] **Step 1: Add a failing Admin contract test**

Assert that the steps render `FinanceWechatPaySettlementRuleField`, no longer render text fields labeled `结算规则 ID` or `所属行业`, and the new component contains shadcn `Select`, hidden `settlement_id`, hidden `qualification_type`, and `getWechatPaySettlementRulesForSubject`.

- [ ] **Step 2: Run the Admin test and verify RED**

Run: `bun test apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

Expected: FAIL because the dedicated field does not exist and raw text fields remain.

- [ ] **Step 3: Implement the linked Select**

Create a client component that filters options by `subjectType`, preserves an exact valid saved pair, otherwise selects the first valid rule, and emits:

```tsx
<input type="hidden" name="settlement_id" value={selectedRule?.id ?? ""} />
<input type="hidden" name="qualification_type" value={selectedRule?.qualificationType ?? ""} />
<Select value={selectedRule?.id ?? ""} onValueChange={setSelectedRuleId}>
```

The visible option label is `装修装饰服务（其他） · 0.6% · T+1`; raw IDs are not shown. Replace both raw text fields in `SettlementFields` with this component.

- [ ] **Step 4: Run the Admin test and verify GREEN**

Run: `bun test apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit the tenant UI**

```bash
git add apps/admin/components/finance/finance-wechat-pay-settlement-rule-field.tsx apps/admin/components/finance/finance-wechat-pay-applyment-steps.tsx apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts
git commit -m "fix(admin): 改为选择微信结算规则"
```

### Task 4: 平台详情与完整验证

**Files:**
- Modify: `apps/admin/app/(console)/platform/wechat-pay/applyments/[id]/page.tsx`
- Modify: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts`

- [ ] **Step 1: Add a failing platform display test**

Assert that the detail page uses the shared catalog to display `装修装饰服务（其他）` while keeping the rule ID and 微信行业值 in secondary audit text.

- [ ] **Step 2: Run the platform test and verify RED**

Run: `bun test apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts`

Expected: FAIL because the page currently displays only raw `settlement_id`.

- [ ] **Step 3: Implement readable platform display**

Resolve the exact catalog item from the stored subject, ID and industry. Show the catalog label when found; fall back to `未识别规则` with raw audit values for historical data.

- [ ] **Step 4: Run focused and static verification**

Run:

```bash
bun test packages/domain/src/wechat-pay-settlement-rule.test.ts apps/api/src/schema/wechat-pay-applyments.test.ts apps/admin/components/finance/finance-wechat-pay-applyment-page-layout.test.ts apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts
bun run --cwd packages/domain build
bun run --cwd apps/api typecheck
pnpm --dir apps/admin run check
git diff --check
```

Expected: all tests, builds, type checks and file-size checks pass.

- [ ] **Step 5: Browser smoke and commit**

Use the isolated Admin/API services. Verify the tenant application page shows a business Select rather than raw IDs, switching subject changes the hidden pair, and the platform detail remains readable. Do not submit a real WeChat application.

```bash
git add apps/admin/app/'(console)'/platform/wechat-pay/applyments/'[id]'/page.tsx apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts
git commit -m "fix(admin): 优化进件结算规则展示"
```
