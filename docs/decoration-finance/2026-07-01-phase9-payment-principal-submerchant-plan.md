# Phase 9 支付主体与租户特约商户管理方案

> 2026-07-20 契约修正：服务商小程序场景不要求 `sub_appid`，付款人使用
> `sp_openid`；子商户小程序场景才使用 `sub_appid + sub_openid`。以后续文档
> [2026-07-20-service-provider-miniprogram-jsapi-contract-fix.md](./2026-07-20-service-provider-miniprogram-jsapi-contract-fix.md)
> 为准。

日期：2026-07-01

## 背景

当前微信支付接入不再是单一“平台统一商户”或“租户独立商户”二选一。实际业务有两类收付款主体：

1. 平台自己的收付款需求。
2. 每个装修公司租户自己的收付款需求。

同时，小程序是平台统一小程序；租户不是各自拥有独立小程序。微信支付接入必须解决“一个平台小程序服务多个租户收款主体”的问题。

## 核心结论

支付配置必须按“收款主体”建模，而不是只按“一个微信商户号”建模。

第一版采用双链路：

| 场景 | 收款主体 | 微信模式 | 商户参数 | 资金归属 |
| --- | --- | --- | --- | --- |
| 平台自收款 | 平台 | 直连商户 | `mchid + appid` | 平台商户号 |
| 租户项目收款 | 租户 | 服务商子商户 | `sp_mchid + sub_mchid + sp_appid`；子商户自有小程序场景再带 `sub_appid` | 租户特约商户 |

平台统一的服务商小程序可以服务多个租户子商户。每个租户的 `sub_mchid` 都需要完成服务商小程序支付授权或关联确认；只有改用子商户自有小程序时，才需要额外配置并绑定 `sub_appid`。

## 微信支付模式

### 平台直连收款

用于平台自己的业务收入，例如平台服务费、平台自营业务收款。

配置口径：

- `merchant_mode = direct_merchant`
- `merchant_id = 平台直连商户号`
- `app_id = 平台小程序 AppID`
- `sub_merchant_id = null`
- `sub_app_id = null`

下单方式：

- 普通 JSAPI/小程序支付。
- 使用平台直连商户证书和 APIv3 密钥签名。
- 用户 openid 是平台小程序 AppID 下的 openid。

### 租户服务商子商户收款

用于装修公司租户自己的项目收款。资金应进入租户特约商户账户，而不是平台账户。

配置口径：

- `merchant_mode = service_provider_sub_merchant`
- `merchant_id = 服务商商户号`
- `sub_merchant_id = 租户特约商户号`
- `app_id = 服务商统一小程序 AppID`，对应下单参数 `sp_appid`
- `sub_app_id = null`；仅子商户自有小程序模式填写对应 AppID

下单方式：

- 服务商 JSAPI/小程序支付。
- 使用服务商商户证书和 APIv3 密钥签名。
- 请求必须带 `sub_mchid`。
- 使用服务商统一小程序时，不传 `sub_appid`，付款人使用 `payer.sp_openid`。
- 使用子商户自有小程序时，传 `sub_appid`，付款人使用该小程序 AppID 下的 `payer.sub_openid`。

参考：

- 微信支付服务商小程序下单：`https://pay.wechatpay.cn/doc/v3/partner/4012523593`
- 微信支付服务商接入与特约商户入驻指引：`https://pay.wechatpay.cn/doc/v3/partner/4013080340`

## 租户如何申请 `sub_mchid`

租户必须先成为服务商下面的特约商户，才能拿到 `sub_mchid`。

### 第一阶段：人工进件

短期建议先走人工进件，避免第一版把微信进件 API、图片资质上传、法人/结算信息风控、驳回重提全部拉进实现范围。

流程：

1. 租户在 Admin 提交或补录进件资料。
2. 平台运营/财务在线下或微信支付商户平台发起特约商户申请。
3. 微信支付审核。
4. 租户超级管理员确认联系信息。
5. 租户完成账户验证。
6. 租户签约。
7. 平台回填 `sub_mchid`。
8. 平台确认该 `sub_mchid` 已完成服务商小程序支付授权或关联；子商户自有小程序模式再完成 `sub_appid` 绑定。
9. Admin 标记租户微信支付配置为 `pending` 或 `active`。

### 第二阶段：API 进件

后续再接微信支付服务商特约商户进件 API。

系统需要保存：

- 业务申请单号。
- 微信申请单号。
- 申请状态。
- 驳回原因。
- 超级管理员确认状态。
- 账户验证状态。
- 签约状态。
- `sub_mchid`。

API 进件不是 Phase 9 首批支付闭环的前置条件。

## 平台如何维护租户 `sub_mchid`

Admin 需要提供“租户微信支付进件/配置”管理能力。

### 列表

按租户分页展示：

- 租户名称。
- 支付模式。
- 服务商商户号。
- 子商户号。
- 平台小程序 AppID 绑定状态。
- 进件状态。
- 支付配置状态。
- 最近校验时间。
- 最近驳回原因。

