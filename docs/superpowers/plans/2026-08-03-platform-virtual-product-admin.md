# Platform Virtual Product Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单一“品牌权益商品”页面升级为通用虚拟商品列表、完整页面表单、详情与微信渠道操作记录，并让支付配置只管理渠道账户和密钥。

**Architecture:** Next.js Server Component 负责鉴权和分页首屏数据，Client Components 只处理表单、确认和有限轮询。商品工作区位于 `/platform/virtual-products`，支付配置通过汇总接口显示渠道健康和商品计数；所有写操作经过现有 `/api/backend` 代理，不在浏览器保存敏感配置。

**Tech Stack:** Next.js 15、React 19、TypeScript、Tailwind CSS、shadcn/Radix、React Hook Form、Zod、Bun tests

---

**Prerequisite:** 先完成 `2026-08-03-platform-virtual-product-catalog-channels.md`。执行 UI 任务时必须使用 `admin-design`、`shadcn`、`impeccable` 和 `design-taste-frontend`，复用现有 Admin 组件，不新增 UI 依赖。

## File structure

- Create `apps/admin/app/(console)/platform/virtual-products/page.tsx`: 鉴权、筛选、分页和列表首屏。
- Create `apps/admin/app/(console)/platform/virtual-products/loading.tsx`: 与列表结构一致的骨架屏。
- Create `apps/admin/app/(console)/platform/virtual-products/new/page.tsx`: 新建商品完整页面。
- Create `apps/admin/app/(console)/platform/virtual-products/[id]/page.tsx`: 商品详情、渠道和操作记录页签。
- Create `apps/admin/app/(console)/platform/virtual-products/[id]/loading.tsx`: 详情骨架屏。
- Create `apps/admin/components/virtual-products/platform-virtual-product-types.ts`: Admin DTO。
- Create `apps/admin/components/virtual-products/platform-virtual-product-list.tsx`: 列表、筛选、空错状态和分页。
- Create `apps/admin/components/virtual-products/platform-virtual-product-form.tsx`: 基础、发放、销售三段表单。
- Create `apps/admin/components/virtual-products/platform-virtual-product-channel-panel.tsx`: 沙箱/生产渠道状态与主操作。
- Create `apps/admin/components/virtual-products/platform-virtual-product-operation-list.tsx`: 分页操作记录。
- Create `apps/admin/components/virtual-products/platform-virtual-product-data.ts`: DTO 格式化、表单 payload 和状态派生。
- Modify `apps/admin/components/layout/menu-config.ts`: “品牌权益”改为“虚拟商品”。
- Modify `apps/admin/components/settings/platform-virtual-payment-settings.tsx`: 删除具体商品编辑和上传发布交互。
- Modify `apps/admin/components/settings/platform-payment-settings-panel.tsx`: 展示渠道健康、商品计数和管理入口。
- Modify `apps/admin/app/(console)/platform/branding-addon/page.tsx`: 保留订单/退款，商品页签跳转新列表。

### Task 1: Freeze Admin DTO and navigation contract

**Files:**
- Create: `apps/admin/components/virtual-products/platform-virtual-product-types.ts`
- Create: `apps/admin/components/virtual-products/platform-virtual-product-data.ts`
- Test: `apps/admin/components/virtual-products/platform-virtual-product-data.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Test: `apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

- [ ] **Step 1: Write failing data and navigation tests**

```ts
import { describe, expect, test } from 'bun:test';
import { buildCreatePayload, nextChannelAction } from './platform-virtual-product-data';

describe('virtual product admin data', () => {
  test('does not send server-owned identities', () => {
    expect(buildCreatePayload(validCountForm())).toEqual({
      name: 'AI 次数包 100 次', product_type: 'count', amount_fen: 9900,
      image_file_id: IMAGE_ID, purchase_notes: '购买后自动到账',
      refund_template: 'consumable_unused_full_reverse',
      grant_rule: { benefit_type: 'count', entitlement_code: 'ai.calls', grant_amount: 100, expiry_mode: 'permanent' },
    });
  });

  test('derives one primary channel action', () => {
    expect(nextChannelAction({ upload_state: 'not_started', publish_state: 'not_started', validation_status: 'pending', out_of_sync: false })).toBe('upload');
    expect(nextChannelAction({ upload_state: 'succeeded', publish_state: 'not_started', validation_status: 'pending', out_of_sync: false })).toBe('publish');
    expect(nextChannelAction({ upload_state: 'succeeded', publish_state: 'succeeded', validation_status: 'pending', out_of_sync: false })).toBe('validate');
  });
});
```

