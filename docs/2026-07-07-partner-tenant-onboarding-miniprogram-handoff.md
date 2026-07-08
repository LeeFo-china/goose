# 小程序城市合伙人扫码装企入驻对接

日期：2026-07-07

## 背景

城市合伙人专属二维码已经可以正确进入小程序
`packageVisitor/pages/tenant-onboarding/index`，并通过
`GET /partner-onboarding/invite-codes/:code` 拿到有效合伙人信息。

当前小程序页面的“登录装修公司账号后归因”逻辑不适用于新装企拉新。
扫码进入该页面的主场景应是：平台里还没有这个装修公司，由装修公司
负责人填写入驻资料，后端创建新租户和管理员员工，并把该租户归因到
二维码对应的城市合伙人。

## 页面调整

小程序端需要把
`packageVisitor/pages/tenant-onboarding/index` 从“已有装企登录页”改为
“新装修公司入驻表单”。

页面保留：

- 扫码解析 `scene`
- 保存/读取 `CP-` 开头的邀请码
- 调用 `GET /partner-onboarding/invite-codes/:code`
- 展示合伙人名称、等级、区域和二维码状态

页面删除或弱化：

- “登录装修公司账号”
- “当前装修公司”
- 依赖已有 `tenant_employee` 身份后再绑定
- 新装企主流程里调用 `POST /partner-onboarding/tenant-binding`

## 新接口

### 1. 发送入驻手机号验证码

```http
POST /partner-onboarding/tenant-applications/send-code
```

认证：公开接口，`skipAuth: true`

请求：

```json
{
  "phone": "13900139000",
  "request_device": "iphone-optional"
}
```

响应：

```json
{
  "success": true,
  "cooldown_seconds": 60
}
```

说明：

- `phone` 是新装企管理员手机号。
- 后端按手机号、IP、设备做限流。
- 验证码场景为 `partner_tenant_onboarding`。

### 2. 提交新装企入驻

```http
POST /partner-onboarding/tenant-applications
```

认证：公开接口，`skipAuth: true`

请求：

```json
{
  "invite_code": "CP-411500-0001",
  "company_name": "晴天装饰",
  "admin_name": "王总",
  "admin_phone": "13900139000",
  "sms_code": "123456",
  "region_code": "411502",
  "region_name": "河南省信阳市浉河区",
  "address": "信阳市浉河区北京路 1 号",
  "location": {
    "title": "北京路 1 号",
    "poi_id": "optional-poi-id",
    "province": "河南省",
    "city": "信阳市",
    "district": "浉河区",
    "adcode": "411502",
    "latitude": 32.123,
    "longitude": 114.123
  },
  "source_id": "scene=partner-onboarding"
}
```

不要传：

- `tenant_id`
- `partner_id`
- `invite_code_id`
- `member_id`
- `auth_user_id`

成功响应核心字段：

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
  "tenant": {
    "id": "uuid",
    "name": "晴天装饰",
    "slug": "tenant-9000-abc123",
    "status": "active"
  },
  "initialization": {
    "template_code": "default_decoration_company",
    "template_version": "2026.05.10",
    "admin_employee_id": "uuid",
    "admin_role_id": "uuid"
  },
  "binding": {
    "id": "uuid",
    "tenant_id": "uuid",
    "partner_id": "uuid",
    "invite_code_id": "uuid",
    "source_type": "invite_code",
    "status": "active"
  },
  "created": true,
  "auth": null
}
```

当前第一版返回 `auth: null`。提交成功后，小程序可以提示“入驻成功”，
再用新管理员手机号走现有员工身份验证进入工作台。后续如果要提交成功
后免二次登录，可在该接口增加 `wechat_code`，后端返回
`tenant_employee` auth，这是下一小步。

## 后端行为

提交成功时后端会：

1. 校验 `invite_code` 是否存在、启用、未过期。
2. 校验城市合伙人是否启用。
3. 校验 `sms_code` 与 `admin_phone` 匹配且未过期。
4. 校验管理员手机号没有被现有员工占用。
5. 创建 `tenants` 记录，状态为 `active`。
6. 初始化默认部门、岗位、角色。
7. 创建系统管理员员工。
8. 创建 `tenant_partner_bindings`，归因到邀请码所属合伙人。
9. 递增邀请码 `submitted_count` 和 `approved_count`。
10. 业务成功后消费验证码，验证码不可复用。

## 旧接口定位

```http
POST /partner-onboarding/tenant-binding
```

这个接口保留，但只用于“已有装修公司员工登录后补绑定合伙人”。
新装企扫码入驻主流程不要再调用它。

## 错误码

| code | 场景 | 小程序建议 |
| --- | --- | --- |
| `INVALID_PHONE` | 手机号格式错误 | 提示检查手机号 |
| `SMS_CODE_REQUIRED` | 未传验证码 | 提示输入验证码 |
| `SMS_CODE_INVALID` | 验证码错误或过期 | 提示重新输入或重新获取 |
| `SMS_CODE_RATE_LIMITED` | 验证码发送过频 | 禁用按钮并展示倒计时 |
| `PARTNER_INVITE_CODE_UNAVAILABLE` | 邀请码不存在或停用 | 提示二维码失效 |
| `PARTNER_INVITE_CODE_EXPIRED` | 邀请码过期 | 提示联系合伙人重新获取 |
| `PARTNER_INVITE_PARTNER_UNAVAILABLE` | 合伙人不可绑定 | 提示该合伙人暂不可用 |
| `TENANT_ADMIN_PHONE_EXISTS` | 管理员手机号已是员工 | 引导使用已有员工登录或联系平台 |
| `TENANT_SLUG_EXISTS` | 租户标识冲突 | 提示稍后重试 |
| `TENANT_PARTNER_BINDING_EXISTS` | 租户已绑定其他合伙人 | 提示联系平台处理 |

## 小程序 Smoke Checklist

- [ ] 扫城市合伙人二维码能进入 `tenant-onboarding` 页面。
- [ ] 页面能展示合伙人名称、等级、区域和邀请码。
- [ ] 输入管理员手机号能成功获取验证码。
- [ ] 验证码错误时提交失败并展示 `SMS_CODE_INVALID`。
- [ ] 使用已存在员工手机号提交，返回 `TENANT_ADMIN_PHONE_EXISTS`。
- [ ] 使用失效邀请码进入，展示二维码不可用。
- [ ] 填写完整公司、管理员、定位地址后提交成功。
- [ ] 成功后超管侧租户列表能看到新租户。
- [ ] 超管侧城市合伙人页能看到该租户归因绑定。
- [ ] 合伙人邀请码的提交数和通过数增加。
