# 小程序城市合伙人扫码入驻交接文档

日期：2026-07-05
落地分支：`main`
来源提交：`feature/partner-miniprogram-onboarding` 的 `c77e23f1` 已摘取到当前主线
当前仓库：`/Users/leefo/Public/work/gooes`
小程序仓库：`/Users/leefo/Public/work/orange`（本次只读核查，未修改）

## 目标

装修公司通过城市合伙人专属二维码进入小程序后，小程序解析邀请码并在装企完成入驻/登录、拿到租户上下文后自动绑定合伙人。

第一期只做归因和绑定闭环：

- 小程序不计算分佣。
- 小程序不展示合伙人收益。
- 小程序不处理结算。
- 合伙人只参与平台收入分成，不参与装修公司自身业务收支。

## 后端已新增接口

### 1. 解析合伙人邀请码

```http
GET /partner-onboarding/invite-codes/:code
```

认证：

- 不要求登录。
- 用于小程序扫码后先展示合伙人归因信息。
- API 全局 auth 白名单已放行 `GET/HEAD /partner-onboarding/invite-codes/*`。

路径参数：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `code` | string | 是 | 合伙人邀请码。后端会 `trim` 并转大写。 |

成功响应：

```json
{
  "data": {
    "invite_code": {
      "id": "00000000-0000-4000-8000-000000000301",
      "code": "CP-411500-0001",
      "region_code": "411500",
      "campaign_code": null,
      "expires_at": null
    },
    "partner": {
      "id": "00000000-0000-4000-8000-000000000201",
      "name": "信阳城市合伙人",
      "status": "active",
      "region_codes": ["411500"],
      "level": {
        "code": "city_partner",
        "name": "城市合伙人"
      }
    },
    "onboarding": {
      "can_bind": true,
      "binding_source_type": "invite_code"
    }
  }
}
```

错误行为：

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 邀请码为空或超过长度限制。 |
| 404 | `PARTNER_INVITE_CODE_UNAVAILABLE` | 邀请码不存在、已禁用或状态不可用。 |
| 410 | `PARTNER_INVITE_CODE_EXPIRED` | 邀请码已过期。 |
| 409 | `PARTNER_INVITE_PARTNER_UNAVAILABLE` | 邀请码对应合伙人不是启用状态。 |

### 2. 当前租户按邀请码绑定合伙人

```http
POST /partner-onboarding/tenant-binding
```

认证：

- 要求登录。
- 后端只使用 token 中的当前 `tenantId`。
- 请求体不允许传 `tenant_id`，避免客户端越权绑定其他租户。
- `POST /partner-onboarding/tenant-binding` 未放入公开白名单，必须带有效登录 token。

请求体：