Add source assertions that `menu-config.ts` contains `/platform/virtual-products`, label `虚拟商品`, permission `platform.virtual_product.read`, and no longer exposes `/platform/branding-addon` as the product-management menu target.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-data.test.ts apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

Expected: FAIL because the new files and navigation entry do not exist.

- [ ] **Step 3: Add exact DTOs and pure helpers**

```ts
export type PlatformVirtualProductListItem = {
  id: string; code: string; name: string;
  product_type: 'duration' | 'count' | 'points' | 'quota';
  amount_fen: number; currency: 'CNY';
  grant_summary: string; provider_product_id: string;
  production_channel_state: 'pending' | 'valid' | 'invalid' | 'out_of_sync';
  status: 'draft' | 'active' | 'suspended' | 'archived';
  version: number; updated_at: string;
};

export type PlatformVirtualProductPage = {
  list: PlatformVirtualProductListItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export function nextChannelAction(mapping: ChannelSummary) {
  if (mapping.out_of_sync || mapping.upload_state === 'not_started' || mapping.upload_state === 'failed') return 'upload' as const;
  if (mapping.upload_state === 'processing') return 'refresh' as const;
  if (mapping.publish_state === 'not_started' || mapping.publish_state === 'failed') return 'publish' as const;
  if (mapping.publish_state === 'processing') return 'refresh' as const;
  if (mapping.validation_status !== 'valid') return 'validate' as const;
  return 'none' as const;
}
```

`buildCreatePayload` must use a discriminated switch so duration never sends `grant_amount`, while count/points/quota never send duration fields. Update the menu item to:

```ts
{
  href: '/platform/virtual-products',
  activeHrefs: ['/platform/branding-addon'],
  label: '虚拟商品',
  icon: BadgeCheck,
  permission: 'platform.virtual_product.read',
}
```

- [ ] **Step 4: Run tests**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-data.test.ts apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/virtual-products apps/admin/components/layout/menu-config.ts apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts
git commit -m "feat(admin): define virtual product workspace contract"
```

### Task 2: Build the paginated product list and matching skeleton

**Files:**
- Create: `apps/admin/app/(console)/platform/virtual-products/page.tsx`
- Create: `apps/admin/app/(console)/platform/virtual-products/loading.tsx`
- Create: `apps/admin/components/virtual-products/platform-virtual-product-list.tsx`
- Test: `apps/admin/components/virtual-products/platform-virtual-product-list.test.ts`

- [ ] **Step 1: Write the failing source contract**

```ts
expect(page).toContain('/platform/virtual-products?');
expect(page).toContain('pageSize');
expect(page).toContain('platform.virtual_product.read');
expect(list).toContain('新建虚拟商品');
expect(list).toContain('production_validation_status');
expect(list).toContain('共 {data.pagination.total} 个');
expect(loading).toContain('virtual-product-loading-filters');
expect(loading).toContain('Array.from({ length: 8 })');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-list.test.ts`

Expected: FAIL because the list workspace does not exist.

- [ ] **Step 3: Implement server pagination and the table**

The page must normalize `page >= 1`, `pageSize` through `normalizePlatformListPageSize`, trim keyword to 120 characters, and issue one request:

```ts
const data = await getBackendData<PlatformVirtualProductPage>(
  `/platform/virtual-products?${new URLSearchParams({
    page: String(page), pageSize: String(pageSize),
    ...(keyword ? { keyword } : {}),
    ...(productType ? { product_type: productType } : {}),
    ...(status ? { status } : {}),
    ...(wechatStatus ? { production_validation_status: wechatStatus } : {}),
  })}`,
);
```

Render one full-height Card containing toolbar, responsive table, empty state, inline error state, and previous/next pagination. Columns are name/code, type, price, grant summary, channel ID, production state, sales state, updated time, operation. The skeleton must mirror header, filters, eight rows, and footer without introducing extra title rows.

- [ ] **Step 4: Run test and Admin checks**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-list.test.ts`

Expected: PASS.

Run: `pnpm --dir apps/admin check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'apps/admin/app/(console)/platform/virtual-products/page.tsx' 'apps/admin/app/(console)/platform/virtual-products/loading.tsx' apps/admin/components/virtual-products/platform-virtual-product-list.tsx apps/admin/components/virtual-products/platform-virtual-product-list.test.ts
git commit -m "feat(admin): add virtual product list workspace"
```

### Task 3: Build the full-page create and edit form

**Files:**
- Create: `apps/admin/app/(console)/platform/virtual-products/new/page.tsx`
- Create: `apps/admin/components/virtual-products/platform-virtual-product-form.tsx`
- Test: `apps/admin/components/virtual-products/platform-virtual-product-form.test.ts`
- Reuse: `apps/admin/components/settings/platform-virtual-payment-image-upload.ts`
- Reuse: `apps/admin/lib/cos-direct-upload.ts`

