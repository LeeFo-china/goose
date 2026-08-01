# 微信虚拟支付配置统一入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将年度品牌权益的微信虚拟支付配置完整迁入 Admin“系统配置 → 支付配置”，并把商品经营与支付基础设施的接口、权限和表单边界彻底分开。

**Architecture:** 保留 `platform_addon_products`、`platform_virtual_payment_products` 和现有原子 RPC 作为数据事实，不新增配置表。API 新增支付域 facade/service 和专用路由，以 `platform.payment.config.read/manage` 管理映射、密钥、校验和销售模式；品牌权益接口只允许修改商品字段。Admin 在现有支付面板增加“普通微信支付 / 数字权益虚拟支付”一级页签，品牌权益页改为商品表单加只读支付摘要。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod、Supabase RPC、Next.js 15、React 19、shadcn/Radix、Tailwind CSS、bun:test

---

## 文件结构

### API

- Create: `apps/api/src/services/platform-branding-virtual-payment-settings.ts` — 支付域唯一编排入口，负责读取快照、权限、映射保存、密钥覆盖写入、消息令牌和校验。
- Create: `apps/api/src/services/platform-branding-virtual-payment-settings.test.ts` — 支付读写权限、密钥脱敏、版本冲突、切换阻断和审计测试。
- Modify: `apps/api/src/schema/platform-payment-configs.ts` — 新增虚拟支付环境、映射、销售模式、AppKey 和消息令牌请求 schema。
- Modify: `apps/api/src/schema/platform-payment-configs.test.ts` — 新接口严格 schema 契约。
- Modify: `apps/api/src/schema/branding-addon.ts` — 品牌商品 PATCH 删除支付字段。
- Modify: `apps/api/src/schema/branding-addon.test.ts` — 证明旧 PATCH 拒绝 `purchase_mode` 和 `virtual_product`。
- Modify: `apps/api/src/controllers/platform-payment-configs/index.ts` — 注册支付域读取、保存、密钥、消息令牌和校验路由。
- Modify: `apps/api/src/controllers/platform-payment-configs/routes.test.ts` — 验证路由、方法和 service 委派。
- Modify: `apps/api/src/controllers/branding-addon/index.ts` — 旧校验路由仅作兼容并委派支付域 service。
- Modify: `apps/api/src/controllers/branding-addon/routes.test.ts` — 更新兼容权限与品牌 PATCH 契约。
- Modify: `apps/api/src/services/platform-branding-addon-product.ts` — 仅保留商品字段更新；读取结果保留只读支付摘要。
- Modify: `apps/api/src/services/platform-branding-addon-product.test.ts` — 商品权限不能再修改支付配置。
- Modify: `apps/api/src/services/branding-virtual-product-management.ts` — 将可复用的快照/校验逻辑开放给支付域，权限由调用方明确传入。
- Modify: `apps/api/src/services/branding-virtual-product-management.test.ts` — 校验使用支付权限。
- Modify: `apps/api/src/services/system-settings/legacy/definitions-wechat-notify.ts` — 将既有 `WECHAT_VIRTUAL_MESSAGE_TOKEN` 归入支付配置分组，不创建重复定义。
- Modify: `apps/api/src/services/system-settings/legacy/definitions.ts` — 将消息令牌加入支付专用安全写入白名单。
- Modify: `apps/api/src/services/system-settings/legacy/definitions-wechat-notify.test.ts` — 验证消息令牌定义、平台作用域和敏感属性。
- Create: `supabase/migrations/20260801105000_atomic_platform_payment_secret_settings.sql` — 原子写入支付密钥并写入脱敏变更日志，仅授权 `service_role`。
- Modify: `apps/api/src/repositories/system-settings.ts` — 支付密钥使用原子 RPC；所有 secret 的通用变更日志不保存值。
- Modify: `apps/api/src/repositories/system-settings.test.ts` — 密钥日志脱敏、RPC 错误映射与事务入口契约。

### Admin

