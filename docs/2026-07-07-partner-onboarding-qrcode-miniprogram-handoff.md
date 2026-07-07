# 城市合伙人专属二维码入驻链路小程序对接说明

## 背景

城市合伙人需要在小程序端展示自己的专属小程序码。装修公司使用微信扫码后，应该直接进入装修公司入驻链路；入驻完成后，后端根据二维码中的邀请码把装修公司和城市合伙人建立绑定关系。

本次后端只负责 gooes 仓库能力补齐和契约说明；orange 小程序仓库保持只读，具体页面和服务包装由小程序团队修改。

## 微信小程序码约束

后端使用微信 `getwxacodeunlimit` 生成不限制数量的小程序码：

- 接口地址：`POST https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=ACCESS_TOKEN`
- `page` 只能是小程序页面路径，不能带 query 参数。
- 业务参数放在 `scene` 中，小程序启动后从 `query.scene` 读取并 `decodeURIComponent`。
- `scene` 最大 32 个可见字符，后端当前使用邀请码本身，例如 `CP-411500-0001`。
- `check_path=true` 时，微信会校验 `page` 是否为已发布存在的页面；联调未发布页面时可临时配置为 `false`。
- `env_version` 支持 `release`、`trial`、`develop`。

官方文档：

- https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/qr-code/getUnlimitedQRCode.html

## 后端配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `WECHAT_PARTNER_ONBOARDING_PAGE` | `pages/visitor/index` | 城市合伙人二维码扫码后进入的小程序页面。小程序入驻页准备好后，应改成真实入驻页，例如 `packageVisitor/pages/tenant-onboarding/index`。 |
| `WECHAT_MINIPROGRAM_ENV_VERSION` | `release` | 生成正式版、体验版或开发版小程序码。 |
| `WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH` | `true` | 是否让微信校验页面路径。生产建议 `true`，联调未发布页面可临时 `false`。 |

## 后端接口

### 1. 合伙人获取默认专属二维码

```http
GET /partner/invite-code/default
Authorization: Bearer <platform_partner token>
```

返回：

```json
{
  "invite_code": "CP-411500-0001",
  "status": "active",
  "region_code": "411500",
  "expires_at": null,
  "qr_code_content_type": "image/png",
  "qr_code_image_base64": "data:image/png;base64,..."
}
```

用途：

- 合伙人小程序工作台展示专属二维码。
- 后端会自动获取或创建一个可用默认邀请码。
- 小程序端不要传 `partner_id`。

orange 当前已存在：

- `src/services/partner.ts`：`PartnerService.defaultInviteCode()`
- `src/packagePartner/pages/invite-codes/index.tsx`
- `src/types/api/partner.d.ts`：`PartnerDefaultInviteCode`

### 2. 扫码后解析邀请码

```http
GET /partner-onboarding/invite-codes/:code
```

认证：

- public route
- 不需要登录态
- 不需要 `partner_id`

返回：

```json
{
  "invite_code": {
    "id": "uuid",
    "code": "CP-411500-0001",
    "region_code": "411500",
    "campaign_code": null,
    "expires_at": null
  },
  "partner": {
    "id": "uuid",
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
```

后端行为：

- 规范化邀请码大小写和空格。
- 校验邀请码可用、未过期、合伙人启用。
- 成功解析后，`scan_count + 1`。

### 3. 入驻完成后绑定装修公司和合伙人

```http
POST /partner-onboarding/tenant-binding
Authorization: Bearer <tenant employee/customer token with tenant context>
Content-Type: application/json
```

请求：

```json
{
  "invite_code": "CP-411500-0001",
  "source_id": "scene=partner-onboarding"
}
```

认证：

- 需要当前登录态有 `tenant_id`。
- 小程序端不要传 `tenant_id`、`partner_id`、`invite_code_id`。
- 后端从 token 识别租户，从邀请码识别合伙人。

返回：

```json
{
  "invite_code": {
    "id": "uuid",
    "code": "CP-411500-0001",
    "region_code": "411500",
    "campaign_code": null,
    "expires_at": null
  },
  "partner": {
    "id": "uuid",
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
    "id": "uuid",
    "tenant_id": "uuid",
    "partner_id": "uuid",
    "invite_code_id": "uuid",
    "source_type": "invite_code",
    "source_id": "scene=partner-onboarding",
    "status": "active"
  },
  "created": true,
  "idempotent": false
}
```

后端行为：

- 新绑定创建成功后，`submitted_count + 1`、`approved_count + 1`。
- 如果当前租户已经绑定同一个合伙人，返回已有绑定，`created=false`、`idempotent=true`，不重复计数。
- 如果当前租户已绑定其他合伙人，返回冲突错误，不创建绑定，不计数。

## 错误码

| 错误码 | 场景 | 小程序建议 |
| --- | --- | --- |
| `PARTNER_INVITE_CODE_UNAVAILABLE` | 邀请码不存在、停用或不可用 | 提示二维码已失效，引导联系合伙人重新获取 |
| `PARTNER_INVITE_CODE_EXPIRED` | 邀请码已过期 | 提示二维码已过期 |
| `PARTNER_INVITE_PARTNER_UNAVAILABLE` | 合伙人未启用或不可绑定 | 提示该合伙人当前不可绑定 |
| `TENANT_CONTEXT_REQUIRED` | 绑定接口没有租户上下文 | 引导装修公司完成入驻或重新登录 |
| `TENANT_PARTNER_BINDING_EXISTS` | 当前装修公司已绑定其他合伙人 | 提示已存在绑定，走人工处理 |