- [ ] **Step 1: Write failing form contracts**

```ts
expect(form).toContain('基础信息');
expect(form).toContain('发放规则');
expect(form).toContain('销售规则');
expect(form).toContain('200 × 200');
expect(form).toContain('uploadDirectToCos');
expect(form).not.toContain('provider_product_id:');
expect(form).not.toContain('DialogContent');
expect(form).not.toContain('SheetContent');
```

Add pure helper tests for duration, permanent consumable, fixed-expiry consumable, invalid image dimensions, and amount conversion to integer fen.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-form.test.ts apps/admin/components/virtual-products/platform-virtual-product-data.test.ts`

Expected: FAIL because the full-page form does not exist.

- [ ] **Step 3: Implement accessible form sections**

Use native labels plus existing `Input`, `Select`, `Textarea`, `Button`, `Card`, and image uploader. On image selection, decode dimensions before upload and reject any file not exactly 200×200. After upload, submit the returned `file_id`, never only a public URL. Disable the submit button while uploading or saving and preserve form values after API errors.

The create request must be exactly:

```ts
await requestBackendJson<VirtualProductDetail>('/platform/virtual-products', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(buildCreatePayload(formValues)),
}, { fallbackMessage: '虚拟商品创建失败' });
```

After success, navigate to `/platform/virtual-products/${result.id}` and show the returned read-only product code and channel product ID. Editing sends only mutable facts plus `version`; changing benefit semantics after a product has entered sales displays “请复制为新商品” and blocks save.

- [ ] **Step 4: Run tests and check**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-form.test.ts apps/admin/components/virtual-products/platform-virtual-product-data.test.ts`

Expected: PASS.

Run: `pnpm --dir apps/admin check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'apps/admin/app/(console)/platform/virtual-products/new/page.tsx' apps/admin/components/virtual-products/platform-virtual-product-form.tsx apps/admin/components/virtual-products/platform-virtual-product-form.test.ts apps/admin/components/virtual-products/platform-virtual-product-data.ts apps/admin/components/virtual-products/platform-virtual-product-data.test.ts
git commit -m "feat(admin): add virtual product full-page form"
```

### Task 4: Add detail tabs, channel actions, and finite polling

**Files:**
- Create: `apps/admin/app/(console)/platform/virtual-products/[id]/page.tsx`
- Create: `apps/admin/app/(console)/platform/virtual-products/[id]/loading.tsx`
- Create: `apps/admin/components/virtual-products/platform-virtual-product-channel-panel.tsx`
- Create: `apps/admin/components/virtual-products/platform-virtual-product-operation-list.tsx`
- Create: `apps/admin/components/virtual-products/use-virtual-product-channel-action.ts`
- Test: `apps/admin/components/virtual-products/platform-virtual-product-channel-panel.test.ts`

- [ ] **Step 1: Write failing action tests**

```ts
expect(channelPanel).toContain('沙箱');
expect(channelPanel).toContain('生产');
expect(channelPanel).toContain('nextChannelAction');
expect(channelPanel).toContain('AlertDialog');
expect(channelPanel).toContain('生产环境');
expect(hook).toContain('2_000');
expect(hook).toContain('MAX_POLLS');
expect(hook).not.toContain('setInterval');
expect(operationList).toContain('request_id');
expect(operationList).not.toContain('app_key');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-channel-panel.test.ts`

Expected: FAIL because detail components do not exist.

- [ ] **Step 3: Implement detail and controlled channel actions**

The detail page loads `GET /platform/virtual-products/:id` once and renders three tabs: 商品信息、微信渠道、操作记录. Channel actions post only `{ version }` to the generic endpoints. Production upload/publish requires an AlertDialog containing product name, read-only channel ID, formatted price, and environment.

Implement bounded polling as:

```ts
const MAX_POLLS = 15;
for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
  const snapshot = await requestBackendJson<ChannelSnapshot>(mappingPath, {}, { fallbackMessage: '微信状态刷新失败' });
  onSnapshot(snapshot);
  if (!snapshot.operation || !['submitted', 'processing'].includes(snapshot.operation.state)) return snapshot;
  await new Promise<void>((resolve) => window.setTimeout(resolve, 2_000));
}
throw new ChannelActionPendingError('微信任务仍在处理中，请稍后手动刷新。');
```

Unmount must set an `aborted` flag checked before every state update. Entering the page or clicking ordinary refresh only uses GET; it never starts upload or publish.

