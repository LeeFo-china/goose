# Platform Branding Addon Product Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Admin 平台超管侧提供年度品牌权益商品的查看、改价、购买说明编辑和上下架交互。

**Architecture:** Next.js 服务端页面负责会话、权限和初始 GET；客户端表单通过现有 `/api/backend` 代理执行 PATCH。金额转换和 payload 构造放在无 React 依赖的纯函数模块中，以 Bun 单测覆盖精确元/分转换和乐观版本字段。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、shadcn/Radix、Tailwind、Bun test、Fastify Batch B API

---

### Task 1: 商品类型与金额转换

**Files:**
- Create: `apps/admin/components/branding-addon/platform-branding-addon-product-types.ts`
- Create: `apps/admin/components/branding-addon/platform-branding-addon-product-form-data.ts`
- Test: `apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts`

- [ ] **Step 1: 写金额和 payload 的失败测试**

测试定义 `PlatformBrandingAddonProduct`，并断言：

```ts
expect(formatFenAsYuanInput(1)).toBe("0.01");
expect(formatFenAsYuanInput(12_345)).toBe("123.45");
expect(parseYuanInputToFen("0.01")).toEqual({ ok: true, amountFen: 1 });
expect(parseYuanInputToFen("1.001")).toEqual({
  ok: false,
  message: "年度价格最多保留两位小数",
});
expect(buildProductPatch(product, values)).toEqual({
  name: "年度品牌技术支持",
  amount_fen: 9_900,
  purchase_notes: "支付成功后自动开通或续期一年",
  enabled: true,
  version: 2,
});
```

- [ ] **Step 2: 运行测试并确认因模块缺失而失败**

Run:

```bash
bun test apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts
```

Expected: FAIL，提示目标模块不存在。

- [ ] **Step 3: 实现最小纯函数**

实现：

```ts
export const MAX_BRANDING_ADDON_AMOUNT_FEN = 2_147_483_647;

export function formatFenAsYuanInput(amountFen: number | null): string;

export function parseYuanInputToFen(
  value: string,
): { ok: true; amountFen: number } | { ok: false; message: string };

export function buildProductPatch(
  product: PlatformBrandingAddonProduct,
  values: PlatformBrandingAddonProductFormValues,
): PlatformBrandingAddonProductPatch;
```

转换使用字符串拆分整数位和小数位，不使用 `Math.round(Number(value) * 100)`。

- [ ] **Step 4: 运行测试并确认通过**

Run:

```bash
bun test apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts
```

Expected: PASS，0 failures。

### Task 2: Admin 页面与商品表单

**Files:**
- Create: `apps/admin/app/(console)/platform/branding-addon/page.tsx`
- Create: `apps/admin/components/branding-addon/platform-branding-addon-product-form.tsx`
- Test: `apps/admin/components/branding-addon/platform-branding-addon-product-admin-contract.test.ts`

- [ ] **Step 1: 写页面契约失败测试**

源码契约测试需要断言：

```ts
expect(page).toContain("/platform/branding/entitlement-product");
expect(page).toContain("platform.branding_product.manage");
expect(page).toContain("isPlatformOnlySession");
expect(form).toContain("requestBackendJson");
expect(form).toContain('method: "PATCH"');
expect(form).toContain("BRANDING_ADDON_PRODUCT_VERSION_CONFLICT");
expect(form).toContain("FieldGroup");
expect(form).toContain("Switch");
expect(form).toContain("历史订单保留创建时的商品快照");
```

- [ ] **Step 2: 运行契约测试并确认因页面缺失而失败**

Run:

```bash
bun test apps/admin/components/branding-addon/platform-branding-addon-product-admin-contract.test.ts
```

Expected: FAIL，缺少页面和表单文件。

- [ ] **Step 3: 实现服务端页面**

页面行为：

```ts
const hasManagePermission = isPlatformOnlySession(session) &&
  session.permissions.some(
    (permission) => permission.code === "platform.branding_product.manage",
  );
```

