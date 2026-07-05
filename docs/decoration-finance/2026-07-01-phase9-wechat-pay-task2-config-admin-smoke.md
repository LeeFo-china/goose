# Phase 9 微信支付 Task 2 配置 API 与 Admin 配置页 Smoke

日期：2026-07-01

分支：`feature/phase9-wechat-pay-baseline`

## 范围

本轮完成微信支付租户配置的后端 API 与 Admin 配置入口。

已完成：

1. 后端配置读取：
   - `GET /finance/wechat-pay/config`
   - 需要租户上下文。
   - 需要 `wechat_pay.config.read` 或 `wechat_pay.config.manage`。

2. 后端配置保存：
   - `PUT /finance/wechat-pay/config`
   - 需要租户上下文。
   - 需要 `wechat_pay.config.manage`。
   - 保存后 `validation_status` 重置为 `unchecked`，`last_validated_at` 重置为 `null`。
   - 写入 `created_by_employee_id` / `updated_by_employee_id`。

3. Admin 页面：
   - 路径：`/finance/wechat-pay`
   - 财务 tabs 增加“微信支付”。
   - 租户侧边栏财务分组增加“微信支付”入口。
   - 页面展示商户模式、商户名称、商户号、子商户号、AppID、子商户 AppID、回调地址、密钥引用、结算账户摘要、配置状态和校验状态。

## 数据安全边界

本轮不接收、不保存微信支付明文密钥：

- 不接收 `api_v3_key`。
- 不接收商户私钥明文。
- 不接收证书内容明文。
- schema 使用 `.strict()`，额外明文字段会被拒绝。

允许保存：

- 商户展示字段。
- 商户号/AppID 等非密钥配置。
- 证书序列号，Admin 读取时只返回 `serial_no_masked`。
- `encrypted_config_ref`，用于指向外部密钥管理系统中的密钥材料。

## API 契约

### GET /finance/wechat-pay/config

返回：

```json
{
  "configured": true,
  "can_manage": true,
  "config": {
    "id": "config-id",
    "merchant_mode": "direct_merchant",
    "merchant_name": "固始晴天装饰微信商户",
    "merchant_id": "1900000001",
    "sub_merchant_id": null,
    "app_id": "wx-app",
    "sub_app_id": null,
    "status": "pending",
    "enabled_channels": ["project_payment"],
    "settlement_account_summary": "招商银行 尾号 1234",
    "encrypted_config_ref": "secret://tenant/wechat-pay",
    "has_encrypted_config_ref": true,
    "serial_no_masked": "12345678****cdef",
    "notify_url": "https://api.example.com/wechat-pay/notify",
    "validation_status": "unchecked",
    "last_validated_at": null
  }
}
```

不会返回：

```text
serial_no
api_v3_key
private_key
certificate
```

### PUT /finance/wechat-pay/config

请求示例：

```json
{
  "merchant_mode": "direct_merchant",
  "merchant_name": "固始晴天装饰微信商户",
  "merchant_id": "1900000001",
  "app_id": "wx-app",
  "status": "pending",
  "enabled_channels": ["project_payment"],
  "settlement_account_summary": "招商银行 尾号 1234",
  "encrypted_config_ref": "secret://tenant/wechat-pay",
  "serial_no": "1234567890abcdef",
  "notify_url": "https://api.example.com/wechat-pay/notify"
}
```

字段说明：

- `merchant_mode`：`direct_merchant` / `service_provider_sub_merchant`。
- `status`：`disabled` / `pending` / `active` / `suspended`。
- `enabled_channels`：当前只开放 `project_payment`。
- `serial_no`：未传时保留原值；传空字符串时清空。
- `encrypted_config_ref`：未传时保留原值；传空字符串时清空。

保存后的固定行为：

- `provider = wechat_pay`
- `validation_status = unchecked`
- `last_validated_at = null`

## Admin 对接

Admin 入口：

- 财务 tabs：`/finance/wechat-pay`
- 租户侧边栏财务分组：微信支付
- 入口权限：`wechat_pay.config.read`
- 保存按钮权限：后端仍以 `wechat_pay.config.manage` 为准；前端根据 `can_manage` 禁用只读账号。

页面行为：

- 只读账号可以查看配置和校验状态。
- 管理账号可以保存配置。
- 证书序列号输入框留空表示不变。
- 保存成功后页面刷新，并显示待校验状态。

## 小程序边界

本轮小程序无必改。

原因：

- 本轮只增加租户微信支付配置后台能力。
- 小程序支付动作仍未开放。
- 后续 Task 3/4 创建微信支付订单和回调闭环时，小程序仍应只消费 workflow v2 的 `actions`，不本地推导支付规则。

## 未纳入本轮

以下能力留到后续任务：

1. 真实微信支付证书/API v3 密钥校验。
2. 拉起微信支付订单。
3. 微信支付回调验签和幂等处理。
4. 支付成功后自动确认 payment、写 ledger、推进 workflow。
5. 对账单下载和异常差异处理。

## 验证记录

后端：

```bash
cd apps/api && bun test src/schema/wechat-pay-configs.test.ts src/services/wechat-pay-configs.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/api run check:file-size
```

结果：

- 微信支付配置 schema/service、migration contract、database type contract 共 9 条测试通过。
- API typecheck 通过。
- API file-size check 通过。

Admin：

```bash
cd apps/admin && bun test components/finance/finance-module-tabs.test.ts components/finance/finance-wechat-pay-page-layout.test.ts
pnpm --dir apps/admin check
```

结果：

- Admin 财务 tabs 与微信支付页面布局测试共 6 条通过。
- Admin file-size check 通过。
- Admin typecheck 通过。

全局：

```bash
git diff --check
```

结果：通过。