- [ ] **Step 4: Run tests, check, and build**

Run: `bun test apps/admin/components/virtual-products/platform-virtual-product-channel-panel.test.ts`

Expected: PASS.

Run: `pnpm --dir apps/admin check && pnpm --dir apps/admin build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'apps/admin/app/(console)/platform/virtual-products/[id]/page.tsx' 'apps/admin/app/(console)/platform/virtual-products/[id]/loading.tsx' apps/admin/components/virtual-products/platform-virtual-product-channel-panel.tsx apps/admin/components/virtual-products/platform-virtual-product-operation-list.tsx apps/admin/components/virtual-products/use-virtual-product-channel-action.ts apps/admin/components/virtual-products/platform-virtual-product-channel-panel.test.ts
git commit -m "feat(admin): add virtual product channel lifecycle"
```

### Task 5: Slim payment settings and preserve orders/refunds

**Files:**
- Modify: `apps/admin/components/settings/platform-virtual-payment-settings.tsx`
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.tsx`
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.test.ts`
- Modify: `apps/admin/components/settings/platform-virtual-payment-settings.test.ts`
- Modify: `apps/admin/app/(console)/platform/branding-addon/page.tsx`
- Modify: `apps/admin/app/(console)/platform/branding-addon/loading.tsx`
- Modify: `apps/admin/components/branding-addon/platform-branding-admin-tabs.tsx`
- Modify: `apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

- [ ] **Step 1: Update tests to the new information architecture**

```ts
expect(settings).toContain('渠道账户');
expect(settings).toContain('密钥与消息认证');
expect(settings).toContain('已发布商品');
expect(settings).toContain('待同步商品');
expect(settings).toContain('失败商品');
expect(settings).toContain('/platform/virtual-products');
expect(settings).not.toContain('VirtualPaymentMappingCard');
expect(settings).not.toContain('VirtualPaymentGoodsFlow');
expect(settings).not.toContain('PlatformVirtualPaymentImageField');
```

Branding page assertions must retain orders and refunds but replace its product form with a redirect link to `/platform/virtual-products`.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/admin/components/settings/platform-payment-settings-panel.test.ts apps/admin/components/settings/platform-virtual-payment-settings.test.ts apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

Expected: FAIL because payment settings still edit a concrete product.

- [ ] **Step 3: Remove product mutation UI from payment settings**

Keep channel mode, AppID, virtual merchant ID, Offer ID, secret revision, AppKey update, message token, callback status, and global readiness. Add a compact summary row from the channel snapshot:

```tsx
<VirtualProductHealthSummary
  published={snapshot.product_counts.published}
  outOfSync={snapshot.product_counts.out_of_sync}
  failed={snapshot.product_counts.failed}
  href="/platform/virtual-products"
/>
```

Delete imports and render paths for mapping form, product image, and goods-flow controls from payment settings. Do not delete reusable files until the final cutover plan confirms no imports remain. Keep `/platform/branding-addon?view=orders` and `?view=refunds`; the product tab becomes a simple explanation and navigation button.

- [ ] **Step 4: Update both skeletons and run verification**

The settings skeleton must mirror channel credentials plus the three-count summary. The branding skeleton must mirror only the surviving orders/refunds tabs and compatibility navigation state.

Run: `bun test apps/admin/components/settings/platform-payment-settings-panel.test.ts apps/admin/components/settings/platform-virtual-payment-settings.test.ts apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

Expected: PASS.

Run: `pnpm --dir apps/admin check && pnpm --dir apps/admin build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/settings/platform-virtual-payment-settings.tsx apps/admin/components/settings/platform-payment-settings-panel.tsx apps/admin/components/settings/platform-payment-settings-panel.test.ts apps/admin/components/settings/platform-virtual-payment-settings.test.ts 'apps/admin/app/(console)/platform/branding-addon/page.tsx' 'apps/admin/app/(console)/platform/branding-addon/loading.tsx' apps/admin/components/branding-addon/platform-branding-admin-tabs.tsx apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts
git commit -m "refactor(admin): separate virtual products from payment settings"
```

## Phase checkpoint

- [ ] Verify list loading, empty, error, filtered, and multi-page states at desktop and 375 px width.
- [ ] Verify create form supports duration, count, points, quota, permanent and fixed expiry, and exact 200×200 upload.
- [ ] Verify code and channel product ID are read-only and copyable after first save.
- [ ] Verify refresh is GET-only, upload/publish require confirmation, and polling stops after 15 attempts.
- [ ] Verify payment settings contain no concrete product CRUD or upload/publish controls.
- [ ] Verify product, order, and refund permissions independently hide or disable the correct actions.
