# 微信虚拟支付配置归并发布与加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已完成的微信虚拟支付统一配置安全合入主分支，完成开发环境真实验收，并在不写入生产密钥、不提前切换生产购买通道的前提下形成可执行的生产发布门禁。

**Architecture:** 先通过 Pull Request 固化代码、migration 和验证证据，再在开发环境使用 Admin 统一入口完成沙箱配置和真实微信只读校验。生产发布拆成“部署兼容代码”“配置并只读校验”“清理旧订单”“人工切换”四个门禁；普通微信 APIv3 商户配置始终保留，但不得作为数字权益的自动降级通道。与本功能无直接关系的 smoke 表 RLS 风险单独立项，避免在支付发布分支中混入未经验证的权限变更。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase/PostgreSQL migration、Next.js 15、shadcn/ui、GitHub Actions、微信小程序虚拟支付服务端 API。

---

## File Map

- `apps/api/src/services/platform-branding-virtual-payment-settings.ts`：支付配置统一编排、权限与生产就绪门禁。
- `apps/api/src/services/branding-virtual-product-management.ts`：本地校验、微信只读校验与结果持久化。
- `apps/api/src/services/branding-virtual-product-wechat-validation.ts`：微信最近上传/发布任务的单商品核验与错误分类。
- `apps/api/src/services/wechat-virtual-payment-gateway.ts`：微信虚拟支付只读查询网关。
- `apps/admin/components/settings/platform-virtual-payment-settings.tsx`：Admin 虚拟支付统一配置入口。
- `apps/admin/components/branding-addon/platform-branding-virtual-product-form.tsx`：品牌权益商品编辑与只读支付摘要。
- `supabase/migrations/20260801105000_atomic_platform_payment_secret_settings.sql`：支付密钥原子写入与审计脱敏。
- `supabase/migrations/20260801110000_support_pending_branding_virtual_product_validation.sql`：支持 `pending` 校验态并保护 active 启用意图。
- `.github/workflows/release-dev.yml`、`.github/workflows/migrate-dev-database.yml`：开发环境发布和 migration 验证入口。
- `apps/api/src/scripts/branding-virtual-payment-smoke.ts`：虚拟支付只读/沙箱订单 smoke。
- `apps/api/src/scripts/branding-virtual-payment-cutover.ts`：生产切换前旧普通支付订单收口。

## Task 1: 推送功能分支并创建 Pull Request

**Files:**
- Review: `docs/superpowers/specs/2026-08-01-centralize-virtual-payment-settings-design.md`
- Review: `docs/superpowers/plans/2026-08-01-centralize-virtual-payment-settings.md`
- Review: `docs/superpowers/plans/2026-08-02-centralize-virtual-payment-release-and-hardening.md`

- [ ] **Step 1: 确认分支和工作区**

Run:

```bash
git status --short --branch
git diff --check
git log --oneline origin/main..HEAD
```

Expected: 当前分支为 `feat/centralize-virtual-payment-settings`，工作区无未提交文件，`git diff --check` 退出码为 0。

- [ ] **Step 2: 复跑合并前核心验证**

Run:

```bash
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
bun --cwd=apps/api test \
  src/services/wechat-virtual-payment-goods-query.test.ts \
  src/services/branding-virtual-product-wechat-validation.test.ts \
  src/services/branding-virtual-product-management.test.ts \
  src/services/platform-branding-virtual-payment-settings.test.ts
bun --cwd=apps/admin test \
  components/settings/platform-payment-settings-panel.test.ts \
  components/settings/platform-virtual-payment-settings.test.ts \
  components/branding-addon/platform-branding-payment-summary.test.ts
```

Expected: API/Admin 类型检查和构建通过；API 聚焦测试 69 项、Admin 聚焦测试 35 项全部通过。

- [ ] **Step 3: 推送分支**

Run:

```bash
git push -u origin feat/centralize-virtual-payment-settings
```

Expected: 远端建立同名分支，禁止 force push。

- [ ] **Step 4: 创建 Pull Request**

Run:

```bash
gh pr create \
  --base main \
  --head feat/centralize-virtual-payment-settings \
  --title "feat(payments): 统一管理微信虚拟支付配置" \
  --body "$(cat <<'EOF'
## Summary
- 将数字权益虚拟支付配置归入系统配置 → 支付配置
- 保留普通微信 APIv3 商户配置，品牌权益页收敛为商品管理与只读支付摘要
- 增加加密密钥原子写入、服务端就绪门禁及微信商品上传/发布状态只读校验

## Database
- 20260801105000_atomic_platform_payment_secret_settings.sql
- 20260801110000_support_pending_branding_virtual_product_validation.sql
- 开发库 Local/Remote migration 已对齐

## Test Plan
- [x] API focused tests: 69 passed
- [x] Admin focused tests: 35 passed
- [x] API/Admin type checks and builds passed
- [x] No production secret written and no production purchase-mode switch performed
EOF
)"
```

Expected: PR 创建成功，保留当前 worktree 处理审查反馈。

## Task 2: 完成 CI 与代码审查门禁

