# Platform Digital Entitlement Virtual Payment Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将年度品牌权益的新购买安全迁移到微信小程序虚拟支付，同时完整保留现有独立商户号普通支付基础设施，供后续平台自营实物商城及其他合规交易使用。

**Architecture:** 继续以 `platform_addon_products` 和 `tenant_entitlements` 作为业务商品与权益事实，新建虚拟商品映射、虚拟订单、微信会话凭据、消息、退款与统一查询域。通知与主动查单汇聚到同一个原子履约 RPC；切换通过 `purchase_mode` 状态机和旧订单收敛程序完成，虚拟支付故障只进入维护态，不回退普通支付。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration、Next.js 15、React 19、shadcn/ui、微信小程序虚拟支付 HTTP API、微信 `wx.requestVirtualPayment`

---

## 实施前提与边界

- 设计基线：`docs/superpowers/specs/2026-07-31-platform-digital-entitlement-virtual-payment-migration-design.md`。
- 首期商品固定为 `custom_support_branding_annual`，权益固定为 `custom_support_branding`，数量固定为 `1`，期限固定为一个自然年。
- 生产虚拟商品金额不得低于 `100` 分，Android、鸿蒙、Windows、iOS 的用户展示价一致。
- 不实现自动续费，不增加租户自助退款，不修改 `/Users/leefo/Public/work/orange`。
- 不删除 `platform_direct_recharge`、`direct_merchant`、APIv3 普通支付网关、普通支付回调、退款、查单、关单或账单能力。
- 后续平台自营实物商城建立独立商品、订单、发货、收货和售后领域，普通支付业务通道使用 `platform_marketplace_goods`，不得复用 `tenant_recharge` 或权益订单表，并按小程序发货信息管理服务补齐物流与确认收货。
- 所有数据库对象、权限和初始化数据只通过 `supabase/migrations/` 变更；远端不得手工执行 DDL/DML。
- 列表默认 `page=1&pageSize=20`，最大 `100`；worker 每批最多 `100`；Repository 查询限定字段并使用 `.range()`、`.limit()` 或 claim RPC。
- 微信字段、签名算法和消息验证参数在开始 Task 4 前，必须再次核对当天官方文档；不得根据名称习惯猜测。

## 文件职责总览

### 数据库

- `supabase/migrations/20260731130000_create_branding_virtual_payment_foundation.sql`：商品购买模式、虚拟商品映射、虚拟订单、权限、RLS、索引和订单创建 RPC。
- `supabase/migrations/20260731131000_create_wechat_mini_session_credentials.sql`：加密微信会话凭据、轮换 RPC、撤销触发器和访问边界。
- `supabase/migrations/20260731132000_create_branding_virtual_product_management_rpcs.sql`：虚拟商品验证生命周期、商品与映射原子管理 RPC、验证结果 RPC。
- `supabase/migrations/20260731133000_create_branding_virtual_payment_fulfillment.sql`：虚拟支付消息、支付确认与权益履约原子 RPC、claim RPC。
- `supabase/migrations/20260731134000_create_branding_entitlement_order_query.sql`：新旧订单统一分页、详情与筛选 RPC。
- `supabase/migrations/20260731135000_create_branding_virtual_payment_refunds.sql`：人工退款、退款状态、退款补偿事件和原子补偿 RPC。
- `supabase/migrations/20260731135500_guard_legacy_branding_payment_cutover.sql`：旧普通支付写入数据库保护、旧 pending claim 和切换前置校验。

### API

- `apps/api/src/services/branding-virtual-payment-contracts.ts`：虚拟支付枚举、DTO 和稳定错误码。
- `apps/api/src/repositories/branding-virtual-products.ts`：虚拟商品映射读写。
- `apps/api/src/services/branding-virtual-products.ts`：商品可售性、金额、环境和密钥版本校验。
- `apps/api/src/services/wechat-mini-session-crypto.ts`：`session_key` 专用 AES-256-GCM 加解密。
- `apps/api/src/repositories/wechat-mini-session-credentials.ts`：会话凭据轮换、读取、使用时间和失效。
- `apps/api/src/services/wechat-mini-session-credentials.ts`：OAuth 身份绑定、会话轮换与重新登录契约。
- `apps/api/src/services/wechat-virtual-payment-signatures.ts`：用户态签名与支付请求签名的纯函数。
- `apps/api/src/services/wechat-virtual-payment-gateway-contracts.ts`：虚拟支付服务器 API 输入、归一化结果和网关端口。
- `apps/api/src/services/wechat-virtual-payment-gateway-response.ts`：XPay 小写应答信封、订单与退款结果的严格运行时归一化。
- `apps/api/src/services/wechat-virtual-payment-response-reader.ts`：XPay 响应体 64 KiB 内部防御上限、流式读取和安全 requestId 归一化。
- `apps/api/src/services/wechat-virtual-payment-gateway.ts`：`query_order`、`refund_order`、`notify_provide_goods` 和账单 HTTP 边界。
- `apps/api/src/repositories/branding-virtual-orders.ts`：虚拟订单创建、查询、claim 和履约 RPC。
- `apps/api/src/services/tenant-branding-virtual-orders.ts`：租户订单创建与支付参数编排。
- `apps/api/src/repositories/wechat-virtual-payment-notifications.ts`：消息幂等落库与处理状态。
- `apps/api/src/services/wechat-virtual-payment-notifications.ts`：微信消息认证、归一化、上下文匹配和派发。
- `apps/api/src/services/branding-virtual-payment-confirmation.ts`：通知与主动查单共用的支付确认入口。
- `apps/api/src/controllers/wechat-virtual-payment/index.ts`：微信虚拟支付消息 GET 验证与 POST 接收。
- `apps/api/src/services/branding-virtual-payment-reconciliation.ts`：pending、grant_failed 和退款补偿扫描。
- `apps/api/src/repositories/branding-entitlement-order-query.ts`：统一订单 RPC。
- `apps/api/src/services/branding-entitlement-order-query.ts`：统一列表和详情序列化。
- `apps/api/src/repositories/branding-virtual-refunds.ts`：退款创建、查询、claim、状态和补偿 RPC。
- `apps/api/src/services/branding-virtual-refunds.ts`：超管人工退款、iOS 外部退款和审计。
- `apps/api/src/scripts/branding-virtual-payment-cutover.ts`：受控收敛旧 pending 订单并执行切换前检查。
- `apps/api/src/scripts/branding-virtual-payment-smoke.ts`：dev 契约 smoke，不发起真实扣款。

### Admin 与交接

- `apps/admin/app/(console)/platform/branding-addon/page.tsx`：商品、通道配置、统一订单和退款入口。
- `apps/admin/app/(console)/platform/branding-addon/loading.tsx`：与页面结构一致的骨架屏。
- `apps/admin/components/branding-addon/platform-branding-virtual-product-form.tsx`：虚拟商品映射与模式切换表单。
- `apps/admin/components/branding-addon/platform-branding-entitlement-orders.tsx`：统一订单列表和渠道标识。
- `apps/admin/components/branding-addon/platform-branding-virtual-refunds.tsx`：人工退款队列。
- `docs/miniprogram/2026-07-31-branding-virtual-payment-handoff.md`：小程序端契约与验收步骤。
- `docs/runbooks/branding-virtual-payment-cutover.md`：切换、维护、恢复和前向修复 runbook。

## Task 1：建立虚拟支付数据库基础和领域契约

**Files:**
- Create: `supabase/migrations/20260731130000_create_branding_virtual_payment_foundation.sql`
- Create: `packages/domain/src/branding-virtual-payment.ts`
- Create: `packages/domain/src/branding-virtual-payment.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/package.json`
- Create: `apps/api/src/services/branding-virtual-payment-contracts.ts`
- Create: `apps/api/src/services/branding-virtual-payment-migration-contract.test.ts`

- [ ] **Step 1: 先写 migration 契约测试**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(import.meta.dir, "../../../../supabase/migrations/20260731130000_create_branding_virtual_payment_foundation.sql"),
  "utf8",
).toLowerCase();

describe("branding virtual payment foundation migration", () => {
  test("adds an irreversible purchase-mode state machine", () => {
    expect(migration).toContain("purchase_mode text not null default 'direct_legacy'");
    expect(migration).toContain("direct_legacy', 'maintenance', 'wechat_virtual");
    expect(migration).toContain("guard_branding_addon_purchase_mode_transition");
  });

  test("creates isolated virtual product and order facts", () => {
    expect(migration).toContain("create table if not exists public.platform_virtual_payment_products");
    expect(migration).toContain("create table if not exists public.tenant_virtual_addon_orders");
    expect(migration).toContain("tenant_virtual_addon_orders_pending_product_unique_idx");
    expect(migration).toContain("branding_create_virtual_addon_order");
  });

  test("keeps client roles away from payment tables", () => {
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.tenant_virtual_addon_orders from anon, authenticated");
  });
});
```

- [ ] **Step 2: 运行测试，确认因 migration 不存在而失败**

Run: `bun test apps/api/src/services/branding-virtual-payment-migration-contract.test.ts`

Expected: FAIL，错误包含 `ENOENT` 和 `20260731130000_create_branding_virtual_payment_foundation.sql`。

- [ ] **Step 3: 创建 foundation migration**

Migration 必须包含以下真实结构；实现时沿用现有 migration 的 `set_updated_at()`、权限种子和 RLS 写法：

```sql
ALTER TABLE public.platform_addon_products
  ADD COLUMN purchase_mode text NOT NULL DEFAULT 'direct_legacy',
  ADD CONSTRAINT platform_addon_products_purchase_mode_check
    CHECK (purchase_mode IN ('direct_legacy', 'maintenance', 'wechat_virtual'));

CREATE OR REPLACE FUNCTION public.guard_branding_addon_purchase_mode_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.purchase_mode = NEW.purchase_mode THEN RETURN NEW; END IF;
  IF OLD.purchase_mode = 'direct_legacy' AND NEW.purchase_mode = 'maintenance' THEN RETURN NEW; END IF;
  IF OLD.purchase_mode = 'maintenance' AND NEW.purchase_mode = 'wechat_virtual' THEN RETURN NEW; END IF;
  IF OLD.purchase_mode = 'wechat_virtual' AND NEW.purchase_mode = 'maintenance' THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID';
END;
$$;

CREATE TRIGGER tr_platform_addon_products_purchase_mode
BEFORE UPDATE OF purchase_mode ON public.platform_addon_products
FOR EACH ROW EXECUTE FUNCTION public.guard_branding_addon_purchase_mode_transition();