- Create: `apps/admin/components/settings/platform-virtual-payment-settings-types.ts` — 支付配置页专属安全响应与请求类型。
- Create: `apps/admin/components/settings/platform-virtual-payment-settings-data.ts` — 映射表单值、金额转换、请求构建和模式转换校验。
- Create: `apps/admin/components/settings/platform-virtual-payment-settings-data.test.ts` — 纯函数测试。
- Create: `apps/admin/components/settings/platform-virtual-payment-settings.tsx` — 虚拟支付总体状态、环境映射、AppKey、消息令牌、校验和模式切换交互。
- Create: `apps/admin/components/settings/platform-virtual-payment-secret-form.tsx` — AppKey/消息令牌覆盖写入表单，不回显现值。
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.tsx` — 增加普通支付/虚拟支付一级页签和 URL 深链。
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.test.ts` — 页面入口、深链、脱敏和 shadcn 交互契约。
- Create: `apps/admin/components/branding-addon/platform-branding-payment-summary.tsx` — 品牌权益页只读支付摘要和设置深链。
- Modify: `apps/admin/components/branding-addon/platform-branding-virtual-product-form.tsx` — 收敛为商品保存壳并移除支付编辑。
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-types.ts` — 商品 PATCH 类型删除支付字段，读取类型保留摘要。
- Modify: `apps/admin/components/branding-addon/platform-branding-admin-tabs.tsx` — “商品与支付通道”改为“权益商品”。
- Modify: `apps/admin/app/(console)/platform/branding-addon/page.tsx` — 不再传入可编辑虚拟映射。
- Modify: `apps/admin/app/(console)/platform/branding-addon/loading.tsx` — 商品页骨架与精简后的卡片一致。
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-admin-contract.test.ts` — 商品表单与深链契约。
- Modify: `apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts` — 支付控件迁出和骨架契约。

## Task 1: 收紧品牌权益商品写接口

**Files:**
- Modify: `apps/api/src/schema/branding-addon.ts`
- Modify: `apps/api/src/schema/branding-addon.test.ts`
- Modify: `apps/api/src/services/platform-branding-addon-product.ts`
- Modify: `apps/api/src/services/platform-branding-addon-product.test.ts`

- [ ] **Step 1: 写失败的 schema 与 service 边界测试**

在 schema 测试中增加严格拒绝支付字段的断言：

```ts
expect(BrandingAddonProductPatchSchema.safeParse({
  version: 4,
  purchase_mode: "maintenance",
}).success).toBe(false);
expect(BrandingAddonProductPatchSchema.safeParse({
  version: 4,
  virtual_product: {},
}).success).toBe(false);
```

在 service 测试中断言 `manageConfiguration` 收到的 `productPatch` 只包含 `name`、`amount_fen`、`purchase_notes`、`enabled`，且不再读取密钥或虚拟映射。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun --cwd=apps/api test src/schema/branding-addon.test.ts src/services/platform-branding-addon-product.test.ts`

Expected: FAIL，因为当前 schema 和 service 仍接受 `purchase_mode`、`virtual_product`。

- [ ] **Step 3: 实现最小商品专用 PATCH**

把可变字段固定为：

```ts
const PRODUCT_PATCH_MUTABLE_FIELDS = [
  "name",
  "amount_fen",
  "purchase_notes",
  "enabled",
] as const;
```

`PlatformBrandingAddonProductService.update()` 只做商品版本、价格和启用校验，然后调用现有原子 RPC：

```ts
await this.virtualProductRepository.manageConfiguration({
  expectedProductVersion: input.version,
  productPatch: buildProductPatch(input),
  virtualProductPatch: {},
  actorEmployeeId: actor.employeeId,
});
```

读取继续返回 `purchase_mode` 和支付摘要，但商品写路径不得调用密钥读取或映射校验。

- [ ] **Step 4: 运行聚焦测试**

Run: `bun --cwd=apps/api test src/schema/branding-addon.test.ts src/services/platform-branding-addon-product.test.ts src/services/platform-branding-addon-product-virtual.test.ts`

Expected: PASS；旧 virtual service 测试如依赖商品写接口，应改为覆盖新支付 service，而不是放宽商品 schema。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/schema/branding-addon.ts apps/api/src/schema/branding-addon.test.ts apps/api/src/services/platform-branding-addon-product.ts apps/api/src/services/platform-branding-addon-product.test.ts apps/api/src/services/platform-branding-addon-product-virtual.test.ts
git commit -m "refactor(payments): 分离权益商品写入边界"
```