### 详情

展示和维护：

- `merchant_mode`。
- `sp_mchid`。
- `sub_mchid`。
- `sp_appid`。
- `sub_appid`，仅子商户自有小程序模式填写。
- 商户简称。
- 结算账户摘要。
- 超级管理员摘要。
- 进件申请单号。
- 微信申请单号。
- 进件状态。
- AppID 绑定状态。
- 配置校验状态。

敏感信息只保存引用，不保存明文。

### 状态

建议进件状态：

```text
not_started
draft
submitted
reviewing
rejected
account_verifying
signing
opened
suspended
closed
```

建议 AppID 绑定状态：

```text
not_required
not_bound
pending_confirm
bound
rejected
```

建议配置状态继续使用已有：

```text
disabled
pending
active
suspended
```

## 数据模型落点

继续复用 `tenant_payment_configs` 作为租户支付配置 source of truth，不再新增重复的 `tenant_wechat_pay_configs`。

需要扩展：

- `principal_type`：`platform` / `tenant`
- `service_provider_merchant_id`
- `service_provider_app_id`
- `sub_merchant_id`
- `sub_app_id`
- `applyment_business_code`
- `applyment_id`
- `applyment_state`
- `applyment_state_message`
- `appid_binding_state`
- `appid_binding_message`
- `opened_at`
- `suspended_at`

说明：

- 平台直连配置可以放在平台级配置表或系统设置中，不应混入某个装修公司租户的 `tenant_payment_configs`。
- 租户自收款配置放在 `tenant_payment_configs`，`principal_type = tenant`。
- `merchant_id` 在服务商模式下表示服务商商户号；`sub_merchant_id` 表示租户子商户号。

## 后端下单决策

创建微信支付订单时，后端必须明确本笔订单的资金归属。

| 资金归属 | 使用配置 | 下单接口 |
| --- | --- | --- |
| 平台 | 平台直连配置 | 普通 JSAPI |
| 租户 | 租户服务商子商户配置 | 服务商 JSAPI |

小程序不参与商户号选择。

后端根据 `project_id` / `tenant_id` / 业务类型判断：

1. 项目应收款：默认租户收款。
2. 平台服务费：平台收款。
3. 后续如支持平台代收，应显式配置，不使用隐式 fallback。

## 小程序边界

小程序只负责：

1. 获取平台小程序下的 openid。
2. 调后端创建微信支付订单。
3. 使用后端返回的 `wx.requestPayment` 参数拉起支付。
4. 支付后刷新项目详情、应收计划和 workflow state。

小程序不负责：

- 判断使用平台商户还是租户子商户。
- 选择 `sub_mchid`。
- 生成 `out_trade_no`。
- 本地确认 payment。
- 本地推进 workflow。

## Admin 边界

Admin 负责：

- 管理平台直连配置。
- 管理租户服务商子商户配置。
- 记录租户 `sub_mchid` 申请和绑定状态。
- 展示配置校验结果。
- 展示支付订单和回调处理结果。

Admin 不负责：

- 明文保存 APIv3 密钥或商户私钥。
- 手工把微信支付订单改成已支付。
- 手工绕过 workflow 推进收款节点。

## 安全要求

1. 已在聊天、文档或截图中暴露过的 APIv3 密钥，上线前必须轮换。
2. 商户私钥、APIv3 key、回调解密 key 只能进入密钥管理系统或服务器安全环境变量。
3. 仓库、Admin API、日志、错误消息不得输出明文密钥。
4. Admin 只显示证书序列号脱敏值、密钥引用和配置状态。
5. 支付回调必须做签名校验、资源解密、幂等处理和审计记录。

## 分阶段实施

### Phase 9.1：支付主体和进件模型

- 落本文档。
- 扩展数据模型。
- Admin 展示租户 `sub_mchid` 和进件状态。

### Phase 9.2：支付网关双模式

- 直连 JSAPI adapter。
- 服务商 JSAPI adapter。
- 根据订单资金归属选择 adapter。
- 返回统一 `payment_request` 给小程序。

### Phase 9.3：支付回调闭环

- `/pay/wechat/callback`。
- 验签、解密、通知落库。
- 更新订单状态。
- 创建 confirmed payment。
- 应收核销。
- 台账入账。
- workflow 推进。

### Phase 9.4：Admin 可见性

- 支付订单详情。
- 回调通知列表。
- 租户配置校验状态。
- 进件/AppID 绑定状态。

### Phase 9.5：小程序联调

- 小程序只消费后端支付 action。
- 调后端创建订单。
- 拉起 `wx.requestPayment`。
- 支付后刷新 workflow 和应收状态。

## 当前信息是否足够

够进入 Phase 9.1 和 Phase 9.2 的系统设计与基础实现。

还不够让租户直接上线收款，因为每个租户仍缺：

- `sub_mchid`
- 服务商小程序支付授权或关联确认；子商户自有小程序模式还需 `sub_appid` 绑定确认
- 租户结算账户审核和签约状态
- 生产密钥轮换后的密钥引用