**Files:**
- Review: `.github/workflows/release-dev.yml`
- Review: `.github/workflows/migrate-dev-database.yml`
- Review: `.github/workflows/verify-dev-migration-history.yml`

- [ ] **Step 1: 检查 PR 状态**

Run:

```bash
gh pr checks --watch
```

Expected: 所有 required checks 成功，无 migration history 分叉。

- [ ] **Step 2: 审查安全边界**

检查 PR diff 必须满足：

```text
Admin 不回显 AppKey 或消息令牌明文
客户端不能提交 encrypted_secret_ref 或系统设置键
微信商品校验不调用 start_upload_goods 或 start_publish_goods
268490003 才会按明确签名错误写 invalid
无任务、处理中、限流、系统错误、参数错误和未知错误均写 pending
pending 不会把 active 映射降为 disabled
普通微信 APIv3 商户配置未删除
```

- [ ] **Step 3: 处理审查反馈**

每个反馈执行独立的小提交：先补失败测试，再实现修复，再运行相关测试。禁止将无关重构或 RLS 变更混入当前 PR。

## Task 3: 合并并验证开发环境发布

**Files:**
- Verify: `supabase/migrations/20260801105000_atomic_platform_payment_secret_settings.sql`
- Verify: `supabase/migrations/20260801110000_support_pending_branding_virtual_product_validation.sql`

- [ ] **Step 1: 使用 Squash and merge 合并 PR**

Recommended squash title:

```text
feat(payments): 统一管理微信虚拟支付配置
```

Expected: `main` 只产生一个业务聚合提交，PR 审查记录保留。

- [ ] **Step 2: 验证开发库 migration 对齐**

Run with the confirmed development database URL:

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: `20260801105000` 和 `20260801110000` 的 Local/Remote 均存在且一致。若环境含生产标记，立即停止。

- [ ] **Step 3: 验证开发 API 路由**

Run:

```bash
curl -i https://api-dev.goodcms.cn/platform/payment/wechat-virtual/branding-entitlement
```

Expected: 无 token 返回 `401 TOKEN_MISSING`，证明路由存在；不得返回 404 或 500。

- [ ] **Step 4: 验证 Admin 页面**

使用已登录平台超管账号检查：

```text
https://admin-dev.goodcms.cn/settings?group=payment&section=ordinary
https://admin-dev.goodcms.cn/settings?group=payment&section=virtual&environment=sandbox
https://admin-dev.goodcms.cn/settings?group=payment&section=virtual&environment=production
https://admin-dev.goodcms.cn/platform/branding-addon
```

Expected: 普通支付配置完整；虚拟支付配置、环境页签和只读商品摘要正常；无页面截断、横向溢出、控制台错误或密钥回显。

## Task 4: 完成开发环境沙箱真实验收

**Files:**
- Verify: `apps/api/src/scripts/branding-virtual-payment-smoke.ts`
- Verify: `apps/admin/components/settings/platform-virtual-payment-settings.tsx`

- [ ] **Step 1: 通过 Admin 写入沙箱配置**

只在沙箱环境录入以下资料：

```text
小程序 AppID
虚拟支付商户号
Offer ID
渠道商品 ID
与年度权益一致的价格
沙箱 AppKey 和递增 revision
微信虚拟支付消息令牌
```

Expected: AppKey 和消息令牌保存后不回显，页面仅展示来源、configured 和 revision。

- [ ] **Step 2: 运行微信商品只读校验**

在 Admin 点击沙箱“校验”。

Expected: 只有微信最近上传任务和发布任务均确认同一固定商品、同一价格且状态成功时写入 `valid`；否则保持 `pending` 或明确写入 `invalid`，页面展示白名单错误码和受限 request ID。

- [ ] **Step 3: 运行只读 smoke**

Run:

```bash
cd apps/api
API_BASE_URL=https://api-dev.goodcms.cn \
VIRTUAL_PAYMENT_SMOKE_TENANT_TOKEN="$DEV_TENANT_TOKEN" \
VIRTUAL_PAYMENT_SMOKE_PLATFORM_TOKEN="$DEV_PLATFORM_TOKEN" \
VIRTUAL_PAYMENT_SMOKE_ALLOW_SANDBOX_ORDER=false \
VIRTUAL_PAYMENT_SMOKE_REQUESTED_PLATFORM=android \
bun run branding:virtual-payment:smoke
```

Expected: `ok=true`、`mode=read_only`、所有列表请求分页、`payment_attempted=false`、`refund_attempted=false`。日志不得输出 token 或密钥。

- [ ] **Step 4: 可选创建沙箱订单**

只有在租户 capability 明确返回沙箱运行环境和支持创建沙箱订单后，才把：

```bash
VIRTUAL_PAYMENT_SMOKE_ALLOW_SANDBOX_ORDER=true
```

Expected: 只创建沙箱订单，不发起真实支付和退款；否则保持只读 smoke。

## Task 5: 小程序联调与回归

**Files:**
- Reference only: `/Users/leefo/Public/work/orange`
- Verify: `docs/miniprogram/2026-07-28-tenant-support-branding-batch-b-handoff.md`