## Task 2: 建立虚拟支付配置 schema 与权限 service

**Files:**
- Modify: `apps/api/src/schema/platform-payment-configs.ts`
- Modify: `apps/api/src/schema/platform-payment-configs.test.ts`
- Create: `apps/api/src/services/platform-branding-virtual-payment-settings.ts`
- Create: `apps/api/src/services/platform-branding-virtual-payment-settings.test.ts`
- Modify: `apps/api/src/services/branding-virtual-product-management.ts`
- Modify: `apps/api/src/services/branding-virtual-product-management.test.ts`

- [ ] **Step 1: 写失败的 schema 和权限测试**

定义并测试以下严格输入：

```ts
export const PlatformWechatVirtualEnvironmentSchema = z.enum([
  "sandbox",
  "production",
]);

export const PlatformWechatVirtualProductPatchSchema = z.object({
  environment: PlatformWechatVirtualEnvironmentSchema,
  app_id: z.string().trim().min(1).max(64),
  virtual_merchant_id: z.string().trim().min(1).max(64),
  offer_id: z.string().trim().min(1).max(128),
  provider_product_id: z.string().trim().min(1).max(128),
  expected_amount_fen: z.number().int().positive(),
  secret_revision: z.number().int().positive(),
  status: z.enum(["draft", "active", "disabled"]),
  version: z.number().int().positive(),
}).strict();

export const UpdatePlatformWechatVirtualSettingsSchema = z.object({
  version: z.number().int().positive(),
  purchase_mode: z.enum(["direct_legacy", "maintenance", "wechat_virtual"]).optional(),
  virtual_product: PlatformWechatVirtualProductPatchSchema.optional(),
}).strict();

export const UpdatePlatformWechatVirtualSecretBundleSchema = z.object({
  app_key: z.string().trim().min(1).max(512),
  revision: z.number().int().positive(),
}).strict();

export const UpdatePlatformWechatVirtualMessageTokenSchema = z.object({
  message_token: z.string().trim().min(1).max(512),
}).strict();
```

Service 测试覆盖：read 权限可读取、manage 权限可写、品牌商品权限读写均被拒绝、非平台账号被拒绝、响应不包含 AppKey 或消息令牌。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun --cwd=apps/api test src/schema/platform-payment-configs.test.ts src/services/platform-branding-virtual-payment-settings.test.ts`

Expected: FAIL，因为 schema 和 service 尚不存在。

- [ ] **Step 3: 实现支付域 service**

Service 使用以下权限常量和公开方法：

```ts
const READ_PERMISSION = "platform.payment.config.read";
const MANAGE_PERMISSION = "platform.payment.config.manage";

class PlatformBrandingVirtualPaymentSettingsService {
  get(authContext: AuthContext): Promise<PlatformVirtualPaymentSettingsView>;
  update(authContext: AuthContext, input: UpdatePlatformWechatVirtualSettingsInput): Promise<PlatformVirtualPaymentSettingsView>;
  saveSecretBundle(authContext: AuthContext, environment: BrandingVirtualPaymentEnvironment, input: UpdatePlatformWechatVirtualSecretBundleInput): Promise<PlatformVirtualSecretStatus>;
  saveMessageToken(authContext: AuthContext, input: UpdatePlatformWechatVirtualMessageTokenInput): Promise<PlatformVirtualSecretStatus>;
  validate(authContext: AuthContext, input: { environment: BrandingVirtualPaymentEnvironment; version: number }): Promise<PlatformVirtualValidationResult>;
}
```

`get()` 并行读取固定单商品/双环境快照、两个 AppKey 元数据和消息令牌元数据；`update()` 复用 `manageConfiguration` 原子 RPC 与现有前向模式状态机，并按 `environment` 在服务端注入固定 `encrypted_secret_ref`，绝不信任客户端设置键；`validate()` 先做本地校验，再只读查询微信最近一次上传和发布任务。在固定单商品边界内，只有商品 ID、价格、上传态和发布态全部一致才写入 `valid`；处理中或无法确认写入 `pending`，明确不匹配写入 `invalid`。校验不得调用微信上传或发布接口。所有 repository 异常用 `Errors.dbError()` 包装。

- [ ] **Step 4: 运行聚焦测试**

Run: `bun --cwd=apps/api test src/schema/platform-payment-configs.test.ts src/services/platform-branding-virtual-payment-settings.test.ts src/services/branding-virtual-product-management.test.ts`

Expected: PASS，且品牌商品权限不能调用支付写方法。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/schema/platform-payment-configs.ts apps/api/src/schema/platform-payment-configs.test.ts apps/api/src/services/platform-branding-virtual-payment-settings.ts apps/api/src/services/platform-branding-virtual-payment-settings.test.ts apps/api/src/services/branding-virtual-product-management.ts apps/api/src/services/branding-virtual-product-management.test.ts
git commit -m "feat(payments): 新增虚拟支付配置服务"
```