CREATE TABLE public.platform_virtual_payment_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_product_id uuid NOT NULL REFERENCES public.platform_addon_products(id),
  provider text NOT NULL DEFAULT 'wechat_virtual' CHECK (provider = 'wechat_virtual'),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  app_id text NOT NULL CHECK (btrim(app_id) <> ''),
  virtual_merchant_id text NOT NULL CHECK (btrim(virtual_merchant_id) <> ''),
  offer_id text NOT NULL CHECK (btrim(offer_id) <> ''),
  provider_product_id text NOT NULL CHECK (btrim(provider_product_id) <> ''),
  goods_quantity integer NOT NULL DEFAULT 1 CHECK (goods_quantity = 1),
  expected_amount_fen integer NOT NULL CHECK (expected_amount_fen > 0),
  encrypted_secret_ref text NOT NULL CHECK (btrim(encrypted_secret_ref) <> ''),
  secret_revision integer NOT NULL CHECK (secret_revision > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'disabled')),
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validated_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES public.employees(id),
  updated_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (addon_product_id, environment),
  UNIQUE (offer_id, provider_product_id, environment),
  CHECK (environment <> 'production' OR expected_amount_fen >= 100)
);

CREATE TABLE public.tenant_virtual_addon_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_no text NOT NULL UNIQUE CHECK (btrim(order_no) <> ''),
  out_trade_no text NOT NULL UNIQUE CHECK (btrim(out_trade_no) <> ''),
  idempotency_key uuid NOT NULL,
  product_id uuid NOT NULL,
  product_code text NOT NULL,
  entitlement_code text NOT NULL,
  product_name text NOT NULL,
  amount_fen integer NOT NULL CHECK (amount_fen >= 100),
  term_years integer NOT NULL DEFAULT 1 CHECK (term_years = 1),
  purchase_notes text NOT NULL,
  refund_policy text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  offer_id text NOT NULL,
  provider_product_id text NOT NULL,
  requested_platform text NOT NULL DEFAULT 'unknown'
    CHECK (requested_platform IN ('android', 'harmony', 'windows', 'ios', 'unknown')),
  settlement_channel text CHECK (settlement_channel IN ('wechat', 'apple')),
  payer_openid text NOT NULL,
  provider_order_no text UNIQUE,
  transaction_id text UNIQUE,
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'succeeded', 'closed', 'failed')),
  fulfillment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'granted', 'grant_failed')),
  refund_status text NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'reviewing', 'submitted', 'external_required', 'succeeded', 'failed', 'rejected')),
  paid_amount_fen integer,
  paid_at timestamptz,
  entitlement_event_id uuid,
  config_version integer NOT NULL CHECK (config_version > 0),
  secret_revision integer NOT NULL CHECK (secret_revision > 0),
  payment_expires_at timestamptz NOT NULL,
  failure_code text,
  failure_message text,
  reconcile_claim_token uuid,
  reconcile_claim_expires_at timestamptz,
  reconcile_attempt_count integer NOT NULL DEFAULT 0 CHECK (reconcile_attempt_count >= 0),
  reconcile_last_error text,
  created_by uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (product_id, product_code)
    REFERENCES public.platform_addon_products(id, code),
  FOREIGN KEY (entitlement_event_id, tenant_id, entitlement_code)
    REFERENCES public.tenant_entitlement_events(id, tenant_id, entitlement_code),
  CHECK (payment_status <> 'succeeded' OR (paid_amount_fen IS NOT NULL AND paid_at IS NOT NULL)),
  CHECK (fulfillment_status <> 'granted' OR entitlement_event_id IS NOT NULL)
);

CREATE UNIQUE INDEX tenant_virtual_addon_orders_pending_product_unique_idx
ON public.tenant_virtual_addon_orders(tenant_id, product_code)
WHERE payment_status = 'pending';

CREATE INDEX tenant_virtual_addon_orders_tenant_status_created_idx
ON public.tenant_virtual_addon_orders(tenant_id, payment_status, created_at DESC, id DESC);

CREATE INDEX tenant_virtual_addon_orders_reconcile_idx
ON public.tenant_virtual_addon_orders(payment_status, fulfillment_status, payment_expires_at, id)
WHERE payment_status = 'pending' OR fulfillment_status = 'grant_failed';
```

同一 migration 中增加 `branding_create_virtual_addon_order(...)`。函数在一个事务中锁定商品和 active 映射，验证 `purchase_mode='wechat_virtual'`、商品启用、映射 `validation_status='valid'`、价格一致、生产金额不低于 100 分，然后复用同租户幂等键或同商品 pending 订单；任何不满足条件的分支使用稳定 `P0001` 消息，不由应用层拼装查询竞态。

同时增加 `guard_tenant_virtual_addon_order_snapshot()` 和状态转换触发器：商品、价格、配置、购买人、OpenID 与环境快照创建后不可修改；payment、fulfillment、refund 三套状态只能按设计状态机前进；`entitlement_event_id` 的租户和权益编码必须与订单一致。

- [ ] **Step 4: 增加共享领域契约和 API 内部错误码**

```ts
// packages/domain/src/branding-virtual-payment.ts
export const BRANDING_PURCHASE_MODES = [
  "direct_legacy",
  "maintenance",
  "wechat_virtual",
] as const;
export const VIRTUAL_PAYMENT_ENVIRONMENTS = ["sandbox", "production"] as const;
export const VIRTUAL_PAYMENT_PLATFORMS = [
  "android",
  "harmony",
  "windows",
  "ios",
  "unknown",
] as const;
export const VIRTUAL_PAYMENT_STATUSES = ["pending", "succeeded", "closed", "failed"] as const;
export const VIRTUAL_FULFILLMENT_STATUSES = ["pending", "granted", "grant_failed"] as const;
export const VIRTUAL_REFUND_STATUSES = [
  "none", "reviewing", "submitted", "external_required", "succeeded", "failed", "rejected",
] as const;
export const BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN = 100;

export type BrandingPurchaseMode = typeof BRANDING_PURCHASE_MODES[number];
export type BrandingVirtualPaymentPlatform = typeof VIRTUAL_PAYMENT_PLATFORMS[number];
export type BrandingVirtualPaymentStatus = typeof VIRTUAL_PAYMENT_STATUSES[number];
export type BrandingVirtualFulfillmentStatus = typeof VIRTUAL_FULFILLMENT_STATUSES[number];
export type BrandingVirtualRefundStatus = typeof VIRTUAL_REFUND_STATUSES[number];

export type BrandingVirtualPaymentRequest = {
  kind: "wechat_virtual";
  environment: "sandbox" | "production";
  request_payload: {
    signData: string;
    mode: "short_series_goods";
    paySig: string;
    signature: string;
  };
};
```

`packages/domain/src/index.ts` 导出该模块，`packages/domain/package.json` 将版本从 `1.13.0` 提升到 `1.14.0`。API 内部文件从 `@gooes/domain` 重导出上述常量，并只保留不应暴露给客户端的稳定服务端错误码：

```ts
export * from "@gooes/domain";
export const BRANDING_VIRTUAL_SESSION_REFRESH_CODE =
  "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED";
export const BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED_CODE =
  "BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED";
```

Run: `bun test packages/domain/src/branding-virtual-payment.test.ts apps/api/src/services/branding-virtual-payment-migration-contract.test.ts && pnpm --dir packages/domain run build && pnpm --dir packages/domain run verify:packed-consumer && bun run api:typecheck`

Expected: 共享契约与 migration 契约测试 PASS，domain 构建和 packed consumer 验证通过，TypeScript 输出无错误。不要覆盖或提交工作区已有的 `packages/domain/gooes-domain-1.13.0.tgz`；`1.14.0` 的可移植制品在 Task 12 交接阶段单独生成并登记。

- [ ] **Step 5: 提交数据库基础**

```bash
git add supabase/migrations/20260731130000_create_branding_virtual_payment_foundation.sql packages/domain/src/branding-virtual-payment.ts packages/domain/src/branding-virtual-payment.test.ts packages/domain/src/index.ts packages/domain/package.json apps/api/src/services/branding-virtual-payment-contracts.ts apps/api/src/services/branding-virtual-payment-migration-contract.test.ts
git commit -m "feat(payments): 建立品牌权益虚拟支付订单域"
```

## Task 2：安全持久化并轮换微信 `session_key`

**Files:**
- Create: `supabase/migrations/20260731131000_create_wechat_mini_session_credentials.sql`
- Create: `apps/api/src/services/wechat-mini-session-crypto.ts`
- Create: `apps/api/src/services/wechat-mini-session-crypto.test.ts`
- Create: `apps/api/src/repositories/wechat-mini-session-credentials.ts`
- Create: `apps/api/src/services/wechat-mini-session-credentials.ts`
- Create: `apps/api/src/services/wechat-mini-session-credentials.test.ts`
- Modify: `apps/api/src/services/wechat-auth-legacy/login.ts`
- Modify: `apps/api/src/repositories/user-identities.ts`
- Modify: `apps/api/src/services/user-identities.ts`

- [ ] **Step 1: 写加密、轮换和重新登录的失败测试**

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { decryptWechatMiniSessionKey, encryptWechatMiniSessionKey } from "./wechat-mini-session-crypto";

describe("wechat mini session crypto", () => {
  afterEach(() => delete process.env.WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1);

  test("round-trips without exposing plaintext", () => {
    process.env.WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1 = "test-key-material-not-used-in-production";
    const encrypted = encryptWechatMiniSessionKey("session-key", 1);
    expect(encrypted).not.toContain("session-key");
    expect(decryptWechatMiniSessionKey(encrypted, 1)).toBe("session-key");
  });
});
```

Service 测试固定验证：同一 OAuth identity 第二次登录更新为 `session_revision=2`；缺失凭据抛出 HTTP 409 和 `BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED`；凭据被微信判定失效后状态变为 `invalid`；解绑 OAuth identity 后状态变为 `revoked`；返回值和日志参数均不包含明文 `session_key`。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test apps/api/src/services/wechat-mini-session-crypto.test.ts apps/api/src/services/wechat-mini-session-credentials.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 创建凭据 migration**