只有 `hasManagePermission` 为真时才携带 Admin token 请求
`GET /platform/branding/entitlement-product`。加载失败使用 `StatusAlert`
展示，成功时把 `product` 传给客户端表单。

- [ ] **Step 4: 实现客户端表单**

表单使用：

- `Card` 完整结构；
- `FieldGroup` + `Field`；
- 商品名称 `Input`；
- 年度价格 `Input type="text" inputMode="decimal"`；
- 购买说明 `Textarea`；
- 上架状态 `Switch`；
- 保存按钮的 pending 状态；
- `StatusAlert` 展示成功、错误和版本冲突；
- PATCH 成功后以响应商品更新本地 state 和 `version`；
- 版本冲突时提供调用 `router.refresh()` 的重新加载按钮。

- [ ] **Step 5: 运行两个定向测试并确认通过**

Run:

```bash
bun test \
  apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts \
  apps/admin/components/branding-addon/platform-branding-addon-product-admin-contract.test.ts
```

Expected: PASS，0 failures。

### Task 3: 权限导航

**Files:**
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/layout/admin-nav-visibility.test.ts`

- [ ] **Step 1: 写导航权限失败测试**

在现有导航测试中断言：

```ts
const brandingItem = platformNavGroups
  .flatMap((group) => group.items)
  .find((item) => item.href === "/platform/branding-addon");

expect(brandingItem?.label).toBe("品牌权益");
expect(brandingItem?.permission).toBe("platform.branding_product.manage");
expect(hasMenuItemAccess(withPermission, brandingItem!)).toBe(true);
expect(hasMenuItemAccess(withoutPermission, brandingItem!)).toBe(false);
```

- [ ] **Step 2: 运行测试并确认因菜单缺失而失败**

Run:

```bash
bun test apps/admin/components/layout/admin-nav-visibility.test.ts
```

Expected: FAIL，`brandingItem` 为 `undefined`。

- [ ] **Step 3: 增加平台配置菜单**

复用 `BadgeCheck` 图标，增加：

```ts
{
  href: "/platform/branding-addon",
  label: "品牌权益",
  icon: BadgeCheck,
  permission: "platform.branding_product.manage",
}
```

- [ ] **Step 4: 运行导航和品牌页面测试**

Run:

```bash
bun test \
  apps/admin/components/layout/admin-nav-visibility.test.ts \
  apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts \
  apps/admin/components/branding-addon/platform-branding-addon-product-admin-contract.test.ts
```

Expected: PASS，0 failures。

### Task 4: 静态、构建和浏览器验证

**Files:**
- Modify only if verification reveals a defect in the files listed above.

- [ ] **Step 1: 运行格式与差异检查**

Run:

```bash
git diff --check
pnpm --dir apps/admin check
```

Expected: 两条命令均 exit 0。

- [ ] **Step 2: 运行 Admin 生产构建**

Run:

```bash
pnpm --dir apps/admin build
```

Expected: Next.js build exit 0，生成 `/platform/branding-addon` 路由。

- [ ] **Step 3: 本地浏览器 smoke**

使用 API 3000 和 Admin 3010：

```bash
python /Users/leefo/.codex/skills/webapp-testing/scripts/with_server.py --help
```

随后用 helper 启动服务，并使用 headless Chromium 验证：

1. 平台超管登录后能看到“品牌权益”菜单；
2. 页面显示当前商品和元价格；
3. 保存后出现成功提示且显示后端返回的新版本；
4. 刷新后值保持；
5. 控制台无 error。

浏览器 smoke 使用原值保存或先保存测试值再恢复原值，避免遗留远程 dev
商品配置变更。

- [ ] **Step 4: 提交实现**

Run:

```bash
git add \
  apps/admin/app/\(console\)/platform/branding-addon/page.tsx \
  apps/admin/components/branding-addon \
  apps/admin/components/layout/menu-config.ts \
  apps/admin/components/layout/admin-nav-visibility.test.ts
git commit -m "feat(admin): 增加品牌权益商品配置"
```

Expected: 提交成功且工作区干净。

