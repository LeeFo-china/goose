# Phase 9 Task 5 支付就绪核查与预下单恢复加固

日期：2026-07-20

## 范围

本轮完成真实租户服务商支付前的两项工作：

1. 对平台支付配置、目标租户开通申请和回调地址执行只读就绪核查。
2. 修复项目微信支付订单在付款人 openid 缺失或预下单失败后的不可恢复问题。

本轮没有修改远端业务数据、没有执行 migration，也没有创建真实微信支付订单。

## 根因与修复

### openid 校验过晚

旧实现允许 `payer_openid` 缺失。订单先以 `pending` 状态写入数据库，随后才由微信预下单请求构造器报错，导致同一 workflow task 被 pending 唯一索引占用。

修复后：

- `POST /finance/wechat-pay/orders` 将 `payer_openid` 设为必填字符串。
- schema 会 trim openid，并拒绝空字符串和超过 128 字符的值。
- service 在任何订单查询或写入前再次执行领域校验，防止绕过 HTTP schema 的内部调用写入无效订单。

### pending 订单无法恢复

旧实现只要查到同一 workflow task 的 pending 订单，就返回 `idempotent=true` 和 `payment_request=null`。预下单失败后的重试因此永远无法再次拉起微信支付。

修复后的处理规则：

| pending 订单状态 | 后端行为 |
| --- | --- |
| 没有 `prepay_id` | 使用原 `out_trade_no` 重试微信预下单，成功后回填 `prepay_id` 并返回 `payment_request` |
| 已有 `prepay_id` | 不重复调用微信预下单，仅使用现有 `prepay_id` 重新生成小程序支付签名 |
| 请求金额、项目、应收计划或 openid 与原订单不同 | 返回 `409 WECHAT_PAY_ORDER_IDEMPOTENCY_CONFLICT` |
| 原订单绑定的支付配置不是当前活动配置 | 返回 `409 WECHAT_PAY_ORDER_CONFIG_MISMATCH` |

重试不会生成新的订单或新的 `out_trade_no`，也不会改变资金归属。

### 配置就绪校验不完整

订单写入前现在统一检查：

- 配置状态为 `active`。
- `merchant_id`、`app_id`、密钥引用、证书序列号和回调地址均已配置。
- `enabled_channels` 包含 `project_payment`。
- 服务商子商户模式具有 `sub_mchid`。
- 服务商子商户进件状态为 `opened`。
- AppID 授权或绑定状态为 `bound`。

新订单在写入前会先加载密钥包。密钥引用无效、密钥包缺失或无法解密时不会产生 pending 订单。

## API 与小程序契约

请求保持使用原路由：

```http
POST /finance/wechat-pay/orders
```

`payer_openid` 现在是明确必填字段：

```json
{
  "project_id": "<project-id>",
  "receivable_plan_id": "<receivable-plan-id>",
  "workflow_task_id": "<pending-payment-task-id>",
  "amount": 0.01,
  "payer_openid": "<current-mini-program-openid>"
}
```

小程序遇到网络超时可以使用完全相同的字段重试。后端会返回可用的 `payment_request`；小程序不得更换金额、openid 或应收计划来复用同一 workflow task。

小程序仍然只消费后端 `payment_request`，不判断 `sp_openid/sub_openid`，不选择商户配置，也不根据 `requestPayment:ok` 本地确认到账。

## 远端只读就绪核查

核查对象：固始晴天装饰工程有限公司。

### 租户开通申请

最新申请当前状态：

- 申请状态：`submitted`。
- 微信进件状态：`submitted`。
- AppID 状态：`not_bound`。
- 尚无新的 `sub_mchid`。
- 尚未关联活动支付配置。

上一条申请已经关闭。旧申请曾关联支付配置，但不能作为当前真实支付开通依据。

### 租户支付配置

当前数据库中的旧配置：

- 模式：`service_provider_sub_merchant`。
- 配置状态：`disabled`。
- 校验状态：`unchecked`。
- 使用开发环境回调地址。
- `app_id` 与 `sub_app_id` 相同，属于本次契约修正前的旧配置方式。

该配置不能直接用于服务商统一小程序真实支付，也不应通过数据库手工改为 active。

### 平台支付配置

- `platform_direct_recharge` 已配置并处于 `active`，但校验状态仍为 `unchecked`。
- 当前没有 `tenant_service_provider` 平台配置记录。

租户服务商支付目前仍依赖租户配置中人工填写的服务商资料和密钥引用。后续应让开通激活流程从平台 `tenant_service_provider` 配置读取服务商公共参数，减少租户级重复填写和配置漂移。

### 回调可达性

- 开发回调地址 TLS 校验通过，匿名空 POST 返回 400。
- 生产回调地址 TLS 校验通过，匿名空 POST 返回 400。

400 是缺少微信签名头和合法通知体时的预期拒绝结果，说明路由可以从公网到达且没有要求员工登录 token。

### 历史 pending 订单

目标租户当前：

- pending 微信支付订单：0。
- pending 且缺少 `prepay_id`：0。
- pending 且缺少 `payer_openid`：0。

因此不存在需要先关闭或迁移的历史孤儿订单。

## 当前结论

代码侧已具备安全重试能力，但目标租户暂不满足真实小额支付条件。必须先完成：

1. 平台审核最新开通申请。
2. 在微信支付侧完成真实特约商户进件并回填新的 `sub_mchid`。
3. 确认服务商小程序支付授权或关联状态。
4. 服务商统一小程序模式保持 `sub_app_id=null`。
5. 通过平台 Admin 激活租户配置，不能手工修改数据库状态。
6. 完成密钥、证书和回调验证并记录证据；当前 `validation_status=unchecked`，不能把配置页状态当作已验证。
7. 再准备 pending 收款 workflow task，交由小程序执行一分钱支付 smoke。

## 数据库安全旁路发现

只读查询期间 Supabase CLI 报告以下两张表尚未启用 RLS：

- `public.platform_partner_member_rebind_requests`
- `public.tenant_credit_refund_requests`

这是独立的高优先级安全事项。本轮没有自动执行以下 SQL：

```sql
ALTER TABLE public.platform_partner_member_rebind_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credit_refund_requests ENABLE ROW LEVEL SECURITY;
```

不能只启用 RLS 而不设计 policy，否则会阻断现有访问。后续应单独审计两张表的访问角色，通过 migration 同时落 RLS、policy、权限测试和回滚方案。

## 验收证据

- openid schema 和 service 双重校验测试。
- pending 无 `prepay_id` 的预下单恢复测试。
- 已有 `prepay_id` 的本地重签测试。
- 金额/openid 等幂等冲突测试。
- 支付配置切换阻断测试。
- 服务商小程序 `sub_app_id=null` 就绪测试。
- 远端查询全程只返回状态和布尔字段，没有读取或输出商户号、证书、私钥或密钥正文。