```sql
CREATE TABLE public.wechat_mini_session_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oauth_identity_id uuid NOT NULL REFERENCES public.user_oauth_identities(id),
  openid_hash text NOT NULL CHECK (length(openid_hash) = 64),
  encrypted_session_key text NOT NULL CHECK (btrim(encrypted_session_key) <> ''),
  encryption_key_version integer NOT NULL CHECK (encryption_key_version > 0),
  session_revision integer NOT NULL DEFAULT 1 CHECK (session_revision > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'revoked')),
  obtained_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wechat_mini_session_credentials_active_identity_idx
ON public.wechat_mini_session_credentials(oauth_identity_id)
WHERE status = 'active';

CREATE INDEX wechat_mini_session_credentials_openid_hash_idx
ON public.wechat_mini_session_credentials(openid_hash, status);

ALTER TABLE public.wechat_mini_session_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wechat_mini_session_credentials FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wechat_mini_session_credentials FROM anon, authenticated;
REVOKE ALL ON TABLE public.wechat_mini_session_credentials FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.wechat_mini_session_credentials TO service_role;
```

同一 migration 创建 `rotate_wechat_mini_session_credential(...)`，对 OAuth identity 加事务锁，将旧 active 记录改为 `revoked` 后写入下一 revision；并创建 `AFTER UPDATE OF status` 触发器，在 `user_oauth_identities` 变为 `disabled` 或 `unbound` 时撤销 active 凭据。

- [ ] **Step 4: 实现专用 AES-256-GCM 模块**

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Errors } from "@/errors/error-factory";

const PREFIX = "wmss:v1";