## Task 3: 接入 AppKey 与消息令牌安全写入

**Files:**
- Modify: `apps/api/src/services/system-settings/legacy/definitions-wechat-notify.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions-wechat-notify.test.ts`
- Modify: `apps/api/src/services/platform-branding-virtual-payment-settings.ts`
- Modify: `apps/api/src/services/platform-branding-virtual-payment-settings.test.ts`
- Create: `supabase/migrations/20260801105000_atomic_platform_payment_secret_settings.sql`
- Modify: `apps/api/src/repositories/system-settings.ts`
- Modify: `apps/api/src/repositories/system-settings.test.ts`

- [ ] **Step 1: 写失败的密钥安全测试**

测试设置定义满足：

```ts
expect(definition.key).toBe("WECHAT_VIRTUAL_MESSAGE_TOKEN");
expect(definition.groupCode).toBe("payment");
expect(definition.isSecret).toBe(true);
expect(PLATFORM_PAYMENT_SECRET_SETTING_KEYS.has(definition.key)).toBe(true);
```

测试接口输入 `{ app_key, revision }` 按既有运行时契约固定序列化为 `{ appKey, revision }`，消息令牌保存到固定键，响应只返回：

```ts
{ configured: true, source: "database", revision: 3 }
```

并断言响应 JSON 不包含提交的 secret 字符串。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun --cwd=apps/api test src/services/system-settings/legacy/definitions-wechat-notify.test.ts src/services/platform-branding-virtual-payment-settings.test.ts`

Expected: FAIL，因为既有消息令牌仍归属微信分组、尚未进入支付专用写入白名单，且支付 service 尚未实现安全写入。

- [ ] **Step 3: 实现设置定义和覆盖写入**

把既有消息令牌定义的 `groupCode` 调整为 `payment`，并加入 `PLATFORM_PAYMENT_SECRET_SETTING_KEYS`；不得再创建同名定义。通过现有 `updatePlatformPaymentSecretSetting()` 写入。环境到键的映射只能来自：

```ts
const VIRTUAL_SECRET_KEYS = {
  sandbox: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
  production: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
} as const;
```

消息令牌固定使用 `WECHAT_VIRTUAL_MESSAGE_TOKEN`。小程序原始 ID 继续归属微信配置，只在虚拟支付就绪信息中返回合法性状态和微信配置修复入口。审计只记录设置键、环境、修订号和 configured，不记录值。

新增 `upsert_platform_payment_secret_setting(...)` 安全函数，在单个事务内 upsert 平台级敏感设置并插入 `system_setting_change_logs`。函数只接受服务端白名单支付密钥，强制 `tenant_id IS NULL`、`is_secret=true`，日志的 `old_value_text/new_value_text` 固定为 `NULL`，仅授权 `service_role`。repository 的支付密钥专用方法只调用该 RPC；通用 `updateValue/createValue` 遇到 secret 记录时同样不得把值写入日志。

- [ ] **Step 4: 运行测试**

Run: `bun --cwd=apps/api test src/services/system-settings/legacy/definitions-wechat-notify.test.ts src/services/system-settings/legacy/crypto.test.ts src/repositories/system-settings.test.ts src/services/platform-branding-virtual-payment-settings.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add supabase/migrations/20260801105000_atomic_platform_payment_secret_settings.sql apps/api/src/repositories/system-settings.ts apps/api/src/repositories/system-settings.test.ts apps/api/src/services/system-settings/legacy/definitions-wechat-notify.ts apps/api/src/services/system-settings/legacy/definitions.ts apps/api/src/services/system-settings/legacy/definitions-wechat-notify.test.ts apps/api/src/services/platform-branding-virtual-payment-settings.ts apps/api/src/services/platform-branding-virtual-payment-settings.test.ts
git commit -m "feat(payments): 管理虚拟支付密钥与消息令牌"
```

## Task 4: 发布支付域路由并保留兼容校验路径

**Files:**
- Modify: `apps/api/src/controllers/platform-payment-configs/index.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/routes.test.ts`
- Modify: `apps/api/src/controllers/branding-addon/index.ts`
- Modify: `apps/api/src/controllers/branding-addon/routes.test.ts`

- [ ] **Step 1: 写失败的路由测试**

路由表必须包含：

```ts
[
  "GET /platform/payment/wechat-virtual/branding-entitlement",
  "PATCH /platform/payment/wechat-virtual/branding-entitlement",
  "PUT /platform/payment/wechat-virtual/branding-entitlement/:environment/secret-bundle",
  "PUT /platform/payment/wechat-virtual/message-token",
  "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/validate",
]
```

测试非法环境和额外字段返回 Zod 包装错误；测试旧品牌校验路径委派到支付 service 而不是商品 service。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun --cwd=apps/api test src/controllers/platform-payment-configs/routes.test.ts src/controllers/branding-addon/routes.test.ts`