- [ ] **Step 1: 向 Orange 团队同步稳定契约**

同步内容：开发 API 地址、domain 包版本、capability 响应、订单创建字段、微信虚拟支付环境，以及 `maintenance` 时禁止下单的行为。Gooes Agent 不修改 Orange 仓库。

- [ ] **Step 2: 完成三端回归**

在 Android、HarmonyOS 和微信开发者工具分别验证：

```text
各平台用户售价一致
数字权益只走微信虚拟支付 capability
maintenance 时明确提示暂停购买
普通支付不作为数字权益自动回退
订单创建幂等键重复提交不产生重复订单
```

- [ ] **Step 3: 记录脱敏证据**

只记录接口、HTTP 状态、稳定错误码、request ID、order ID 和环境；禁止记录 token、AppKey、消息令牌、openid 或完整回调报文。

## Task 6: 生产发布准备，不执行切换

**Files:**
- Verify: `apps/api/src/scripts/branding-virtual-payment-cutover.ts`
- Verify: `apps/api/src/scripts/branding-virtual-payment-smoke.ts`

- [ ] **Step 1: 部署兼容代码和 migration**

先部署 API/Admin 和两个前向 migration，但保持当前购买模式，不录入真实生产密钥，不切换 `wechat_virtual`。

- [ ] **Step 2: 核对生产配置清单**

人工确认：

```text
年度权益商品已启用且价格正确
微信生产商品已上传并发布
生产 AppID、虚拟商户号、Offer ID、Product ID 已双人复核
生产 AppKey revision 与映射一致
消息令牌和 WECHAT_MINIPROGRAM_ORIGINAL_ID 已配置
普通 APIv3 商户配置仍可服务后续实物商城
```

- [ ] **Step 3: 运行生产只读校验**

通过 Admin 只读查询微信最近上传/发布任务。Expected: readiness 全部通过，但购买模式仍保持原状态。

- [ ] **Step 4: 输出 Go/No-Go 记录**

Go 条件：生产 readiness ready、无未决普通支付订单、回调路由正常、开发沙箱真机验收通过、监控和维护模式操作人已确认。任何一项失败均为 No-Go。

## Task 7: 单独授权后执行生产切换

**Files:**
- Execute: `apps/api/src/scripts/branding-virtual-payment-cutover.ts`

- [ ] **Step 1: 切换到 maintenance**

Expected: 新数字权益订单立即停止创建；普通商户号配置不删除。

- [ ] **Step 2: 收口旧普通支付订单**

Run with production credentials only after explicit production authorization:

```bash
cd apps/api
bun run branding:virtual-payment:cutover
```

Expected: `unresolved=0`、`release_failed=0`、`allow_switch=true`。否则保持 maintenance，不继续。

- [ ] **Step 3: 人工切换为 wechat_virtual**

在 Admin 二次确认对话框执行切换。服务端必须再次检查 production readiness；失败时不得绕过。

- [ ] **Step 4: 切换后 smoke 与监控**

验证 capability、创建订单、支付回调、权益发放和退款查询；发现异常只切回 `maintenance`，不得自动回退 `direct_legacy`。

## Task 8: 独立处理 smoke 表 RLS 安全项

**Files:**
- Review: `supabase/migrations/20260725194000_customer_wechat_pay_smoke_orders.sql`
- Review: `apps/api/src/repositories/customer-wechat-pay-smoke.ts`
- Create after separate approval: `supabase/migrations/<timestamp>_secure_customer_wechat_pay_smoke_rls.sql`

- [ ] **Step 1: 审计访问主体**

搜索两个表的所有读写路径，确认是否全部经服务端 `service_role`，以及是否存在 anon/authenticated 直连需求。

Run:

```bash
rg -n "customer_wechat_pay_smoke_(orders|notifications)" apps supabase docs
```

- [ ] **Step 2: 先写 migration 契约测试**

测试必须断言两个表启用 RLS、PUBLIC/anon/authenticated 无直接访问权限，并保留服务端 smoke 所需访问。不得先在远端手工执行 DDL。

- [ ] **Step 3: 设计最小策略**

若仅服务端访问，migration 只启用 RLS，不创建客户端 policy；若确认存在客户端直连，再按 tenant/user 事实字段创建最小 `SELECT/INSERT/UPDATE` policy。禁止使用无条件 `USING (true)`。

- [ ] **Step 4: 独立 PR 和回滚说明**

RLS 变更必须独立提交、独立 migration、独立验证。回滚使用后续前向 migration 恢复确有必要的 policy；不得关闭 RLS 作为常规回滚。

## Final Acceptance

- [ ] 功能 PR 已合并且开发环境发布成功。
- [ ] 开发库 migration Local/Remote 对齐。
- [ ] Admin 普通支付与虚拟支付入口均正常。
- [ ] 沙箱真实微信商品校验和真机流程通过。
- [ ] 生产配置完成但未在无授权情况下切换。
- [ ] 生产切换具备 maintenance、旧订单收口和人工 Go/No-Go 门禁。
- [ ] smoke 表 RLS 已建立独立安全任务，不混入本次支付发布。