function keyFor(version: number): Buffer {
  const raw = process.env[`WECHAT_MINI_SESSION_ENCRYPTION_KEY_V${version}`]?.trim();
  if (!raw) {
    throw Errors.business(503, "微信会话加密密钥未配置", "WECHAT_MINI_SESSION_ENCRYPTION_KEY_MISSING");
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptWechatMiniSessionKey(value: string, version: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(version), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [PREFIX, version, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptWechatMiniSessionKey(value: string, version: number): string {
  try {
    const [family, format, storedVersion, iv, tag, ciphertext] = value.split(":");
    if (`${family}:${format}` !== PREFIX || Number(storedVersion) !== version || !iv || !tag || !ciphertext) throw new TypeError("invalid credential envelope");
    const decipher = createDecipheriv("aes-256-gcm", keyFor(version), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch (cause) {
    throw Errors.business(500, "微信会话凭据解密失败", "WECHAT_MINI_SESSION_DECRYPT_FAILED", cause instanceof Error ? { message: cause.message } : undefined);
  }
}
```

- [ ] **Step 5: 接入登录成功路径**

`getOpenId` 在 OAuth identity 已解析且登录响应返回前同步持久化凭据；不能沿用当前 background task，因为支付紧接登录时必须能读取到新凭据：

```ts
if (wxData.session_key) {
  await wechatMiniSessionCredentialService.rotateForLogin({
    userId,
    openid: wxData.openid,
    sessionKey: wxData.session_key,
  });
}
```

visitor fast path 暂不写入孤立凭据；用户升级为 `auth_user` 后使用当前 `wx.login` code 再登录一次完成绑定。`user-identities` 的解绑 service 必须显式调用 `revokeForOauthIdentity`，数据库触发器作为第二道保护。

- [ ] **Step 6: 验证并提交**

Run: `bun test apps/api/src/services/wechat-mini-session-crypto.test.ts apps/api/src/services/wechat-mini-session-credentials.test.ts && bun run api:typecheck`

Expected: 全部 PASS；类型检查无输出；测试断言响应和日志对象不含 `session_key`。

```bash
git add supabase/migrations/20260731131000_create_wechat_mini_session_credentials.sql apps/api/src/services/wechat-mini-session-crypto.ts apps/api/src/services/wechat-mini-session-crypto.test.ts apps/api/src/repositories/wechat-mini-session-credentials.ts apps/api/src/services/wechat-mini-session-credentials.ts apps/api/src/services/wechat-mini-session-credentials.test.ts apps/api/src/services/wechat-auth-legacy/login.ts apps/api/src/repositories/user-identities.ts apps/api/src/services/user-identities.ts
git commit -m "feat(auth): 保存微信虚拟支付会话凭据"
```

## Task 3：提供虚拟商品映射与购买能力接口

**Files:**
- Create: `supabase/migrations/20260731132000_create_branding_virtual_product_management_rpcs.sql`
- Create: `apps/api/src/repositories/branding-virtual-products.ts`
- Create: `apps/api/src/repositories/branding-virtual-product-commands.test.ts`
- Create: `apps/api/src/services/branding-virtual-products.ts`
- Create: `apps/api/src/services/branding-virtual-products.test.ts`
- Create: `apps/api/src/services/branding-virtual-product-management.ts`
- Create: `apps/api/src/services/branding-virtual-product-management.test.ts`
- Create: `apps/api/src/services/branding-virtual-product-management-migration.test.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions-payment.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions-payment.test.ts`
- Modify: `apps/api/src/services/system-settings/legacy/definitions.ts`
- Modify: `apps/api/src/services/system-settings/legacy/settings.ts`
- Modify: `apps/api/src/services/system-settings/legacy/crypto.ts`
- Modify: `apps/api/src/services/system-settings/legacy/crypto.test.ts`
- Modify: `apps/api/src/repositories/branding-addon-products.ts`
- Modify: `apps/api/src/repositories/branding-addon-products.test.ts`
- Modify: `apps/api/src/repositories/system-settings.ts`
- Modify: `apps/api/src/services/platform-branding-addon-product.ts`
- Modify: `apps/api/src/services/platform-branding-addon-product.test.ts`
- Modify: `apps/api/src/services/platform-branding-addon-product-virtual.test.ts`
- Modify: `apps/api/src/services/system-settings/legacy-service.ts`
- Modify: `apps/api/src/schema/branding-addon.ts`
- Modify: `apps/api/src/schema/branding-addon.test.ts`
- Modify: `apps/api/src/schema/platform-audit-logs.ts`
- Modify: `apps/api/src/controllers/branding-addon/index.ts`
- Modify: `apps/api/src/controllers/branding-addon/routes.test.ts`
- Modify: `apps/api/src/repositories/system-settings.test.ts`
- Create: `apps/api/src/repositories/system-settings-platform-secrets.test.ts`
- Modify: `apps/api/src/services/tenant-branding-addon-orders.test-fixtures.ts`
- Modify: `docs/superpowers/plans/2026-07-31-platform-digital-entitlement-virtual-payment-migration.md`

管理侧保存必须通过单个 `branding_manage_virtual_product_configuration`
RPC 原子更新商品与映射，禁止先后执行两次写入。影响支付坐标或密钥版本的
字段变化必须将验证状态重置为 `pending` 并清空验证时间；只有受保护的本地
配置验证接口可通过独立 RPC 写入 `valid/invalid`。本地验证只确认服务端配置、
密钥包结构和金额一致性，不宣称已远程验证微信 ProductId。该 migration 在
Task 1 临时授权之后撤销 service role 对映射表的 `INSERT/UPDATE`，最终权限
固定为表 `SELECT` 加两个窄 RPC 的 `EXECUTE`，应用仓储不得暴露表直写方法。
平台 GET 使用 `branding_get_virtual_product_management_snapshot()` 一次读取商品与
两环境映射，再通过 system settings 专用双 key 查询一次读取密钥配置；冷缓存
数据库往返最多两次。该批量查询只选择 `key,value_text,is_secret,status`，并固定
平台 scope 与 `limit(2)`。商品表同样撤销 service role 的 `INSERT/UPDATE`，只允许
原子管理 RPC 写入。

- [ ] **Step 1: 写商品可售性矩阵测试**

```ts
test.each([
  ["maintenance", "active", "valid", 9900, false, "PURCHASE_MAINTENANCE"],
  ["wechat_virtual", "disabled", "valid", 9900, false, "VIRTUAL_PRODUCT_DISABLED"],
  ["wechat_virtual", "active", "invalid", 9900, false, "VIRTUAL_PRODUCT_INVALID"],
  ["wechat_virtual", "active", "valid", 99, false, "VIRTUAL_PRODUCT_AMOUNT_TOO_LOW"],
  ["wechat_virtual", "active", "valid", 9900, true, null],
])("derives capability", async (purchaseMode, status, validationStatus, amountFen, available, reason) => {
  const result = await createService({ purchaseMode, status, validationStatus, amountFen }).getTenantProduct(auth);
  expect(result.virtual_payment_available).toBe(available);
  expect(result.unavailable_reason).toBe(reason);
});
```

另写测试验证 `expected_amount_fen !== amount_fen` 时不可售，production 与 sandbox 密钥引用不会串用，切到 `wechat_virtual` 前必须是 production active + valid 映射。

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/services/branding-virtual-products.test.ts`

Expected: FAIL，`BrandingVirtualProductService` 尚不存在。

- [ ] **Step 3: 注册受保护的分环境密钥定义**

在 `definitions-payment.ts` 增加两个 `secret` 定义：

```ts
{
  key: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
  groupCode: "payment",
  name: "微信虚拟支付沙箱密钥包",
  description: "微信小程序虚拟支付沙箱 AppKey，按结构化数据加密存储。",
  valueType: "json",
  envNames: ["WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE"],
  isSecret: true,
},
{
  key: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  groupCode: "payment",
  name: "微信虚拟支付生产密钥包",
  description: "微信小程序虚拟支付生产 AppKey，按结构化数据加密存储。",
  valueType: "json",
  envNames: ["WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE"],
  isSecret: true,
},
```

将这两个 key 加入 `PLATFORM_PAYMENT_SECRET_SETTING_KEYS`，沿用现有 `PLATFORM_WECHAT_PAY_SECRET_BUNDLE` 的禁止普通设置接口读取/覆盖规则。密钥包解析后只允许 `{ appKey: string, revision: positive integer }`，任何审计元数据只记录 key、revision 和是否配置。

- [ ] **Step 4: 实现商品能力 DTO 和管理接口**

租户商品响应固定增加：

```ts
{
  purchase_mode: product.purchase_mode,
  payment_channel: "wechat_virtual",
  virtual_payment_available: availability.available,
  unavailable_reason: availability.reason,
  minimum_amount_fen: 100,
  capability: "wx.requestVirtualPayment",
}
```

平台 PATCH schema 增加 `purchase_mode` 和 `virtual_product`，并保持 `version` 乐观锁：

```ts
virtual_product: z.object({
  environment: z.enum(["sandbox", "production"]),
  app_id: z.string().trim().min(1).max(64),
  virtual_merchant_id: z.string().trim().min(1).max(64),
  offer_id: z.string().trim().min(1).max(128),
  provider_product_id: z.string().trim().min(1).max(128),
  expected_amount_fen: z.number().int().positive(),
  encrypted_secret_ref: z.enum([
    "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  ]),
  secret_revision: z.number().int().positive(),
  status: z.enum(["draft", "active", "disabled"]),
  version: z.number().int().positive(),
}).optional()
```

Service 在激活 production 映射和切换 `wechat_virtual` 时同时验证价格、环境、密钥 revision 和 validation 状态，并通过 `platformAuditLogService.recordBestEffort` 记录前后摘要。

- [ ] **Step 5: 验证并提交**

Run: `cd apps/api && bun test src/services/branding-virtual-payment-migration-contract.test.ts src/services/branding-virtual-products.test.ts src/services/branding-virtual-product-management.test.ts src/services/branding-virtual-product-management-migration.test.ts src/repositories/branding-virtual-product-commands.test.ts src/repositories/branding-addon-products.test.ts src/repositories/system-settings-platform-secrets.test.ts src/services/platform-branding-addon-product.test.ts src/services/platform-branding-addon-product-virtual.test.ts src/controllers/branding-addon/routes.test.ts src/schema/branding-addon.test.ts && bun run check`

Expected: PASS；旧 `direct_legacy` 商品读取兼容；production 金额低于 100 分时稳定返回 409。

```bash
git add supabase/migrations/20260731132000_create_branding_virtual_product_management_rpcs.sql apps/api/src/repositories/branding-virtual-products.ts apps/api/src/repositories/branding-virtual-product-commands.test.ts apps/api/src/repositories/branding-addon-products.ts apps/api/src/repositories/branding-addon-products.test.ts apps/api/src/repositories/system-settings.ts apps/api/src/repositories/system-settings.test.ts apps/api/src/repositories/system-settings-platform-secrets.test.ts apps/api/src/services/branding-virtual-products.ts apps/api/src/services/branding-virtual-products.test.ts apps/api/src/services/branding-virtual-product-management.ts apps/api/src/services/branding-virtual-product-management.test.ts apps/api/src/services/branding-virtual-product-management-migration.test.ts apps/api/src/services/platform-branding-addon-product.ts apps/api/src/services/platform-branding-addon-product.test.ts apps/api/src/services/platform-branding-addon-product-virtual.test.ts apps/api/src/services/system-settings/legacy-service.ts apps/api/src/services/system-settings/legacy/crypto.ts apps/api/src/services/system-settings/legacy/crypto.test.ts apps/api/src/services/system-settings/legacy/definitions-payment.ts apps/api/src/services/system-settings/legacy/definitions-payment.test.ts apps/api/src/services/system-settings/legacy/definitions.ts apps/api/src/services/system-settings/legacy/settings.ts apps/api/src/services/tenant-branding-addon-orders.test-fixtures.ts apps/api/src/schema/branding-addon.ts apps/api/src/schema/branding-addon.test.ts apps/api/src/schema/platform-audit-logs.ts apps/api/src/controllers/branding-addon/index.ts apps/api/src/controllers/branding-addon/routes.test.ts docs/superpowers/plans/2026-07-31-platform-digital-entitlement-virtual-payment-migration.md
git commit -m "feat(payments): 增加虚拟商品配置与购买能力"
```

## Task 4：实现微信虚拟支付签名与网关

**Files:**
- Create: `apps/api/src/services/wechat-virtual-payment-signatures.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-signatures.test.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-gateway-contracts.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-gateway-response.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-response-reader.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-response-reader.test.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-gateway.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-gateway.test.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-gateway-hardening.test.ts`

- [ ] **Step 1: 固化官方请求字段并写签名向量测试**

2026-08-01 已通过 `curl` 逐项核对以下官方页面；测试注释保留核对日期和 URL：

- `https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html`
- `https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html`
- `https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order.html`
- `https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_refund_order.html`
- `https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_notify_provide_goods.html`

官方服务器 API 响应字段为小写 `errcode`、`errmsg`；本 Task 不修改消息回调协议的 `ErrCode`、`ErrMsg` 大写约定。三个 XPay 服务器 API 均使用 `https://api.weixin.qq.com`，正式/沙箱通过 body 的 `env=0/1` 和对应环境 AppKey 区分，不使用不同的生产默认 base URL。测试输入固定，不使用真实密钥：

```ts
const officialBody = '{"openid": "xxx", "user_ip": "127.0.0.1", "env": 0}';

test("matches the official 2026-07-31 signing vector", () => {
  expect(calculateVirtualPaymentPaySig(
    "/xpay/query_user_balance",
    officialBody,
    "12345",
  )).toBe("c37809f27c6d7fd1837ad2500a04512b66b34fd793a39a385fade56dca89a4b5");
  expect(calculateVirtualPaymentUserSignature(
    officialBody,
    "9hAb/NEYUlkaMBEsmFgzig==",
  )).toBe("089d9e8dc5d308977360c4b79ec600a93d736802802a807d634192328032f6c7");
});
```

该向量来自微信虚拟支付官方“签名详解”示例；`post_body` 的空格也是签名输入，不能重新序列化后再比较。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test apps/api/src/services/wechat-virtual-payment-signatures.test.ts apps/api/src/services/wechat-virtual-payment-gateway.test.ts`

Expected: FAIL，签名和 gateway 模块尚不存在。

- [ ] **Step 3: 实现纯签名函数**

```ts
import { createHmac } from "node:crypto";

export type VirtualPaymentRequestPayload = {
  offerId: string;
  productId: string;
  goodsPrice: number;
  outTradeNo: string;
  attach: string;
};

export function buildVirtualPaymentRequest(input: VirtualPaymentRequestPayload & {
  environment: "sandbox" | "production";
  signingSecret: { environment: "sandbox" | "production"; appKey: string };
  sessionKey: string;
}) {
  const env = input.environment === "production" ? 0 : 1;
  const signData = JSON.stringify({
    offerId: input.offerId,
    buyQuantity: 1,
    env,
    currencyType: "CNY",
    productId: input.productId,
    goodsPrice: input.goodsPrice,
    outTradeNo: input.outTradeNo,
    attach: input.attach,
  });
  return {
    signData,
    mode: "short_series_goods" as const,
    paySig: calculateVirtualPaymentPaySig("requestVirtualPayment", signData, input.signingSecret.appKey),
    signature: calculateVirtualPaymentUserSignature(signData, input.sessionKey),
  };
}

export function calculateVirtualPaymentPaySig(uri: string, signData: string, appKey: string): string {
  return createHmac("sha256", appKey).update(`${uri}&${signData}`, "utf8").digest("hex");
}

export function calculateVirtualPaymentUserSignature(signData: string, sessionKey: string): string {
  return createHmac("sha256", sessionKey).update(signData, "utf8").digest("hex");
}
```

`env` 只由 `environment` 派生，签名密钥必须带相同环境标签；`signData` 必须以生成后的同一个字符串完成签名并返回客户端，不得二次解析或重新序列化；AppKey 和 session key 不得被返回或记录。若实施当天官方字段或算法已经变化，先同步修订设计文档和本计划再编码。

- [ ] **Step 4: 实现 HTTP gateway**

```ts
export interface WechatVirtualPaymentGatewayPort {
  queryOrder(input: QueryVirtualOrderInput): Promise<QueryVirtualOrderResult>;
  refundOrder(input: RefundVirtualOrderInput): Promise<RefundVirtualOrderResult>;
  notifyProvideGoods(input: ProvideVirtualGoodsInput): Promise<ProvideVirtualGoodsResult>;
}
```

Gateway 使用注入的 `fetch`、超时 `AbortSignal.timeout(8_000)` 和单一官方默认 base URL `https://api.weixin.qq.com`；base URL 只允许测试注入。`accessToken` 由调用方或后续 token provider 传入，本 Task 不重复实现 token 缓存。

- `query_order`：`POST /xpay/query_order?access_token&pay_sig`，body 为 `openid`、派生 `env` 以及 `order_id`/`wx_order_id` 严格二选一，只使用支付签名。
- `refund_order`：官方调用 URL 和查询参数表只列 `access_token`、`pay_sig`，但同页“注意事项”明确要求“使用用户态签名与支付签名”。本实现采用该更严格说明，在 query 同时传 `signature` 和 `pay_sig`，且两者都基于实际发送的同一个原始 JSON body；受理成功只返回 `submitted` 语义，最终结果仍由查单或退款通知确认。
- `notify_provide_goods`：`POST /xpay/notify_provide_goods?access_token`，body 为派生 `env` 以及 `order_id`/`wx_order_id` 严格二选一，不传 `pay_sig` 或 `signature`，成功响应体允许为空。

Gateway 只返回经过严格运行时验证的归一化结果。HTTP 非 2xx、网络或超时、微信小写 `errcode` 非 0、JSON 不合法分别包装为稳定 `Errors.business(...)`；details 只含有界的 `httpStatus`、`wechatErrcode` 和 `requestId`，不含 URL query、密钥、签名、OpenID、`errmsg` 原文或完整载荷。

基础库返回 `-15007`（`session_key` 过期）发生在小程序本地，API 无法从该客户端错误反推凭据状态；小程序必须先重新执行 `wx.login`，登录 API 轮换凭据后再请求同一订单的 payment-request。服务端 gateway 在调用微信服务器 API 时若收到明确的会话失效错误，才将当前凭据标记为 `invalid`。凭据缺失或已 invalid 时 API 返回 HTTP 409 `BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED`，不得创建新订单或回退普通支付。

- [ ] **Step 5: 验证并提交**

Run: `cd apps/api && bun test src/services/wechat-virtual-payment-signatures.test.ts src/services/wechat-virtual-payment-response-reader.test.ts src/services/wechat-virtual-payment-gateway.test.ts src/services/wechat-virtual-payment-gateway-hardening.test.ts && bun run typecheck`

Expected: 固定签名向量、响应体上限、流读取异常、requestId、凭证失效竞态、输入边界、非 2xx、微信错误码和环境隔离测试全部 PASS。

```bash
git add apps/api/src/services/wechat-virtual-payment-signatures.ts apps/api/src/services/wechat-virtual-payment-signatures.test.ts apps/api/src/services/wechat-virtual-payment-gateway-contracts.ts apps/api/src/services/wechat-virtual-payment-gateway-response.ts apps/api/src/services/wechat-virtual-payment-response-reader.ts apps/api/src/services/wechat-virtual-payment-response-reader.test.ts apps/api/src/services/wechat-virtual-payment-gateway.ts apps/api/src/services/wechat-virtual-payment-gateway.test.ts apps/api/src/services/wechat-virtual-payment-gateway-hardening.test.ts docs/superpowers/plans/2026-07-31-platform-digital-entitlement-virtual-payment-migration.md
git commit -m "feat(payments): 实现微信虚拟支付网关"
```

## Task 5：实现租户虚拟订单创建与支付请求

**Files:**
- Create: `apps/api/src/repositories/branding-virtual-orders.ts`
- Create: `apps/api/src/services/tenant-branding-virtual-orders.ts`
- Create: `apps/api/src/services/tenant-branding-virtual-orders.test.ts`
- Modify: `apps/api/src/schema/branding-addon.ts`
- Modify: `apps/api/src/controllers/branding-addon/index.ts`
- Modify: `apps/api/src/controllers/branding-addon/routes.test.ts`

- [ ] **Step 1: 写权限、幂等、OpenID 和会话恢复测试**

```ts
test("reuses the same tenant idempotency order", async () => {
  repository.create.mockResolvedValueOnce(order).mockResolvedValueOnce(order);
  expect(await service.createOrder(auth, input, payer)).toEqual(await service.createOrder(auth, input, payer));
});

test("requires a fresh wx.login credential without creating another order", async () => {
  credentials.requireForPayment.mockRejectedValue(
    Errors.business(409, "微信登录状态需要刷新", "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED"),
  );
  await expect(service.createPaymentRequest(auth, order.id, payer)).rejects.toMatchObject({
    statusCode: 409,
    code: "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED",
  });
  expect(repository.create).not.toHaveBeenCalled();
});
```

覆盖：非租户系统管理员、缺少 `brand.entitlement.purchase`、非微信登录、跨租户订单、OpenID 不匹配、客户端伪造金额/offerId/ProductId、pending 复用、并发唯一冲突、maintenance、mapping invalid 和 production 金额不一致。

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/services/tenant-branding-virtual-orders.test.ts apps/api/src/controllers/branding-addon/routes.test.ts`

Expected: 新 service 和新路由测试 FAIL。

- [ ] **Step 3: 增加请求 schema 与 controller 路由**

```ts
export const BrandingVirtualCreateOrderSchema = z.object({
  product_code: z.literal(BRANDING_ADDON_PRODUCT_CODE),
  idempotency_key: z.uuidv4("幂等键必须是合法的 UUID v4"),
  requested_platform: z.enum(VIRTUAL_PAYMENT_PLATFORMS).default("unknown"),
}).strict();
```

新增路由：

```ts
@Post("/tenant/branding/virtual-payment/orders")
async createVirtualOrder(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const input = parse(BrandingVirtualCreateOrderSchema, request.body);
  return ResponseHandler.success(
    await tenantBrandingVirtualOrderService.createOrder(auth, input, requireWechatPayerOpenid(request)),
  );
}

@Post("/tenant/branding/virtual-payment/orders/:id/payment-request")
async createVirtualPaymentRequest(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const { id } = parse(BrandingAddonOrderParamsSchema, request.params);
  parse(BrandingAddonEmptySchema, request.body);
  return ResponseHandler.success(
    await tenantBrandingVirtualOrderService.createPaymentRequest(auth, id, requireWechatPayerOpenid(request)),
  );
}
```

- [ ] **Step 4: 实现 service 与 repository**

Repository 只调用 `branding_create_virtual_addon_order`、按租户查询单笔订单和更新 `last_used_at`；service 从服务端商品与 mapping 构造快照。支付请求返回固定 shape：

```ts
return {
  order: serializeVirtualOrder(order),
  payment_request: {
    kind: "wechat_virtual" as const,
    environment: order.environment,
    request_payload: buildVirtualPaymentRequest({
      offerId: order.offer_id,
      buyQuantity: 1,
      env: order.environment === "sandbox" ? 1 : 0,
      currencyType: "CNY",
      productId: order.provider_product_id,
      goodsPrice: order.amount_fen,
      outTradeNo: order.out_trade_no,
      attach: order.id,
      appKey: secret.appKey,
      sessionKey: credential.sessionKey,
    }),
  },
};
```

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/tenant-branding-virtual-orders.test.ts apps/api/src/controllers/branding-addon/routes.test.ts && bun run api:typecheck`

Expected: 全部 PASS，路由响应中不存在 `appKey`、`sessionKey` 或 `encrypted_secret_ref`。

```bash
git add apps/api/src/repositories/branding-virtual-orders.ts apps/api/src/services/tenant-branding-virtual-orders.ts apps/api/src/services/tenant-branding-virtual-orders.test.ts apps/api/src/schema/branding-addon.ts apps/api/src/controllers/branding-addon/index.ts apps/api/src/controllers/branding-addon/routes.test.ts
git commit -m "feat(payments): 增加品牌权益虚拟支付下单"
```

## Task 6：接入微信消息并实现原子支付履约

**Files:**
- Create: `supabase/migrations/20260731133000_create_branding_virtual_payment_fulfillment.sql`
- Create: `apps/api/src/repositories/wechat-virtual-payment-notifications.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-notifications.ts`
- Create: `apps/api/src/services/wechat-virtual-payment-notifications.test.ts`
- Create: `apps/api/src/services/branding-virtual-payment-confirmation.ts`
- Create: `apps/api/src/services/branding-virtual-payment-confirmation.test.ts`
- Create: `apps/api/src/controllers/wechat-virtual-payment/index.ts`
- Create: `apps/api/src/controllers/wechat-virtual-payment/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写重复、伪造、乱序和原子履约测试**

固定覆盖：相同事件稳定键只插入一次；OpenId、OutTradeNo、ProductId、Quantity、OrigPrice、ActualPrice、环境或交易号不匹配时不履约；通知和查单并发只产生一个 purchase event；支付成功但 RPC 暂时失败进入 `grant_failed`；再次处理可恢复为 `granted`。

```ts
test("notification and query converge on one confirmation", async () => {
  await Promise.all([
    confirmation.confirm({ source: "notification", order, transaction }),
    confirmation.confirm({ source: "query", order, transaction }),
  ]);
  expect(repository.confirmPurchase).toHaveBeenCalledTimes(2);
  expect(new Set(repository.confirmPurchase.mock.results.map((result) => result.value.entitlement_event_id)).size).toBe(1);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/services/wechat-virtual-payment-notifications.test.ts apps/api/src/services/branding-virtual-payment-confirmation.test.ts apps/api/src/controllers/wechat-virtual-payment/routes.test.ts`

Expected: FAIL，新模块和路由不存在。

- [ ] **Step 3: 创建消息表和原子确认 RPC**

```sql
CREATE TABLE public.wechat_virtual_payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('xpay_goods_deliver_notify', 'xpay_refund_notify', 'xpay_refund_inquiry')),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  order_id uuid REFERENCES public.tenant_virtual_addon_orders(id),
  out_trade_no text,
  provider_product_id text,
  openid_hash text,
  authentication_method text NOT NULL,
  authentication_status text NOT NULL CHECK (authentication_status IN ('verified', 'rejected')),
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(normalized_payload) = 'object'),
  payload_sha256 text NOT NULL CHECK (length(payload_sha256) = 64),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error_code text,
  last_error_summary text,
  request_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wechat_virtual_payment_notifications_retry_idx
ON public.wechat_virtual_payment_notifications(status, received_at, id)
WHERE status IN ('processing', 'failed');
```

同一 migration 新建 `branding_confirm_virtual_addon_purchase(...)`，事务顺序固定为：按 order id `FOR UPDATE`；校验完整支付上下文；若已有 `entitlement_event_id` 返回原事实；锁定 `tenant_entitlements`；按 `timestamptz + interval '1 year'` 计算首次或顺延到期时间；首次开通插入 `tenant_entitlement_events(event_type='granted', source_type='purchase', source_id=order.id)`，未到期顺延或到期续购插入 `event_type='renewed'`；更新权益；更新支付和履约状态。RPC 必须以 order id 和 transaction identity 双重幂等。

- [ ] **Step 4: 实现独立消息入口**

`WechatVirtualPaymentController` 注册 `/wechat/virtual-payment/events` 的 GET 验证与 POST 消息；不要复用 `/pay/wechat/callback`：

```ts
fastify.get("/wechat/virtual-payment/events", this.verifyEndpoint);
fastify.post("/wechat/virtual-payment/events", this.handleEvent);
```

消息 service 先验证微信消息入口，再生成 `sha256(eventType + stableProviderIdentity)` 事件键，落库后派发。成功响应严格按微信官方消息协议返回 `ErrCode=0`；上下文不匹配返回可观测的稳定错误且绝不创建权益。

支付确认成功后，通知路径直接按微信消息协议确认发货；主动查单路径必须调用 `/xpay/notify_provide_goods` 告知微信本地权益已交付。`notify_provide_goods` 暂时失败只记录可重试的发货通知状态，不重复延长权益。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/wechat-virtual-payment-notifications.test.ts apps/api/src/services/branding-virtual-payment-confirmation.test.ts apps/api/src/controllers/wechat-virtual-payment/routes.test.ts && bun run api:typecheck`

Expected: 重复、并发、错误上下文和重试测试 PASS；普通 `/pay/wechat/callback` 测试不变。

```bash
git add supabase/migrations/20260731133000_create_branding_virtual_payment_fulfillment.sql apps/api/src/repositories/wechat-virtual-payment-notifications.ts apps/api/src/services/wechat-virtual-payment-notifications.ts apps/api/src/services/wechat-virtual-payment-notifications.test.ts apps/api/src/services/branding-virtual-payment-confirmation.ts apps/api/src/services/branding-virtual-payment-confirmation.test.ts apps/api/src/controllers/wechat-virtual-payment/index.ts apps/api/src/controllers/wechat-virtual-payment/routes.test.ts apps/api/src/routes/index.ts
git commit -m "feat(payments): 完成虚拟支付通知与权益履约"
```

## Task 7：增加主动查单和失败履约补偿 worker

**Files:**
- Create: `apps/api/src/services/branding-virtual-payment-reconciliation.ts`
- Create: `apps/api/src/services/branding-virtual-payment-reconciliation.test.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker.test.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker-partial-failure.test.ts`
- Create: `apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts`

- [ ] **Step 1: 写 claim 上限、查单和局部失败测试**

```ts
test("claims at most one hundred virtual orders", async () => {
  await service.reconcile({ batchSize: 500 });
  expect(repository.claimReconciliationBatch).toHaveBeenCalledWith({ limit: 100, leaseSeconds: 120 });
});

test("routes successful query facts through the shared confirmation", async () => {
  gateway.queryOrder.mockResolvedValue(successfulTransaction);
  await service.reconcile({ batchSize: 20 });
  expect(confirmation.confirm).toHaveBeenCalledWith(expect.objectContaining({ source: "query" }));
});
```

worker 测试同时验证虚拟支付子任务失败不会阻止普通订阅、充值退款、品牌权益到期任务运行，也不会把健康文件错误标为完全成功。

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/services/branding-virtual-payment-reconciliation.test.ts apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts apps/api/src/workers/billing-reconcile-worker-partial-failure.test.ts`

Expected: FAIL，缺少 virtual reconciliation child job。

- [ ] **Step 3: 实现有界补偿服务**

```ts
export type BrandingVirtualReconciliationTelemetry = {
  claimed: number;
  queried: number;
  confirmed: number;
  closed: number;
  failed: number;
  grantRecovered: number;
};

async reconcile(input: { batchSize: number }): Promise<BrandingVirtualReconciliationTelemetry> {
  const orders = await this.repository.claimReconciliationBatch({
    limit: Math.min(Math.max(input.batchSize, 1), 100),
    leaseSeconds: 120,
  });
  // 每笔查单独立捕获并记录有界错误；成功支付统一调用 confirmation.confirm。
}
```

pending 到期不能仅本地关闭：先调用微信查单；明确未支付/已关闭才更新本地，成功则履约，未知和网络错误释放 claim。`grant_failed` 已有支付事实时不重复查单即可重试原子确认。

- [ ] **Step 4: 接入现有单一调度 worker**

在 `tick()` 的结果中增加独立 `brandingVirtualPayment` 子结果，沿用现有 `Promise.allSettled`/partial-failure 语义，不新建第二个 scheduler 或 timer。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/branding-virtual-payment-reconciliation.test.ts apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts apps/api/src/workers/billing-reconcile-worker.test.ts apps/api/src/workers/billing-reconcile-worker-partial-failure.test.ts apps/api/src/workers/billing-reconcile-worker-health.test.ts && bun run api:typecheck`

Expected: 全部 PASS；批次恒不超过 100；局部失败被遥测且其他任务继续。

```bash
git add apps/api/src/services/branding-virtual-payment-reconciliation.ts apps/api/src/services/branding-virtual-payment-reconciliation.test.ts apps/api/src/workers/billing-reconcile-worker.ts apps/api/src/workers/billing-reconcile-worker.test.ts apps/api/src/workers/billing-reconcile-worker-partial-failure.test.ts apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts
git commit -m "feat(payments): 补偿虚拟支付订单与履约"
```

## Task 8：统一新旧品牌权益订单读取

**Files:**
- Create: `supabase/migrations/20260731134000_create_branding_entitlement_order_query.sql`
- Create: `apps/api/src/repositories/branding-entitlement-order-query.ts`
- Create: `apps/api/src/repositories/branding-entitlement-order-query.test.ts`
- Create: `apps/api/src/services/branding-entitlement-order-query.ts`
- Create: `apps/api/src/services/branding-entitlement-order-query.test.ts`
- Modify: `apps/api/src/services/tenant-branding-addon-orders.ts`
- Modify: `apps/api/src/services/platform-branding-addon-orders.ts`
- Modify: `apps/api/src/schema/branding-addon.ts`

- [ ] **Step 1: 写分页、状态映射和无 N+1 契约测试**

```ts
test("maps legacy and virtual orders into one stable shape", async () => {
  repository.list.mockResolvedValue({ list: [legacyRow, virtualRow], total: 2 });
  const result = await service.listTenant(auth, { page: 1, pageSize: 20 });
  expect(result.list.map((item) => item.payment_channel)).toEqual(["legacy_direct", "wechat_virtual"]);
  expect(result.list[0]).toMatchObject({ payment_status: "succeeded", fulfillment_status: "granted", refund_status: "none" });
  expect(repository.list).toHaveBeenCalledTimes(1);
});
```

覆盖：pageSize 101 被 Zod 拒绝；租户只能看到本租户；平台按 tenant/status/channel/keyword/date 筛选；旧订单不伪造虚拟字段；详情按 `payment_channel` 返回正确审计摘要。

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/repositories/branding-entitlement-order-query.test.ts apps/api/src/services/branding-entitlement-order-query.test.ts`

Expected: FAIL，统一查询模块尚不存在。

- [ ] **Step 3: 创建 UNION ALL 分页 RPC**

RPC 返回共同列：

```sql
payment_channel text,
payment_platform text,
payment_status text,
fulfillment_status text,
refund_status text,
id uuid,
tenant_id uuid,
order_no text,
product_code text,
product_name text,
amount_fen integer,
paid_at timestamptz,
created_at timestamptz,
tenant_name text,
total_count bigint
```

实现使用 `UNION ALL` 后统一过滤、`ORDER BY created_at DESC, id DESC`、`OFFSET` 和 `LIMIT LEAST(p_page_size, 100)`；legacy 映射规则固定：`channel -> legacy_direct`、paid -> succeeded/granted、pending -> pending/pending、closed -> closed/pending、failed -> failed/pending、refund_status -> none、payment_platform -> unknown。租户名称在 SQL 中一次 JOIN，禁止 service 循环查租户。

- [ ] **Step 4: 替换现有 read service，保留 URL**

以下 URL 不变，仅响应新增统一字段：

```text
GET /tenant/branding/entitlement-orders
GET /tenant/branding/entitlement-orders/:id
GET /platform/branding/entitlement-orders
GET /platform/branding/entitlement-orders/:id
```

schema 增加可选 `payment_channel=legacy_direct|wechat_virtual`、三个独立状态筛选，仍复用 `PaginationQuerySchema`。

- [ ] **Step 5: 验证执行计划并提交**

Run: `bun test apps/api/src/repositories/branding-entitlement-order-query.test.ts apps/api/src/services/branding-entitlement-order-query.test.ts apps/api/src/services/tenant-branding-addon-orders-payment.test.ts apps/api/src/controllers/branding-addon/routes-platform-orders.test.ts && bun run api:typecheck`

Expected: 全部 PASS。

在 dev 应用 migration 后运行针对默认列表、tenant_id 筛选和 keyword 搜索的 `EXPLAIN (ANALYZE, BUFFERS)`；Expected: 无应用层 N+1，分页结果最多 100，过滤能使用对应组合/关键词索引。将计划输出粘贴到 `docs/runbooks/branding-virtual-payment-cutover.md` 的验证记录。

```bash
git add supabase/migrations/20260731134000_create_branding_entitlement_order_query.sql apps/api/src/repositories/branding-entitlement-order-query.ts apps/api/src/repositories/branding-entitlement-order-query.test.ts apps/api/src/services/branding-entitlement-order-query.ts apps/api/src/services/branding-entitlement-order-query.test.ts apps/api/src/services/tenant-branding-addon-orders.ts apps/api/src/services/platform-branding-addon-orders.ts apps/api/src/schema/branding-addon.ts
git commit -m "feat(payments): 统一品牌权益新旧订单查询"
```

## Task 9：实现人工退款、iOS 外部退款和权益补偿

**Files:**
- Create: `supabase/migrations/20260731135000_create_branding_virtual_payment_refunds.sql`
- Create: `apps/api/src/repositories/branding-virtual-refunds.ts`
- Create: `apps/api/src/services/branding-virtual-refunds.ts`
- Create: `apps/api/src/services/branding-virtual-refunds.test.ts`
- Modify: `apps/api/src/services/branding-virtual-payment-reconciliation.ts`
- Modify: `apps/api/src/services/branding-virtual-payment-reconciliation.test.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts`
- Modify: `apps/api/src/schema/branding-addon.ts`
- Modify: `apps/api/src/controllers/branding-addon/index.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-notifications.ts`

- [ ] **Step 1: 写权限、平台分流和补偿幂等测试**

```ts
test.each([
  ["android", "merchant_initiated", "submitted", true],
  ["harmony", "merchant_initiated", "submitted", true],
  ["windows", "merchant_initiated", "submitted", true],
  ["ios", "apple_external", "external_required", false],
])("routes %s refunds", async (platform, mode, status, callsGateway) => {
  const result = await service.create(platformAdmin, { ...input, payment_platform: platform });
  expect(result).toMatchObject({ platform_mode: mode, status });
  expect(gateway.refundOrder).toHaveBeenCalledTimes(callsGateway ? 1 : 0);
});
```

覆盖：缺少独立权限、非全额金额、未支付订单、已成功退款、重复幂等键、Apple 问询不等于成功、未预先创建本地申请的 Apple 退款通知、退款失败不扣权益、退款成功后只产生一个 `refunded` event、补偿暂时失败但支付退款事实保持 succeeded。

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/services/branding-virtual-refunds.test.ts`

Expected: FAIL，退款模块不存在。

- [ ] **Step 3: 创建退款表、权限和补偿 RPC**

```sql
ALTER TABLE public.tenant_entitlement_events
  ADD COLUMN reverses_event_id uuid REFERENCES public.tenant_entitlement_events(id);

ALTER TABLE public.tenant_entitlement_events
  DROP CONSTRAINT tenant_entitlement_events_event_type_check,
  ADD CONSTRAINT tenant_entitlement_events_event_type_check
    CHECK (event_type IN ('granted', 'renewed', 'suspended', 'resumed', 'expired', 'revoked', 'refunded')),
  DROP CONSTRAINT tenant_entitlement_events_source_type_check,
  ADD CONSTRAINT tenant_entitlement_events_source_type_check
    CHECK (source_type IN ('manual_grant', 'purchase', 'system', 'refund'));

CREATE UNIQUE INDEX tenant_entitlement_events_reverses_event_unique_idx
ON public.tenant_entitlement_events(reverses_event_id)
WHERE reverses_event_id IS NOT NULL;

CREATE TABLE public.tenant_virtual_addon_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_no text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.tenant_virtual_addon_orders(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  idempotency_key uuid NOT NULL,
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  evidence_summary text NOT NULL DEFAULT '',
  request_source text NOT NULL CHECK (request_source IN ('platform_admin', 'apple_notification')),
  requested_by uuid REFERENCES public.employees(id),
  reviewed_by uuid REFERENCES public.employees(id),
  platform_mode text NOT NULL CHECK (platform_mode IN ('merchant_initiated', 'apple_external')),
  status text NOT NULL CHECK (status IN ('reviewing', 'submitted', 'external_required', 'succeeded', 'failed', 'rejected')),
  provider_refund_id text UNIQUE,
  apple_receipt_hash text,
  purchase_entitlement_event_id uuid NOT NULL REFERENCES public.tenant_entitlement_events(id),
  compensation_entitlement_event_id uuid UNIQUE REFERENCES public.tenant_entitlement_events(id),
  submitted_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  rejected_at timestamptz,
  last_error_code text,
  last_error_summary text,
  compensation_status text NOT NULL DEFAULT 'pending'
    CHECK (compensation_status IN ('pending', 'succeeded', 'failed')),
  compensation_last_error text,
  reconcile_claim_token uuid,
  reconcile_claim_expires_at timestamptz,
  reconcile_attempt_count integer NOT NULL DEFAULT 0 CHECK (reconcile_attempt_count >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (order_id),
  CHECK (request_source <> 'platform_admin' OR requested_by IS NOT NULL)
);

CREATE INDEX tenant_virtual_addon_refunds_pending_idx
ON public.tenant_virtual_addon_refunds(status, created_at, id)
WHERE status IN ('reviewing', 'submitted', 'external_required', 'succeeded');
```

`branding_compensate_virtual_addon_refund(...)` 必须锁定 refund、order、原 purchase event 和 tenant entitlement；`source_type='refund'`、`source_id=refund.id`、`reverses_event_id=purchase_event.id`；按原购买事件的一年期事实扣减到期日；active 到期则转 expired，suspended/revoked 保持状态；链路不一致时返回稳定人工处理错误，不自动猜测日期。微信退款事实最终成功时，order/refund 的退款状态立即保持 `succeeded`，权益补偿通过独立 `compensation_status` 重试，补偿失败不能把退款改回 failed。

种子权限：

```sql
INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES ('platform.branding_virtual_refund.manage', '管理品牌权益虚拟支付退款', 'platform_branding', 'branding_virtual_refund', 'manage', '审核并跟踪品牌权益虚拟支付退款', 'active')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status;
```

授予 platform_admin 全局 scope，租户角色不授予。

- [ ] **Step 4: 增加平台退款 API**

```ts
export const BrandingVirtualRefundCreateSchema = z.object({
  order_id: z.uuid("订单 ID 格式不正确"),
  idempotency_key: z.uuidv4("幂等键必须是合法的 UUID v4"),
  reason: z.string().trim().min(1).max(500),
  evidence_summary: z.string().trim().max(1000).default(""),
}).strict();
```

新增 POST `/platform/branding/virtual-payment/refunds`、GET 列表和 GET 详情；列表使用统一分页最大 100。Android/鸿蒙/Windows 审核通过调用 gateway 后进入 submitted；iOS 只进入 external_required。`xpay_refund_inquiry` 在官方时限内依据订单、已履约事实和售后证据返回建议并保存审计，但绝不标记退款成功。`xpay_refund_notify` 最终成功后写退款事实；若 Apple 通知先于本地申请，则以 `request_source='apple_notification'` 和微信稳定标识幂等创建外部退款记录，再独立重试权益补偿。

扩展 `BrandingVirtualReconciliationService` 和现有 billing worker：每批 claim 最多 100 个 submitted/external_required 退款查询最终状态，并对 `status='succeeded' AND compensation_status IN ('pending','failed')` 的记录重试补偿；退款子任务失败仍按现有 partial-failure 语义隔离。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/api/src/services/branding-virtual-refunds.test.ts apps/api/src/services/wechat-virtual-payment-notifications.test.ts && bun run api:typecheck`

Expected: 全部 PASS；iOS 不调用 `refundOrder`；退款失败没有 compensation event；重复成功通知只补偿一次。

```bash
git add supabase/migrations/20260731135000_create_branding_virtual_payment_refunds.sql apps/api/src/repositories/branding-virtual-refunds.ts apps/api/src/services/branding-virtual-refunds.ts apps/api/src/services/branding-virtual-refunds.test.ts apps/api/src/services/branding-virtual-payment-reconciliation.ts apps/api/src/services/branding-virtual-payment-reconciliation.test.ts apps/api/src/workers/billing-reconcile-worker.ts apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts apps/api/src/schema/branding-addon.ts apps/api/src/controllers/branding-addon/index.ts apps/api/src/services/wechat-virtual-payment-notifications.ts
git commit -m "feat(payments): 增加虚拟支付人工退款与权益补偿"
```

## Task 10：更新 Admin 商品、订单与退款交互

**Files:**
- Modify: `apps/admin/app/(console)/platform/branding-addon/page.tsx`
- Modify: `apps/admin/app/(console)/platform/branding-addon/loading.tsx`
- Create: `apps/admin/components/branding-addon/platform-branding-virtual-product-form.tsx`
- Create: `apps/admin/components/branding-addon/platform-branding-entitlement-orders.tsx`
- Create: `apps/admin/components/branding-addon/platform-branding-virtual-refunds.tsx`
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-types.ts`
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-form-data.ts`
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-form.tsx`
- Create: `apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts`
- Modify: `apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts`

- [ ] **Step 1: 写 Admin 数据和结构契约测试**

```ts
test("requires maintenance before switching to virtual payment", () => {
  expect(buildModePatch({ current: "direct_legacy", next: "wechat_virtual", version: 3 })).toEqual({
    ok: false,
    message: "请先切换到维护模式并收敛旧待支付订单",
  });
});

test("renders channel and three independent states", () => {
  const source = readFileSync(resolve(import.meta.dir, "platform-branding-entitlement-orders.tsx"), "utf8");
  expect(source).toContain("payment_channel");
  expect(source).toContain("payment_status");
  expect(source).toContain("fulfillment_status");
  expect(source).toContain("refund_status");
});
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts`

Expected: FAIL，新组件与 mode helper 不存在。

- [ ] **Step 3: 实现信息架构和交互约束**

页面用现有 Tabs、Card、Table、Badge、AlertDialog、Field、Skeleton 组件，分成：

```tsx
<Tabs defaultValue="product" className="flex min-h-0 flex-1 flex-col">
  <TabsList>
    <TabsTrigger value="product">商品与支付通道</TabsTrigger>
    <TabsTrigger value="orders">购买订单</TabsTrigger>
    <TabsTrigger value="refunds">退款处理</TabsTrigger>
  </TabsList>
  <TabsContent value="product"><PlatformBrandingVirtualProductForm /></TabsContent>
  <TabsContent value="orders"><PlatformBrandingEntitlementOrders /></TabsContent>
  <TabsContent value="refunds"><PlatformBrandingVirtualRefunds /></TabsContent>
</Tabs>
```

交互必须明确显示：当前 purchase mode；sandbox/production；mapping 校验状态；统一售价；密钥只显示“已配置/版本号”；maintenance 风险提示；从 virtual 只能暂停；iOS 退款显示“Apple 外部处理”；退款按钮仅对 succeeded 且 refund_status=none 的虚拟订单启用。不得提供 AppKey 明文输入回显、普通支付回退按钮或客户端平台加价字段。

权限分离：`platform.branding_product.manage` 控制商品和通道配置，`platform.branding_order.read` 控制订单 tab，`platform.branding_virtual_refund.manage` 控制退款 tab 与操作；页面服务端按 session 权限分别取数，无权 tab 不发起后端请求。

- [ ] **Step 4: 同步 loading 骨架屏**

骨架屏必须与三段布局一致：页面标题、Tabs、顶部配置 Card、筛选栏、表格 8 行；容器继续使用 `min-h-0 flex-1`，内容 Card 占满可用宽度和高度，滚动仅发生在 CardContent。

- [ ] **Step 5: 验证并提交**

Run: `bun test apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts && pnpm --dir apps/admin check && pnpm --dir apps/admin build`

Expected: 测试 PASS、Next 检查和生产构建成功；无 hydration、overflow 或缺失 key 警告。

```bash
git add apps/admin/app/'(console)'/platform/branding-addon/page.tsx apps/admin/app/'(console)'/platform/branding-addon/loading.tsx apps/admin/components/branding-addon/platform-branding-virtual-product-form.tsx apps/admin/components/branding-addon/platform-branding-entitlement-orders.tsx apps/admin/components/branding-addon/platform-branding-virtual-refunds.tsx apps/admin/components/branding-addon/platform-branding-addon-product-types.ts apps/admin/components/branding-addon/platform-branding-addon-product-form-data.ts apps/admin/components/branding-addon/platform-branding-addon-product-form.tsx apps/admin/components/branding-addon/platform-branding-virtual-admin-contract.test.ts apps/admin/components/branding-addon/platform-branding-addon-product-form-data.test.ts
git commit -m "feat(admin): 增加品牌权益虚拟支付管理"
```

## Task 11：阻断旧写入并收敛旧普通支付 pending 订单

**Files:**
- Create: `supabase/migrations/20260731135500_guard_legacy_branding_payment_cutover.sql`
- Create: `apps/api/src/scripts/branding-virtual-payment-cutover.ts`
- Create: `apps/api/src/scripts/branding-virtual-payment-cutover.test.ts`
- Modify: `apps/api/src/services/tenant-branding-addon-orders.ts`
- Modify: `apps/api/src/services/tenant-branding-addon-orders-payment.test.ts`
- Modify: `apps/api/package.json`
- Create: `docs/runbooks/branding-virtual-payment-cutover.md`

- [ ] **Step 1: 写旧接口阻断和收敛状态测试**

```ts
test.each(["maintenance", "wechat_virtual"])("blocks legacy writes in %s", async (purchaseMode) => {
  productRepository.getProduct.mockResolvedValue({ ...product, purchase_mode: purchaseMode });
  await expect(service.createOrder(auth, input, openid)).rejects.toMatchObject({
    statusCode: 409,
    code: "BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED",
  });
});

test("does not switch while an old order remains unresolved", async () => {
  queryOrder.mockRejectedValue(new TypeError("network down"));
  const result = await cutover.runBatch({ limit: 100 });
  expect(result.unresolved).toBe(1);
  expect(setPurchaseMode).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行失败测试**

Run: `bun test apps/api/src/scripts/branding-virtual-payment-cutover.test.ts apps/api/src/services/tenant-branding-addon-orders-payment.test.ts`

Expected: FAIL，旧 service 仍允许创建，cutover 模块不存在。

- [ ] **Step 3: 创建数据库第二道写保护和 claim RPC**

Migration 替换 `branding_create_addon_order(...)` 的函数体入口：

```sql
SELECT purchase_mode INTO v_purchase_mode
FROM public.platform_addon_products
WHERE code = p_product_code
FOR UPDATE;

IF v_purchase_mode <> 'direct_legacy' THEN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED';
END IF;
```

增加 `branding_claim_legacy_pending_orders(p_limit integer, p_lease_seconds integer)`，强制 `LEAST(GREATEST(p_limit, 1), 100)`，使用 `FOR UPDATE SKIP LOCKED` 和现有 close claim 字段；增加 `branding_assert_virtual_cutover_ready()`，仅当旧 pending 为 0、production mapping active+valid、金额一致且 >=100、密钥 revision 一致时返回 true。

- [ ] **Step 4: 实现受控收敛命令**

命令流程固定：先要求当前 mode=maintenance；每批 claim <=100；用每笔旧订单自己的支付配置调用现有普通支付查单；SUCCESS 走现有 `BrandingAddonPaymentConfirmation`；NOTPAY 调现有关单，远端确认后写 `PAYMENT_CHANNEL_MIGRATED`；CLOSED 幂等本地关闭；ORDER_NOT_EXIST 按现有 prepay_id 可靠性规则处理；网络或未知状态释放 claim 并保留 pending；未决为 0 后只输出“允许切换”，不自动替管理员修改生产模式。

`apps/api/package.json` 增加：

```json
"branding:virtual-payment:cutover": "bun --env-file=/dev/null src/scripts/branding-virtual-payment-cutover.ts"
```

- [ ] **Step 5: 编写 runbook**

Runbook 必须包含：上线顺序、migration list 前后截图位置、maintenance 操作、旧 pending 每批输出、未知状态处理、production mapping 校验、iOS 真实支付验收、切换 wechat_virtual、监控项、暂停条件、恢复条件和“禁止回退 direct_legacy”。同时写明普通独立商户号继续服务其他普通支付业务。

- [ ] **Step 6: 验证并提交**

Run: `bun test apps/api/src/scripts/branding-virtual-payment-cutover.test.ts apps/api/src/services/tenant-branding-addon-orders-payment.test.ts && bun run api:typecheck`

Expected: 全部 PASS；任何未决订单都阻止切换；切换后旧写接口稳定返回 409。

```bash
git add supabase/migrations/20260731135500_guard_legacy_branding_payment_cutover.sql apps/api/src/scripts/branding-virtual-payment-cutover.ts apps/api/src/scripts/branding-virtual-payment-cutover.test.ts apps/api/src/services/tenant-branding-addon-orders.ts apps/api/src/services/tenant-branding-addon-orders-payment.test.ts apps/api/package.json docs/runbooks/branding-virtual-payment-cutover.md
git commit -m "feat(payments): 增加虚拟支付切换保护"
```

## Task 12：完成小程序交接、smoke、对账和发布证据

**Files:**
- Create: `apps/api/src/scripts/branding-virtual-payment-smoke.ts`
- Create: `apps/api/src/scripts/branding-virtual-payment-smoke.test.ts`
- Modify: `apps/api/package.json`
- Create: `docs/miniprogram/2026-07-31-branding-virtual-payment-handoff.md`
- Modify: `docs/runbooks/branding-virtual-payment-cutover.md`

- [ ] **Step 1: 写 smoke 契约测试**

```ts
test("smoke never sends a real payment or refund", async () => {
  const source = readFileSync(resolve(import.meta.dir, "branding-virtual-payment-smoke.ts"), "utf8");
  expect(source).toContain("/tenant/branding/entitlement-product");
  expect(source).toContain("/platform/branding/entitlement-orders?page=1&pageSize=20");
  expect(source).not.toContain("wx.requestVirtualPayment");
  expect(source).not.toContain("/xpay/refund_order");
});
```

- [ ] **Step 2: 实现只读/沙箱 smoke**

脚本验证 API 健康、商品 capability、mapping 环境、创建接口 schema、统一列表分页和 callback route 可达性；只有显式 `VIRTUAL_PAYMENT_SMOKE_ALLOW_SANDBOX_ORDER=true` 时才创建 sandbox 订单，仍不调用客户端支付或退款。日志只输出 requestId、order id、outTradeNo 哈希、environment 和状态。

`apps/api/package.json` 增加：

```json
"branding:virtual-payment:smoke": "bun --env-file=/dev/null src/scripts/branding-virtual-payment-smoke.ts"
```

- [ ] **Step 3: 编写小程序交接文档**

交接文档固定说明：

```text
1. 读取 GET /tenant/branding/entitlement-product 的 capability。
2. POST /tenant/branding/virtual-payment/orders，客户端只传 product_code、UUIDv4 幂等键和 requested_platform。
3. POST /tenant/branding/virtual-payment/orders/:id/payment-request。
4. 将 request_payload 原样传给 wx.requestVirtualPayment。
5. success 只进入“支付结果确认中”，轮询 GET /tenant/branding/entitlement-orders/:id。
6. 收到 BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED 或 wx.requestVirtualPayment 返回 -15007 时，先重新 wx.login，再请求同一订单的 payment-request。
7. 收到 BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED 时提示升级，不调用 wx.requestPayment。
8. iOS 不满足条件、取消、网络失败和超时均不回退普通支付。
9. 历史订单根据 payment_channel 展示，不由客户端计算手续费或改价。
```

同时提供成功、维护、需重新登录、处理中和失败的脱敏 JSON 响应样例；不包含 token、OpenID、AppKey、session key 或真实 OCR/用户信息。交接首页明确写 `@gooes/domain@1.14.0`，小程序团队不得自行复制枚举或修改 Orange 仓库中的本地类型来绕过版本升级。

- [ ] **Step 4: 运行完整本地验证**

Run:

```bash
bun test apps/api/src/services/branding-virtual-payment-migration-contract.test.ts
bun test apps/api/src/services/wechat-mini-session-crypto.test.ts apps/api/src/services/wechat-mini-session-credentials.test.ts
bun test apps/api/src/services/wechat-virtual-payment-signatures.test.ts apps/api/src/services/wechat-virtual-payment-gateway.test.ts
bun test apps/api/src/services/tenant-branding-virtual-orders.test.ts
bun test apps/api/src/services/wechat-virtual-payment-notifications.test.ts apps/api/src/services/branding-virtual-payment-confirmation.test.ts
bun test apps/api/src/services/branding-virtual-payment-reconciliation.test.ts apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts
bun test apps/api/src/services/branding-entitlement-order-query.test.ts apps/api/src/services/branding-virtual-refunds.test.ts
bun test apps/api/src/scripts/branding-virtual-payment-cutover.test.ts apps/api/src/scripts/branding-virtual-payment-smoke.test.ts
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

Expected: 所有测试 PASS；`api:typecheck`、API build、文件大小检查、Admin check/build 全部成功。

- [ ] **Step 5: 生成共享契约的可移植制品**

先完成 domain build，再禁用 lifecycle scripts 打包，避免 `prepack` 的 clean 脚本删除工作区已有 `1.13.0` tarball：

```bash
pnpm --dir packages/domain run build
npm pack ./packages/domain --ignore-scripts --pack-destination ./packages/domain
shasum -a 256 packages/domain/gooes-domain-1.14.0.tgz
```

Expected: 生成 `packages/domain/gooes-domain-1.14.0.tgz`，packed consumer 验证通过，SHA-256 被写入小程序交接文档。按仓库现行约定该 `.tgz` 用于本机/联调交付且不加入 Git；CI 或其他开发机在切换前必须取得 `@gooes/domain@1.14.0` 的不可变制品地址。不得在本任务中修改 Orange，只把版本、路径和 SHA-256 交给小程序团队。

- [ ] **Step 6: 验证 migration 和 dev 数据库**

Run:

```bash
supabase migration list
supabase db push --dry-run
```

Expected: dry-run 仅列出本计划六个 migration，顺序为 `130000`、`131000`、`132000`、`133000`、`134000`、`135000`，无历史 migration 重写。

按仓库部署流程应用 dev 后再次运行 `supabase migration list`；Expected: Local/Remote 六个版本全部对齐。随后运行统一列表的 `EXPLAIN (ANALYZE, BUFFERS)`、`bun --env-file=/dev/null apps/api/src/scripts/branding-virtual-payment-smoke.ts`，记录 requestId 和脱敏结果。

- [ ] **Step 7: 回归独立商户号普通支付**

使用现有测试与 dev smoke 验证普通支付下单、通知、查单、关单、退款和账单路径；特别断言 `platform_direct_recharge`、`direct_merchant` 和 `/pay/wechat/callback` 未被虚拟支付代码改写。Expected: 旧普通支付测试全部 PASS，普通支付配置仍 active，品牌权益虚拟支付故障不会调用旧网关。

- [ ] **Step 8: 执行真实支付验收但不在自动脚本扣款**

人工在微信开发者工具与真机完成：Android/鸿蒙/Windows sandbox 道具直购；通知正常履约；屏蔽通知后查单补偿；success 回调丢失；重复通知；网络取消；生产 iOS 不低于 1 元受控真实支付；Apple 外部退款状态。每个场景记录环境、requestId、订单 ID、微信订单标识哈希和最终三个状态，不记录密钥、token 或完整 OpenID。

- [ ] **Step 9: 提交交接和验证资产**

```bash
git add apps/api/src/scripts/branding-virtual-payment-smoke.ts apps/api/src/scripts/branding-virtual-payment-smoke.test.ts apps/api/package.json docs/miniprogram/2026-07-31-branding-virtual-payment-handoff.md docs/runbooks/branding-virtual-payment-cutover.md
git commit -m "docs(payments): 完成虚拟支付发布与小程序交接"
```

## 最终上线闸门

- [ ] 虚拟账户、offerId、sandbox/production AppKey 和商品已由微信后台启用。
- [ ] production 商品金额与 Gooes 商品一致且不低于 100 分。
- [ ] `session_key` 加密轮换、失效和重新登录链路已用真机验证。
- [ ] 通知与主动查单均可独立完成一次且仅一次权益履约。
- [ ] Admin 可区分新旧渠道、支付/履约/退款三个状态，iOS 退款文案准确。
- [ ] 旧 pending 普通支付品牌权益订单为 0，未知状态为 0。
- [ ] 普通独立商户号全量回归通过，未来实物商城只复用支付基础设施，不复用权益订单表。
- [ ] purchase mode 按 `direct_legacy -> maintenance -> wechat_virtual` 切换；故障演练只回 `maintenance`。
- [ ] 监控覆盖支付成功未履约、上下文不匹配、通知认证失败、退款成功未补偿和切换后旧渠道新增成功交易。
- [ ] 生产切换前后的 `supabase migration list`、测试、构建、EXPLAIN、smoke 和真机证据已归档。