Expected: FAIL，因为新路由尚未注册。

- [ ] **Step 3: 实现 controller 委派**

每个 handler 按固定顺序执行：获取 platform context、safeParse query/params/body、调用 `platformBrandingVirtualPaymentSettingsService`、`ResponseHandler.success(data)`。旧校验 handler 增加弃用注释并调用同一支付 service；不在 controller 查询 Supabase。

- [ ] **Step 4: 运行 controller 与 typecheck**

Run: `bun --cwd=apps/api test src/controllers/platform-payment-configs/routes.test.ts src/controllers/branding-addon/routes.test.ts && pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit`

Expected: PASS，TypeScript 零错误。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/controllers/platform-payment-configs/index.ts apps/api/src/controllers/platform-payment-configs/routes.test.ts apps/api/src/controllers/branding-addon/index.ts apps/api/src/controllers/branding-addon/routes.test.ts
git commit -m "feat(payments): 发布虚拟支付配置接口"
```

## Task 5: 建立 Admin 虚拟支付安全类型与表单数据层

**Files:**
- Create: `apps/admin/components/settings/platform-virtual-payment-settings-types.ts`
- Create: `apps/admin/components/settings/platform-virtual-payment-settings-data.ts`
- Create: `apps/admin/components/settings/platform-virtual-payment-settings-data.test.ts`
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-types.ts`
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts`

- [ ] **Step 1: 写失败的纯函数测试**

覆盖：人民币元转整数分、环境草稿到 PATCH、固定 secret revision、状态变更时版本携带、无效模式跳转、商品 PATCH 不含支付字段。安全响应类型不得声明 `app_key` 或 `message_token`。

```ts
expect(buildVirtualMappingPatch(summary, draft, 9900)).toEqual({
  environment: "production",
  app_id: "wx-app",
  virtual_merchant_id: "virtual-mch",
  offer_id: "offer",
  provider_product_id: "branding-annual",
  expected_amount_fen: 9900,
  secret_revision: 3,
  status: "draft",
  version: 2,
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun --cwd=apps/admin test components/settings/platform-virtual-payment-settings-data.test.ts components/branding-addon/platform-branding-addon-product-form-data.test.ts`

Expected: FAIL，因为新数据层不存在且旧商品 PATCH 类型仍包含支付字段。

- [ ] **Step 3: 实现安全类型和纯函数**

`PlatformVirtualPaymentSettingsView` 包含 `product`、`purchase_mode`、`virtual_products`、`message_token_status`、`readiness`、`can_manage`。secret 状态仅为：

```ts
type PlatformVirtualSecretStatus = {
  configured: boolean;
  source: "database" | "environment" | "missing";
  revision: number | null;
};
```

商品 PATCH 类型只保留 `name`、`amount_fen`、`purchase_notes`、`enabled`、`version`。

- [ ] **Step 4: 运行测试**

Run: `bun --cwd=apps/admin test components/settings/platform-virtual-payment-settings-data.test.ts components/branding-addon/platform-branding-addon-product-form-data.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/admin/components/settings/platform-virtual-payment-settings-types.ts apps/admin/components/settings/platform-virtual-payment-settings-data.ts apps/admin/components/settings/platform-virtual-payment-settings-data.test.ts apps/admin/components/branding-addon/platform-branding-addon-product-types.ts apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts
git commit -m "refactor(admin): 分离虚拟支付配置类型"
```

## Task 6: 在支付配置页实现虚拟支付交互

**Files:**
- Create: `apps/admin/components/settings/platform-virtual-payment-settings.tsx`
- Create: `apps/admin/components/settings/platform-virtual-payment-secret-form.tsx`
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.tsx`
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.test.ts`

- [ ] **Step 1: 写失败的 UI 契约测试**

断言支付面板包含“普通微信支付”“数字权益虚拟支付”、解析 `section` 和 `environment`、调用五个新接口、使用 `FieldGroup`/`Tabs`/`AlertDialog`、密钥输入为 password 且没有 current value 回填。断言生产切换按钮在 readiness 未通过时 disabled。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun --cwd=apps/admin test components/settings/platform-payment-settings-panel.test.ts`

Expected: FAIL，因为虚拟支付页签与组件不存在。

- [ ] **Step 3: 实现一级页签和深链状态**

面板模式固定为：

```ts
type PaymentSection = "ordinary" | "virtual";
const section = searchParams.get("section") === "virtual" ? "virtual" : "ordinary";
```

切换页签通过 `router.replace` 更新 `group=payment&section=...`，保留其他参数。普通支付原 profile 页签完整嵌入 ordinary 内容，不改变现有请求。

- [ ] **Step 4: 实现虚拟支付表单**

虚拟支付组件挂载时 GET 快照；映射、AppKey、消息令牌、校验、模式切换分别请求对应 API。沙箱/生产环境以页签展示；所有保存成功后刷新快照。模式切换使用 `AlertDialog` 二次确认，文案明确不会自动回退普通支付。

- [ ] **Step 5: 运行测试与 Admin 静态检查**

Run: `bun --cwd=apps/admin test components/settings/platform-payment-settings-panel.test.ts components/settings/platform-virtual-payment-settings-data.test.ts && pnpm --dir apps/admin check`

Expected: PASS，文件大小检查和 TypeScript 零错误。

- [ ] **Step 6: 提交**

```bash
git add apps/admin/components/settings/platform-virtual-payment-settings.tsx apps/admin/components/settings/platform-virtual-payment-secret-form.tsx apps/admin/components/settings/platform-payment-settings-panel.tsx apps/admin/components/settings/platform-payment-settings-panel.test.ts
git commit -m "feat(admin): 统一虚拟支付配置入口"
```

## Task 7: 精简品牌权益商品页并加入支付深链

**Files:**
- Create: `apps/admin/components/branding-addon/platform-branding-payment-summary.tsx`
- Modify: `apps/admin/components/branding-addon/platform-branding-virtual-product-form.tsx`
- Modify: `apps/admin/components/branding-addon/platform-branding-admin-tabs.tsx`
- Modify: `apps/admin/app/(console)/platform/branding-addon/page.tsx`
- Modify: `apps/admin/app/(console)/platform/branding-addon/loading.tsx`
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-admin-contract.test.ts`
- Modify: `apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

- [ ] **Step 1: 写失败的商品页契约测试**

断言页面使用商品表单和 `PlatformBrandingPaymentSummary`，包含 `/settings?group=payment&section=virtual`，不再包含虚拟映射输入、校验请求或 `initialVirtualProducts`。断言标签为“权益商品”，加载骨架包含商品字段区和支付摘要区，不再模拟环境配置三列。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun --cwd=apps/admin test components/branding-addon/platform-branding-addon-product-admin-contract.test.ts components/branding-addon/platform-branding-virtual-admin-contract.test.ts`

Expected: FAIL，因为旧页面仍编辑支付参数。

- [ ] **Step 3: 实现商品专用页面**

保留现有 `PlatformBrandingAddonProductFields` 和乐观锁保存。支付摘要只显示模式、沙箱/生产状态和就绪阻塞数，并提供：

```tsx
<Button asChild variant="outline">
  <Link href="/settings?group=payment&section=virtual&environment=production">
    前往支付配置
  </Link>
</Button>
```

删除品牌页对映射草稿、验证、密钥状态编辑和模式变更的状态管理。

- [ ] **Step 4: 同步骨架屏并运行测试**

Run: `bun --cwd=apps/admin test components/branding-addon/platform-branding-addon-product-admin-contract.test.ts components/branding-addon/platform-branding-virtual-admin-contract.test.ts && pnpm --dir apps/admin check`

Expected: PASS，骨架和真实商品页均填满固定工作区且无截断。

- [ ] **Step 5: 提交**

```bash
git add apps/admin/components/branding-addon/platform-branding-payment-summary.tsx apps/admin/components/branding-addon/platform-branding-virtual-product-form.tsx apps/admin/components/branding-addon/platform-branding-admin-tabs.tsx 'apps/admin/app/(console)/platform/branding-addon/page.tsx' 'apps/admin/app/(console)/platform/branding-addon/loading.tsx' apps/admin/components/branding-addon/platform-branding-addon-product-admin-contract.test.ts apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts
git commit -m "refactor(admin): 精简品牌权益商品配置"
```

## Task 8: 全量验证与浏览器 smoke

**Files:**
- Modify only if verification exposes a root-cause defect in the files already listed above.

- [ ] **Step 1: 运行 API 聚焦回归**

Run:

```bash
bun --cwd=apps/api test \
  src/schema/branding-addon.test.ts \
  src/schema/platform-payment-configs.test.ts \
  src/services/platform-branding-addon-product.test.ts \
  src/services/platform-branding-virtual-payment-settings.test.ts \
  src/services/branding-virtual-product-management.test.ts \
  src/controllers/platform-payment-configs/routes.test.ts \
  src/controllers/branding-addon/routes.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行静态检查和构建**

Run:

```bash
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
```

Expected: 全部退出码为 0，无类型、文件大小、构建或空白错误。

- [ ] **Step 3: 验证并应用支付密钥原子 migration**

Run: `git diff origin/main...HEAD -- supabase/migrations && supabase db push --include-all && supabase migration list`

Expected: 只新增 `20260801105000_atomic_platform_payment_secret_settings.sql` 和 `20260801110000_support_pending_branding_virtual_product_validation.sql`；应用成功后 Local/Remote migration 列表对齐。执行前先确认目标 project 来自当前开发环境配置；不得对未确认的生产项目执行。

- [ ] **Step 4: 浏览器验收**

在已登录平台超管会话访问：

1. `/settings?group=payment&section=ordinary`：两个普通支付 profile 正常显示。
2. `/settings?group=payment&section=virtual&environment=sandbox`：沙箱配置页显示且 URL 状态保持。
3. `/settings?group=payment&section=virtual&environment=production`：生产配置、密钥状态、消息令牌、校验和模式切换可见；不输入真实密钥，不执行生产切换。
4. `/platform/branding-addon`：只显示权益商品字段和只读支付摘要；深链可返回支付配置。
5. `/platform/branding-addon?view=orders` 与 `?view=refunds`：原列表和筛选不变。

Expected: 页面无横向溢出、底部截断、console runtime error 或密钥明文；只读账号看得到状态但所有写操作禁用。

- [ ] **Step 5: 检查分支与提交历史**

Run: `git status --short --branch && git log --oneline --decorate origin/main..HEAD`

Expected: 工作树干净；提交按设计、API、Admin、验证边界排列，没有用户无关文件。

- [ ] **Step 6: 记录最终验证提交**

若验证阶段修复了已列文件：

```bash
git add <本次根因修复文件>
git commit -m "fix(payments): 修正虚拟支付配置验收问题"
```

若没有代码变化，不创建空提交。