## 小程序需要补的点

### 1. 解析二维码 `scene`

当前 orange `src/app.ts` 已处理 `share_token`，但没有识别城市合伙人邀请码。建议扩展现有 `parseSceneParams` / `captureShareToken` 旁边的逻辑：

- 从 `options.query.scene` 读取值。
- 使用 `decodeURIComponent(scene)`。
- 如果解码后以 `CP-` 开头，保存为 pending partner invite code。
- 不要把邀请码当 `share_token` 处理。

建议新增 store 字段：

- `pendingPartnerInviteCode`
- `setPendingPartnerInviteCode(code: string)`
- `clearPendingPartnerInviteCode()`

### 2. 增加入驻承接页

当前 `src/app.config.ts` 的 `packageVisitor` 已有：

- `pages/partner-application/index`
- `pages/visitor-project-detail/index`
- `pages/visitor-local-services/index`

建议新增或确认装修公司入驻页，例如：

```ts
{
  root: 'packageVisitor',
  pages: [
    'pages/tenant-onboarding/index'
  ]
}
```

后端配置 `WECHAT_PARTNER_ONBOARDING_PAGE` 应与这个页面路径完全一致。

### 3. 增加服务包装

建议在 orange `src/services/partner.ts` 或单独 `src/services/partner_onboarding.ts` 增加：

```ts
export interface PartnerOnboardingInviteCodePayload {
  invite_code: {
    id: string;
    code: string;
    region_code?: string | null;
    campaign_code?: string | null;
    expires_at?: string | null;
  };
  partner: {
    id: string;
    name: string;
    status: string;
    region_codes: string[];
    level?: { code: string; name: string } | null;
  };
  onboarding: {
    can_bind: boolean;
    binding_source_type: 'invite_code';
  };
}

export interface PartnerOnboardingBindingPayload
  extends PartnerOnboardingInviteCodePayload {
  binding: {
    id: string;
    tenant_id?: string | null;
    partner_id?: string | null;
    invite_code_id?: string | null;
    source_type?: string | null;
    source_id?: string | null;
    status?: string | null;
  };
  created: boolean;
  idempotent: boolean;
}

export const PartnerOnboardingService = {
  resolveInviteCode: (code: string) =>
    api.get<PartnerOnboardingInviteCodePayload>(
      `/partner-onboarding/invite-codes/${encodeURIComponent(code)}`,
      {},
      { skipAuth: true },
    ),

  bindTenant: (input: { invite_code: string; source_id?: string }) =>
    api.post<PartnerOnboardingBindingPayload>(
      '/partner-onboarding/tenant-binding',
      input,
      { showErrorToast: false },
    ),
};
```

### 4. 页面流程建议

1. 小程序启动解析到 `CP-` 邀请码。
2. 保存 pending invite code。
3. 跳转到装修公司入驻页。
4. 页面调用 `GET /partner-onboarding/invite-codes/:code`，展示合伙人名称和地区归因。
5. 装修公司完成入驻/登录，拿到有 `tenant_id` 的 token。
6. 调用 `POST /partner-onboarding/tenant-binding`。
7. 绑定成功后清除 pending invite code。
8. 如果返回 `idempotent=true`，按成功处理，不重复提示异常。

## 联调检查清单

- [ ] 合伙人工作台 `GET /partner/invite-code/default` 能显示二维码图片。
- [ ] 扫码后小程序 `query.scene` 能拿到 `CP-...` 邀请码。
- [ ] `GET /partner-onboarding/invite-codes/:code` 无登录态可调用。
- [ ] 成功解析后后台邀请码 `scan_count` 增加。
- [ ] 装修公司入驻完成后调用 `POST /partner-onboarding/tenant-binding`，请求体不包含 `partner_id`。
- [ ] 新绑定成功后 `submitted_count` 和 `approved_count` 增加。
- [ ] 同一装修公司重复绑定同一邀请码返回 `idempotent=true`。
- [ ] 已绑定其他合伙人时返回 `TENANT_PARTNER_BINDING_EXISTS`。
- [ ] 过期/停用邀请码能按错误码展示“二维码失效”。

## 环境发布提醒

如果小程序入驻页尚未发布：

- 联调环境可以把 `WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH=false`。
- `WECHAT_MINIPROGRAM_ENV_VERSION` 可设为 `trial` 或 `develop`。
- 小程序页面发布并确认路径后，生产应恢复 `WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH=true`。

## 后端本次变更范围

- 生成小程序码时支持配置 `check_path`。
- 统一城市合伙人邀请码二维码生成配置。
- 新增数据库原子函数更新邀请码扫码、提交、通过计数。
- 公开解析邀请码成功后增加扫码计数。
- 新建绑定成功后增加提交和通过计数。
- 新增本交接文档。