```json
{
  "invite_code": "CP-411500-0001",
  "source_id": "scene=partner-onboarding"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `invite_code` | string | 是 | 合伙人邀请码。后端会 `trim` 并转大写。 |
| `source_id` | string | 否 | 小程序场景来源，最长 120 字符。建议记录 `scene` 或落地页来源。 |

成功响应：

```json
{
  "data": {
    "invite_code": {
      "id": "00000000-0000-4000-8000-000000000301",
      "code": "CP-411500-0001",
      "region_code": "411500",
      "campaign_code": null,
      "expires_at": null
    },
    "partner": {
      "id": "00000000-0000-4000-8000-000000000201",
      "name": "信阳城市合伙人",
      "status": "active",
      "region_codes": ["411500"],
      "level": {
        "code": "city_partner",
        "name": "城市合伙人"
      }
    },
    "onboarding": {
      "can_bind": true,
      "binding_source_type": "invite_code"
    },
    "binding": {
      "id": "00000000-0000-4000-8000-000000000401",
      "tenant_id": "00000000-0000-4000-8000-000000000501",
      "partner_id": "00000000-0000-4000-8000-000000000201",
      "invite_code_id": "00000000-0000-4000-8000-000000000301",
      "source_type": "invite_code",
      "source_id": "scene=partner-onboarding",
      "status": "active",
      "bound_at": "2026-07-05T00:00:00.000Z"
    },
    "created": true,
    "idempotent": false
  }
}
```

幂等行为：

- 当前租户尚未绑定合伙人：创建 `tenant_partner_bindings`，返回 `created: true`、`idempotent: false`。
- 当前租户已绑定同一个合伙人：不重复创建，返回原绑定，`created: false`、`idempotent: true`。
- 当前租户已绑定其他合伙人：拒绝绑定，返回 `409 TENANT_PARTNER_BINDING_EXISTS`。

错误行为：

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 请求体格式错误。 |
| 401 | `UNAUTHORIZED` | 未登录或 token 无效。 |
| 403 | `TENANT_CONTEXT_REQUIRED` | 当前登录态没有租户上下文。 |
| 404 | `PARTNER_INVITE_CODE_UNAVAILABLE` | 邀请码不存在、已禁用或状态不可用。 |
| 410 | `PARTNER_INVITE_CODE_EXPIRED` | 邀请码已过期。 |
| 409 | `PARTNER_INVITE_PARTNER_UNAVAILABLE` | 邀请码对应合伙人不是启用状态。 |
| 409 | `TENANT_PARTNER_BINDING_EXISTS` | 当前租户已绑定其他合伙人。 |

## 小程序推荐调用顺序

1. 扫码进入小程序，读取二维码 `scene` 或页面 query 中的邀请码。
2. 调用 `GET /partner-onboarding/invite-codes/:code`，校验并展示合伙人归因。
3. 缓存邀请码到本地或 auth store，直到装企完成登录/入驻。
4. 登录/入驻完成后，确认当前身份有租户上下文。
5. 调用 `POST /partner-onboarding/tenant-binding`。
6. 根据响应处理：
   - `created: true`：提示入驻归因成功或静默通过。
   - `idempotent: true`：重复提交，静默通过。
   - `TENANT_PARTNER_BINDING_EXISTS`：提示当前公司已归属其他城市合伙人，请联系平台。

## orange 侧建议改造文件

基于只读核查，orange 当前相关文件如下：

- `src/utils/api.ts`：已有 `api.get/post` 封装。
- `src/utils/https.ts`：支持 `skipAuth`、`optionalAuth`，公开解析接口建议使用 `skipAuth: true`。
- `src/services/index.ts`：统一导出业务 service。
- `src/pages/landing/index.tsx`：当前扫码/启动后的登录落地页，可读取路由参数并触发邀请码解析。
- `src/services/auth.ts`：登录成功后可在 dispatch 前后接入“如果存在 pending invite code，则调用绑定接口”的流程。
- `src/store/auth.ts`：已有 `pendingShareToken` 和 `tenantShareLinkInfo` 模式，可参考其做 `pendingPartnerInviteCode` 本地缓存。

建议新增小程序 service：

```ts
import { api } from '@/utils/api';

export const PartnerOnboardingService = {
  resolveInviteCode: (code: string) =>
    api.get('/partner-onboarding/invite-codes/' + encodeURIComponent(code), {}, {
      skipAuth: true,
    }),
  bindTenant: (input: { invite_code: string; source_id?: string }) =>
    api.post('/partner-onboarding/tenant-binding', input),
};
```

## 小程序验收清单

- 未登录扫码进入：能解析邀请码并展示合伙人名称。
- 邀请码不存在：展示“二维码已失效或不存在”。
- 邀请码过期：展示“二维码已过期”。
- 合伙人停用：展示“合伙人当前不可用”。
- 装企首次入驻/登录后：自动调用绑定接口并成功创建绑定。
- 同一租户重复扫码/重复提交：不报错，按幂等成功处理。
- 已归属其他合伙人的租户扫码：展示冲突提示，不覆盖原绑定。
- 网络失败：保留 pending invite code，下次登录后可重试。

## 当前仓库实现位置

- Schema：`apps/api/src/schema/platform-partners.ts`
- Controller：`apps/api/src/controllers/platform-partners/index.ts`
- Service：`apps/api/src/services/platform-partners.ts`
- Repository：`apps/api/src/repositories/platform-partners.ts`
- Auth 白名单：`apps/api/src/plugins/auth/legacy/routes.ts`
- Tests：
  - `apps/api/src/services/platform-partners.test.ts`
  - `apps/api/src/controllers/platform-partners/routes.test.ts`
  - `apps/api/src/plugins/auth/legacy/routes.test.ts`

## 后续不在第一期范围

- 官网合伙人申请线索。
- 小程序直接创建租户。
- 合伙人收益展示。
- 微信支付自动分账。
- 扫码次数、提交次数、审核通过次数的高并发计数。
