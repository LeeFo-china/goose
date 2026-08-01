# 平台数字权益虚拟支付迁移设计

## 1. 文档状态

- 状态：设计已确认，待实施计划
- 日期：2026-07-31
- 首期商品：年度品牌权益
- 商品编码：custom_support_branding_annual
- 权益编码：custom_support_branding
- 购买方式：一次性年购，不自动续费
- 用户售价：Android、鸿蒙、Windows、iOS 保持一致
- 迁移方案：新建虚拟支付订单体系，旧普通支付订单只读保留

本文是 Gooes 平台数字权益从独立商户号普通支付迁移到微信小程序
虚拟支付的技术规格。它同时明确：现有独立商户号、APIv3 普通支付
网关、回调、退款和对账能力完整保留，后续用于平台自营实物商城及
其他符合普通支付规则的交易。

## 2. 背景与现状

### 2.1 当前年度品牌权益

当前年度品牌权益已经具备完整的普通支付闭环：

- platform_addon_products 保存固定年度商品及价格、购买说明和退款
  说明。
- tenant_addon_orders 保存租户订单、独立商户号支付快照、预支付
  标识、微信交易号和权益事件关系。
- TenantBrandingAddonOrderService 负责租户鉴权、幂等创建、待支付
  订单复用和商品快照。
- TenantBrandingAddonOrderPayment 强制使用
  platform_direct_recharge、direct_merchant 和 tenant_recharge
  通道，通过 APIv3 小程序支付创建预支付请求。
- 微信支付通知和主动查单最终调用原子确认逻辑，使订单支付成功与
  tenant_entitlements、tenant_entitlement_events 的权益履约保持
  一致。

当前 tenant_addon_orders 的不可变约束、非空字段和状态约束均与
独立商户号普通支付深度绑定，例如 payment_config_id、payment_mchid、
payment_appid、prepay_id 和 channel=wechat_pay。直接把该表改造成
虚拟支付表会破坏历史订单不变量，并扩大支付回归面。

现有微信登录通过 jscode2session 已经可以取得 session_key，但当前
登录流程只消费 openid 和 unionid，没有持久化 session_key。虚拟支付
用户态签名需要当前微信会话的 session_key，因此安全保存、轮换和失效
处理是本次迁移的前置能力，不能等到支付接口实现时临时绕过。

### 2.2 迁移动因

年度品牌权益属于付款后解锁平台功能的数字权益。微信小程序官方文档
将解锁功能、订阅内容和付费功能列为虚拟商品，购买和支付需要接入
小程序虚拟支付。

虚拟支付会开通独立的虚拟支付商户账户，使用 offerId、AppKey、
虚拟商品、虚拟支付订单、消息推送、订单查询、退款和账单体系。它与
现有 APIv3 独立商户号普通支付不是同一个资金和接口域。

因此本次迁移不能只替换前端支付 API，也不能复用普通支付回调解析；
需要新建隔离的虚拟支付订单域，同时复用现有商品和权益履约事实。

## 3. 已确认决策

1. 首期只迁移年度品牌权益，底层边界允许以后增加其他数字权益。
2. 年度权益仍为用户主动购买的一次性年购。
3. 当前小程序不具备自动续费订阅准入条件，本期不申请、不模拟、
   不展示自动续费。
4. 各端用户售价一致，平台手续费差异作为内部渠道成本核算，不通过
   客户端平台加价。
5. 迁移切换时立即停止旧普通支付品牌权益下单，并关闭旧渠道待支付
   订单。
6. 虚拟支付不可用时暂停品牌权益销售，不回退独立商户号。
7. 首期不提供用户自助退款。超管人工审核后按平台官方流程处理，
   退款最终成功后再补偿权益。
8. 现有独立商户号普通支付能力完整保留，后续承接平台自营实物商城
   及其他符合普通支付规则的交易。

## 4. 目标与非目标

### 4.1 目标

- 把年度品牌权益的新购买切换为微信小程序虚拟支付道具直购。
- 让 Android、鸿蒙、Windows 和 iOS 使用同一业务商品、售价和权益
  内容。
- 建立通知与主动查单双路径，保证前端成功回调丢失时仍能履约。
- 保持支付确认、权益开通或顺延、权益事件关联的幂等和并发安全。
- 建立人工退款、退款状态同步和权益补偿闭环。
- 在租户侧和平台侧统一展示新旧订单，同时明确订单支付来源。
- 保留并隔离独立商户号普通支付，为实物商城保留完整能力。
- 支持可审计的灰度、切换、暂停和前向修复。

### 4.2 非目标

- 不实现自动续费、订阅签约、周期扣款和解约。
- 不在首期迁移会员、内容包或其他尚未存在的数字商品。
- 不重写 tenant_entitlements 的整体权限和品牌生效模型。
- 不删除或重写历史普通支付订单。
- 不在本期建设平台自营实物商城。
- 不为租户或供应商实物交易预先决定代收、子商户、分账或收付通
  方案。
- 不修改 orange 仓库；小程序侧变更由小程序团队按交接契约实施。

## 5. 方案比较

### 5.1 方案一：新建虚拟支付订单域，旧订单只读保留（采用）

- 商品和权益履约复用。
- 虚拟支付订单、通知和退款独立建模。
- 旧普通支付品牌权益订单只读保留。
- 管理端通过统一查询层展示新旧数据。

优点是资金通道、密钥、回调和状态机边界清楚；不会放松历史订单
约束；切换失败时可以暂停虚拟支付而不破坏普通支付。

### 5.2 方案二：扩展 tenant_addon_orders

需要把多个普通支付非空字段改为可空、放宽 channel 和状态约束，并让
同一套服务同时理解 APIv3 与虚拟支付语义。表数量较少，但历史不变量、
回调匹配和退款语义容易混淆，因此不采用。

### 5.3 方案三：重建通用数字商品与支付中心

将业务订单、支付意图、平台交易和权益履约完全拆分，长期扩展性最好，
但首期只有一个真实商品，范围和回归成本明显过大，因此不采用。

## 6. 目标架构

    平台商品
       |
       +-- digital_entitlement
       |      |
       |      +-- 微信虚拟支付域
       |             +-- 虚拟商品映射
       |             +-- 虚拟支付订单
       |             +-- 发货通知与主动查单
       |             +-- 人工退款
       |             +-- 权益履约
       |
       +-- physical_goods / ordinary_payment
              |
              +-- 独立商户号普通支付域
                     +-- APIv3 小程序支付
                     +-- 普通支付通知、退款与对账
                     +-- 后续实物发货与确认收货

### 6.1 业务商品层

platform_addon_products 继续是年度品牌权益的业务商品事实，负责：

- 商品编码和权益编码。
- 商品名称。
- 统一用户售价。
- 一次性一年期。
- 购买说明和退款政策。
- 上下架及乐观锁版本。

新增 purchase_mode：

- direct_legacy：迁移前旧普通支付模式。
- maintenance：暂停所有新购买。
- wechat_virtual：只允许虚拟支付。

状态只允许按以下方向切换：

    direct_legacy -> maintenance -> wechat_virtual
    wechat_virtual -> maintenance -> wechat_virtual

不允许从 wechat_virtual 回到 direct_legacy。

### 6.2 支付路由层

支付路由由后端根据商品性质和销售主体决定，客户端不得指定真实资金
通道：

| 商品性质 | 销售主体 | 支付路由 |
| --- | --- | --- |
| 年度品牌权益 | 平台 | wechat_virtual |
| 平台自营实物商品 | 平台 | direct_merchant_api_v3 |
| 其他符合普通支付规则的交易 | 平台 | direct_merchant_api_v3 |
| 租户或供应商实物商品 | 租户或供应商 | 后续单独评估 |

客户端上报的平台信息只作为能力声明和诊断上下文。最终支付渠道以微信
返回的交易事实为准。

### 6.3 权益履约层

tenant_entitlements 和 tenant_entitlement_events 继续是唯一权益事实。
新虚拟支付域不得创建第二套“会员有效期”或“虚拟余额”作为替代事实。

年度品牌权益采用虚拟支付“道具直购”，数量固定为 1。支付确认后将
道具发货解释为一次年度权益开通或顺延。

## 7. 官方能力约束

### 7.1 虚拟商品和账户

- 解锁功能、订阅内容和付费功能属于虚拟商品，需要接入小程序虚拟
  支付。
- 开通虚拟支付会创建新的虚拟支付商户号。
- 商户后台提供 offerId、AppKey、商品、订单、退款、账单和资金管理。
- Android、鸿蒙、Windows 端基础库需要满足官方最低版本要求。
- iOS 端需满足官方 iOS 和微信客户端版本要求，并配置小程序简称。

具体最低版本、费率和结算规则可能由平台调整。上线前以微信后台和
官方文档当日信息为准，不把费率写死在业务代码。

### 7.2 多端商品与定价

- 虚拟支付商品在 Android 与 iOS 双端互通。
- wx.requestVirtualPayment 会根据设备自动路由到微信支付或 Apple
  支付。
- iOS 普通虚拟支付最低支付金额为 1 元，只支持符合官方条件的大陆
  App Store 账户。
- 为保持各端同价，年度品牌权益启用虚拟支付时 amount_fen 必须不低于
  100；原有最低 1 分的商品校验不能继续用于跨端正式商品。
- Android 或鸿蒙沙箱可用于联调；iOS 不支持沙箱，只能通过受控的
  现网小额真实交易验收。

### 7.3 支付结果与发货

- 小程序通过 wx.requestVirtualPayment 发起虚拟支付。
- 客户端 success 回调可能丢失，不能作为权益履约事实。
- 官方要求发货推送或轮询查询至少实现一种；本项目同时实现
  xpay_goods_deliver_notify 和 xpay/query_order。
- 收到支付成功事实后，系统先完成幂等权益履约，再返回成功发货响应。
- 通知处理失败时允许微信重试；主动查单负责补偿未收到或未处理成功的
  通知。

### 7.4 退款

- Android、鸿蒙、Windows 的退款使用 xpay/refund_order 启动退款
  任务，启动成功不等于退款最终成功；必须通过 xpay/query_order 或
  xpay_refund_notify 收敛最终状态。
- iOS 不支持开发者主动向用户退款。用户从 App Store 申请，平台可能
  发送退款问询，最终由 Apple 决定。
- iOS 退款成功后同样通过 xpay_refund_notify 通知。
- 平台退款政策、用户说明和后台操作必须区分“已提交”和“最终成功”。

## 8. 数据模型

所有表、约束、索引、RLS、RPC 和初始化状态变更必须通过
supabase/migrations 下的前向 migration 完成。

### 8.1 platform_virtual_payment_products

用途：把业务商品映射到微信虚拟支付商品和环境配置。

关键字段：

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| addon_product_id | 关联 platform_addon_products |
| provider | 固定 wechat_virtual |
| environment | sandbox 或 production |
| app_id | 小程序 AppID 快照 |
| virtual_merchant_id | 虚拟支付商户号，仅作配置审计 |
| offer_id | 虚拟支付 offerId |
| provider_product_id | 微信虚拟商品 ProductId |
| goods_quantity | 首期固定 1 |
| expected_amount_fen | 与业务商品价格一致 |
| encrypted_secret_ref | AppKey 等机密的密文引用 |
| secret_revision | 密钥版本 |
| status | draft、active、disabled |
| validation_status | pending、valid、invalid |
| validated_at | 最近校验时间 |
| version | 乐观锁版本 |

约束：

- 同一业务商品、同一环境只能有一个有效映射。
- offer_id、provider_product_id、environment 组合唯一。
- production 映射启用时 expected_amount_fen 必须等于业务商品
  amount_fen。
- production 商品跨端销售时金额不得低于 100 分。
- 明文 AppKey 不进入数据库业务列、响应、日志或审计摘要。

### 8.2 tenant_virtual_addon_orders

用途：保存虚拟支付业务订单和支付、履约、退款的当前状态。

关键字段：

| 字段 | 说明 |
| --- | --- |
| id | 主键 |
| tenant_id | 租户 |
| order_no | 平台业务订单号 |
| out_trade_no | 传给虚拟支付的业务单号 |
| idempotency_key | 租户范围幂等键 |
| product_id / product_code | 业务商品快照 |
| entitlement_code | 权益编码快照 |
| product_name | 商品名称快照 |
| amount_fen | 用户售价快照 |
| term_years | 首期固定 1 |
| purchase_notes / refund_policy | 购买时文案快照 |
| environment | sandbox 或 production |
| offer_id / provider_product_id | 虚拟支付配置快照 |
| requested_platform | 客户端声明，仅用于诊断 |
| settlement_channel | 微信确认的渠道事实 |
| payer_openid | 与认证会话绑定 |
| provider_order_no | 微信虚拟支付订单标识 |
| transaction_id | 微信支付交易标识 |
| payment_status | 支付状态 |
| fulfillment_status | 履约状态 |
| refund_status | 退款汇总状态 |
| paid_amount_fen / paid_at | 实际支付事实 |
| entitlement_event_id | 唯一购买权益事件 |
| config_version / secret_revision | 下单配置快照 |
| created_by | 购买人 |
| created_at / updated_at | 审计时间 |

支付状态：

    pending -> succeeded
    pending -> closed
    pending -> failed

履约状态：

    pending -> granted
    pending -> grant_failed -> granted

退款状态：

    none -> reviewing -> submitted -> succeeded
    none -> reviewing -> external_required -> succeeded
    reviewing -> rejected
    submitted -> failed
    external_required -> failed

核心约束：

- tenant_id 与 idempotency_key 唯一。
- order_no、out_trade_no 和非空 provider_order_no 唯一。
- 同一租户、同一商品最多一个 pending 支付订单。
- succeeded 必须具有支付金额和支付时间。
- granted 必须关联唯一 entitlement_event_id。
- refund_status=succeeded 必须具有成功退款记录和补偿权益事件。
- 商品、价格、配置、用户和环境快照创建后不可修改。

### 8.3 wechat_virtual_payment_notifications

用途：保存虚拟支付消息的归一化处理记录。

关键字段：

- 事件唯一键、Event 类型、环境和接收时间。
- order_id、out_trade_no、ProductId、OpenId 的匹配结果。
- 认证或校验方式及结果。
- 归一化后的必要载荷和原始载荷摘要哈希。
- processing、processed、failed 状态。
- 重试次数、最后错误码、最后错误摘要和处理完成时间。
- request_id 和审计关联。

消息正文只保存完成查单、履约和退款审计所需字段。完整 OpenID、密钥、
签名和不必要的原始敏感报文不得出现在应用日志。

事件唯一键需要由事件类型和微信侧稳定标识组合生成，不能只依赖消息
到达时间。数据库唯一约束和处理 RPC 共同保证重复推送只履约一次。

### 8.4 tenant_virtual_addon_refunds

用途：保存超管人工退款审核和平台退款结果。

关键字段：

- refund_no、order_id、tenant_id。
- 首期固定全额退款金额。
- 申请原因、证据摘要、申请人和审核人。
- platform_mode：merchant_initiated 或 apple_external。
- 状态：reviewing、submitted、external_required、succeeded、failed、
  rejected。
- 微信退款标识、Apple 票据摘要或平台订单关联。
- 原购买权益事件和补偿权益事件。
- 提交、成功、失败、拒绝时间及最后错误。
- 乐观锁版本和审计记录。

一个成功购买订单首期只允许一笔成功全额退款。重复提交必须返回原退款
记录，不能生成第二次退款。

### 8.5 权益补偿事件

扩展 tenant_entitlement_events，增加 refunded 补偿事件和
reverses_event_id：

- reverses_event_id 唯一指向原 purchase 权益事件。
- source_type 为 refund，source_id 指向退款记录。
- 在租户和权益编码范围获取事务锁。
- 按原购买事件记录的 term_years 扣减一次期限。
- 若扣减后到期时间不晚于当前时间，active 状态转为 expired。
- 若当前为 suspended 或 revoked，保留风控状态，只调整期限事实。
- 若原事件不存在、已被补偿或当前期限无法与事件链一致，拒绝自动
  修改并进入人工异常队列。

退款成功记录和权益补偿必须可分别重试。不得因权益补偿暂时失败而把
支付平台的退款成功改回失败。

### 8.6 wechat_mini_session_credentials

用途：安全保存虚拟支付用户态签名所需的当前微信小程序会话凭据。

关键字段：

- oauth_identity_id，关联当前 active 的 wechat_mini OAuth 身份。
- openid_hash，只用于索引和审计关联。
- encrypted_session_key，使用项目受控密钥加密后的 session_key。
- encryption_key_version 和 session_revision。
- status：active、invalid、revoked。
- obtained_at、last_used_at、invalidated_at。

规则：

- jscode2session 登录成功后，在返回登录响应前写入或轮换凭据。
- 明文 session_key 不写 JWT、不返回客户端、不进入日志和审计摘要。
- 同一 active OAuth 身份只允许一个 active 凭据。
- OAuth 身份解绑或禁用时同步撤销凭据。
- 不猜测固定 TTL；微信拒绝用户态签名、凭据缺失或凭据已失效时，
  支付请求返回稳定的重新登录错误，客户端重新执行 wx.login。
- 旧登录会话没有凭据时不能生成虚拟支付签名，也不能回退普通支付。

该表只允许受控后端角色访问，并通过 migration 配置 RLS、唯一约束和
必要索引。

### 8.7 统一查询

新增只读 RPC 或 UNION ALL 查询层，统一输出 legacy_direct 与
wechat_virtual：

- 租户列表和平台列表默认 page=1、pageSize=20，最大 100。
- 列表只返回订单、租户、支付渠道和三个状态摘要。
- 详情根据 payment_channel 路由到对应审计查询。
- 列表一次查询完成租户摘要和退款摘要，禁止 N+1。
- 新表按 tenant_id、状态、payment_channel、created_at 和 id 建立
  组合索引。
- 关键词索引通过 migration 管理，并在 dev 使用真实数据执行
  EXPLAIN ANALYZE。

## 9. 服务边界

### 9.1 Controller

- 只读取请求、认证会话、客户端能力和分页参数。
- 使用 Zod 校验。
- 调用虚拟支付 service。
- 使用 ResponseHandler.success 返回。
- 所有错误通过 error-factory.ts 包装。

### 9.2 Service

拆分为以下单一职责服务：

- BrandingVirtualProductService：商品映射、配置校验和能力输出。
- WechatMiniSessionCredentialService：微信登录 session_key 加密、
  轮换、读取和撤销。
- TenantVirtualAddonOrderService：权限、幂等、订单状态编排。
- WechatVirtualPaymentGateway：签名参数、查单、发货确认和退款调用。
- VirtualPaymentNotificationService：消息归一化、匹配和幂等处理。
- BrandingVirtualPaymentConfirmation：支付确认和权益履约编排。
- BrandingVirtualRefundService：人工审核、平台退款和权益补偿。
- BrandingVirtualReconciliationService：未决订单、失败履约和退款
  补偿。
- BrandingEntitlementOrderQueryService：新旧订单统一分页查询。

Service 不直接拼写 Supabase 查询，不把虚拟支付字段塞进现有普通支付
gateway。

### 9.3 Repository / Gateway

- Repository 只访问 Supabase、RPC 和视图。
- Gateway 只访问微信虚拟支付接口。
- 普通支付 WechatPayGateway 保持不变。
- 使用第三方接口和类型前先核对项目安装版本、微信官方字段和基础库
  定义，不猜测导出、字段或事件名。

## 10. 订单与履约流程

### 10.1 商品读取

GET /tenant/branding/entitlement-product 返回：

- 业务商品和当前权益。
- purchase_mode。
- payment_channel=wechat_virtual。
- virtual_payment_available。
- unavailable_reason。
- minimum_amount_fen=100。
- 客户端应使用的虚拟支付能力标识。

处于 maintenance、映射未启用、密钥无效或价格不一致时，商品可以
展示，但购买按钮不可用。

### 10.2 创建订单

新增：

    POST /tenant/branding/virtual-payment/orders

流程：

1. 校验租户管理员、购买权限和认证 OpenID。
2. 校验 purchase_mode=wechat_virtual。
3. 校验商品、虚拟商品映射、金额、环境和密钥版本。
4. 查询租户幂等键和同商品 pending 订单。
5. 创建不可变商品及支付配置快照。
6. 返回虚拟支付订单和支付请求准备状态。

客户端不能提交金额、offerId、ProductId 或真实支付渠道。

### 10.3 获取支付请求

新增：

    POST /tenant/branding/virtual-payment/orders/:id/payment-request

后端根据订单快照和认证会话生成 wx.requestVirtualPayment 所需的
signData、paySig、signature 等参数。签名在服务端完成，AppKey 和
session_key 不返回客户端。

若当前 OAuth 身份没有有效 session_key，返回：

- HTTP 409。
- code=BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED。
- 客户端重新执行 wx.login，完成登录后使用原订单再次请求支付参数。

重新登录只轮换会话凭据，不创建第二笔业务订单。

接口返回带类型的 payment_request：

    kind: wechat_virtual
    environment: sandbox | production
    request_payload: 仅包含 wx.requestVirtualPayment 允许的字段

小程序只把 request_payload 传给微信基础库。客户端 success 后进入
“支付结果确认中”，轮询订单详情；不得自行把订单标为成功。

### 10.4 发货通知

事件 xpay_goods_deliver_notify 处理顺序：

1. 完成微信消息入口认证和事件解析。
2. 以事件稳定标识幂等落库。
3. 按 OutTradeNo 查询本地订单并锁定。
4. 校验环境、OpenId、ProductId、Quantity、OrigPrice、ActualPrice、
   交易标识和订单状态。
5. 原子写入支付事实、购买权益事件和 tenant_entitlements。
6. 标记 fulfillment_status=granted。
7. 返回 ErrCode=0。

上下文不匹配时不得开通权益，记录稳定业务错误并告警。内部暂时失败时
返回可重试响应，由微信重推和主动查单共同补偿。

### 10.5 主动查单

使用 xpay/query_order：

- 客户端支付返回后短轮询。
- 消息推送超时或失败时补偿。
- 定时扫描 pending 和 grant_failed 订单。
- 切换、发布和故障恢复时主动核对。

查单返回支付成功时走与通知完全相同的
BrandingVirtualPaymentConfirmation，不复制履约实现。

### 10.6 一年期计算

迁移不改变现有“一个日历年”的业务语义：

- 首次购买或权益已过期：从支付确认时间起增加一个日历年。
- 权益未到期：从当前 expires_at 顺延一个日历年。
- 同一订单只能产生一个购买权益事件。
- suspend、resume、revoke 的既有风控语义保持不变。

## 11. 退款流程

### 11.1 管理端审核

新增：

    POST /platform/branding/virtual-payment/refunds
    GET  /platform/branding/virtual-payment/refunds
    GET  /platform/branding/virtual-payment/refunds/:id

创建退款需要平台超管权限、原订单、全额金额、原因、证据摘要和幂等键。
首期不提供租户侧自助退款入口。

### 11.2 Android、鸿蒙、Windows

1. reviewing 审核通过。
2. 调用 xpay/refund_order。
3. 成功受理后进入 submitted。
4. 通过 xpay/query_order 或 xpay_refund_notify 查询最终结果。
5. 最终成功后写退款事实并执行权益补偿。

### 11.3 iOS

1. 用户在 App Store 发起退款。
2. 收到退款问询时，在官方时限内根据订单、发货和售后事实返回建议及
   证据。
3. 本地记录进入 external_required。
4. Apple 最终决定退款。
5. 收到 xpay_refund_notify 后写退款事实并执行权益补偿。

后台必须明确提示“平台不能主动发起 iOS 退款”，不能把“建议退款”
展示为退款成功。

## 12. API 兼容

### 12.1 保留读取接口

    GET /tenant/branding/entitlement-product
    GET /tenant/branding/entitlement-orders
    GET /tenant/branding/entitlement-orders/:id
    GET /platform/branding/entitlement-orders
    GET /platform/branding/entitlement-orders/:id

统一订单响应增加：

- payment_channel：legacy_direct 或 wechat_virtual。
- payment_platform：android、harmony、windows、ios 或 unknown。
- payment_status。
- fulfillment_status。
- refund_status。

旧订单缺少的新状态根据历史事实映射，不回填或伪造虚拟支付字段。

### 12.2 停用旧写接口

切换后以下接口不得再创建或拉起品牌权益普通支付：

    POST /tenant/branding/entitlement-orders
    POST /tenant/branding/entitlement-orders/:id/payment-request

返回：

- HTTP 409。
- code=BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED。
- 明确提示客户端升级并重新发起虚拟支付购买。

不静默改变旧接口 response shape，不把请求内部转发到虚拟支付。

### 12.3 小程序交接

小程序团队需要：

- 使用新虚拟支付订单和支付请求接口。
- 使用 wx.requestVirtualPayment，不再对品牌权益调用
  wx.requestPayment。
- 根据服务端 capability 展示购买入口。
- 各平台显示同一售价，不在客户端计算渠道费率。
- success 后显示“支付结果确认中”并查单。
- 处理取消、网络失败、处理中、超时和需升级状态。
- iOS 不可用设备或账户显示官方条件提示，不回退普通支付。
- 历史订单继续显示 payment_channel=legacy_direct。

## 13. 独立商户号完整保留

### 13.1 保留范围

以下能力不得因本次迁移删除、停用或复用为虚拟支付：

- platform_payment_configs 中 platform_direct_recharge /
  direct_merchant 配置。
- APIv3 商户证书、平台公钥或平台证书、APIv3 密钥及密文引用。
- 小程序下单、调起支付、查询订单、关单、退款和账单下载网关。
- 普通支付通知验签、幂等落库和主动查单能力。
- 独立商户号订单、退款、通知和对账审计。
- 商户号与小程序 AppID 的现有绑定关系。

### 13.2 后续实物商城

平台自营实物商城由独立商户号普通支付承接，但不得复用
tenant_addon_orders 作为商城订单表。商城应建立自己的商品、交易、
发货、收货、售后和退款领域，只复用普通支付基础设施。

未来应为商城新增明确的普通支付业务通道，例如
platform_marketplace_goods，不能继续借用 tenant_recharge 语义。

实物订单需按小程序发货信息管理服务要求评估：

- 查询小程序是否开通发货信息管理。
- 发货后录入物流或发货信息。
- 支持确认收货和结算事件。
- 退款与售后按原普通支付渠道处理。

如果未来由租户或供应商作为实际销售者，不能默认由平台独立商户号
代收全部货款。必须根据经营主体重新评估服务商、特约商户、分账或
收付通方案。

## 14. 切换与数据迁移

### 14.1 发布顺序

1. 上线纯增量 migration 和后端代码，purchase_mode 保持
   direct_legacy。
2. 配置 sandbox 与 production 虚拟商品映射，保持 disabled。
3. 发布 Admin 的虚拟支付配置、订单来源和人工退款界面。
4. 发布支持虚拟支付的小程序版本。
5. 完成 sandbox 和受控现网真实支付验收。
6. 进入 maintenance 切换窗口。
7. 收敛所有旧 pending 普通支付订单。
8. 激活 production 虚拟商品映射并切换 wechat_virtual。
9. 持续观察后扩大租户灰度范围。

### 14.2 旧待支付订单收敛

不能只用 SQL 把旧 pending 改成 closed。正确流程：

1. purchase_mode 切到 maintenance，数据库和 service 双重禁止新建。
2. 分页 claim 旧 pending 订单，每批不超过 100。
3. 对每笔订单使用原支付配置主动查单。
4. SUCCESS：按旧链路幂等确认支付并履约。
5. NOTPAY：调用 APIv3 关单；关单确认后本地写 closed，原因记录为
   PAYMENT_CHANNEL_MIGRATED。
6. CLOSED：本地幂等写 closed。
7. ORDER_NOT_EXIST：按是否存在 prepay_id 和现有可靠性规则处理。
8. 未知状态或网络错误：释放 claim、记录有界错误并保持未决。
9. 未决旧订单为零后才允许切换 wechat_virtual。

旧支付迟到通知仍需继续处理，保证已发生的资金事实不会丢失且权益只
履约一次。

### 14.3 商品配置迁移

- 保留现有商品 ID、code 和历史快照。
- 通过受控平台商品接口更新购买说明和人工退款政策，不手工执行远端
  DML。
- production 启用前校验 amount_fen 不低于 100 且与微信商品一致。
- sandbox 与 production 使用独立映射和密钥引用。

## 15. 灰度与故障处理

### 15.1 灰度

- 开发环境先验证 Android、鸿蒙或 Windows 沙箱。
- iOS 使用受控的 production 测试商品和真实支付验收，因为 iOS 不
  支持虚拟支付沙箱。
- 生产先按测试租户白名单开放。
- 白名单租户只允许虚拟支付或暂停购买，不能回退普通支付。
- 验证稳定后扩大范围并最终移除白名单。

### 15.2 暂停

以下情况立即切换 maintenance：

- 商品金额或 ProductId 不一致。
- AppKey、offerId、环境或配置版本不匹配。
- 支付成功但权益未履约。
- 通知认证或上下文匹配出现异常。
- 微信侧能力、账户或商品被停用。
- 对账出现无法解释的资金差异。

### 15.3 回滚

虚拟支付上线后的回滚路径只有：

    wechat_virtual -> maintenance

暂停后：

- 禁止创建新订单。
- 已支付订单继续完成权益履约。
- pending 订单继续查单并收敛。
- 已提交退款继续跟踪。
- 修复后重新切换 wechat_virtual。

不得把品牌权益重新切回 direct_legacy。数据库不执行破坏性回滚，
使用前向 migration 修复。历史虚拟支付订单、通知、退款和审计永久
保留。

独立商户号可以同时继续服务其他普通支付业务，但不得成为品牌权益
故障降级通道。

## 16. 安全、权限与审计

- 客户端金额、商品ID、offerId、环境和渠道均不可信。
- payer_openid 必须来自已验证的小程序会话，不能作为租户选择器。
- AppKey、session_key 和普通支付密钥必须分域保存和加载。
- 当前登录链路取得 session_key 后必须加密持久化；现状中
  session_key 被丢弃是实施前必须补齐的明确缺口。
- 虚拟支付 sandbox 与 production 密钥严格隔离。
- 回调入口先完成微信消息认证，再处理业务字段。
- 支付确认校验 OpenId、OutTradeNo、ProductId、数量、原价、实付价、
  环境和交易唯一标识。
- 超管退款需要独立权限，不复用订单只读权限。
- 所有退款审核、退款问询响应、权益补偿、模式切换和商品配置变更写入
  audit_logs。
- 虚拟支付表使用 RLS 拒绝客户端直连；只允许受控后端角色访问。
- 列表和详情对 OpenID、票据、签名、密钥引用及原始报文脱敏。
- 错误响应统一通过 error-factory.ts，禁止直接抛出 Error。

## 17. 性能边界

- 所有列表默认 page=1、pageSize=20，最大 100。
- 订单补偿和迁移关单任务每批最多 100，使用 claim 租约避免重复处理。
- 统一列表使用数据库 UNION ALL 或单次 RPC，不在应用内先拉全量再
  切片。
- 列表只查询必要字段；通知和审计仅在详情按需读取。
- 按 pending、grant_failed、submitted 退款建立部分索引，支持 worker
  有界扫描。
- 搜索、租户筛选、状态筛选和时间排序的索引全部通过 migration 管理。
- dev 应用 migration 后对统一列表、租户筛选和关键词搜索执行
  EXPLAIN ANALYZE；数据量小时可临时禁用顺序扫描验证索引能力，但
  不修改数据库全局规划器配置。

## 18. 可观测性与对账

监控：

- 订单创建成功率、失败码和客户端平台分布。
- 通知接收、认证失败、重复通知和处理延迟。
- pending、grant_failed 和未决查单数量。
- 支付成功但未关联权益事件数量；大于 0 立即告警。
- 商品、金额、用户、环境或交易标识不匹配数量；大于 0 立即告警。
- 人工退款 reviewing、submitted、external_required 的待处理时长。
- 退款成功但权益补偿失败数量；大于 0 立即告警。
- 切换后旧普通支付品牌权益出现新的 SUCCESS 数量。

对账：

- 虚拟支付使用虚拟支付订单查询和日账单。
- iOS 结算账单与普通虚拟支付账单分开核对。
- 普通独立商户号继续使用 APIv3 交易账单和资金账单。
- 品牌权益订单按 payment_channel 进入对应对账任务。
- 对账差异只标记和告警，不自动改写权益或资金事实。

## 19. 测试设计

### 19.1 Migration 与数据库契约

- 新表、约束、索引、RLS 和函数存在。
- 默认 purchase_mode=direct_legacy。
- 不允许 direct_legacy 跳过 maintenance 直接进入 wechat_virtual，
  也不允许 wechat_virtual 回到 direct_legacy。
- 历史 tenant_addon_orders 不被改写。
- 旧写 RPC 在 maintenance 和 wechat_virtual 下拒绝创建。
- 虚拟订单快照不可变。
- pending 唯一、通知幂等、交易号唯一、购买事件唯一。
- 退款和 reverses_event_id 唯一。

### 19.2 Service 单元与契约

- 商品映射、价格下限和环境校验。
- jscode2session 后 session_key 加密轮换、缺失、失效、解绑撤销和
  重新登录恢复。
- 租户权限、OpenID 绑定和跨租户隔离。
- 创建幂等、pending 复用和并发创建。
- 支付请求签名输入和密钥环境隔离。
- success 回调不能直接履约。
- 通知重复、乱序、延迟、伪造和上下文不匹配。
- 查单与通知复用同一确认服务。
- 首次购买、未到期顺延、到期续购和并发续购。
- suspended、revoked 和迟到支付通知。
- 人工退款、iOS 外部退款、退款失败和权益补偿重试。

### 19.3 集成与真实支付

- Android、鸿蒙或 Windows 沙箱道具直购。
- production iOS 最低 1 元真实支付。
- 客户端主动取消、网络中断和 success 回调丢失。
- 发货通知履约、通知丢失后的主动查单履约。
- 退款通知和最终状态收敛。
- 新旧统一订单列表、筛选、分页和详情。
- 独立商户号普通支付下单、通知、查单、关单、退款和账单回归。

### 19.4 最小工程验证

- bun run api:typecheck
- bun run api:build
- bun run api:check-file-size
- 相关 Bun 单元和契约测试
- supabase migration list 前后 Local/Remote 对齐
- dev EXPLAIN ANALYZE
- API dev smoke
- 微信开发者工具与真机验收

## 20. 上线准入清单

- 虚拟支付账户、offerId 和 production AppKey 已启用。
- 年度权益 ProductId 已发布，价格与 Gooes 商品一致且不低于 1 元。
- 商品、退款和用户说明已通过运营审核。
- Android、鸿蒙或 Windows 沙箱闭环通过。
- iOS 受控现网真实支付闭环通过。
- 小程序新版本已发布并达到切换要求。
- 旧客户端升级错误和维护提示已验证。
- 旧 pending 普通支付订单已全部收敛。
- 虚拟支付通知和主动查单同时可用。
- 支付成功与权益履约原子链路通过并发和幂等验证。
- 人工退款权限、审计和补偿链路通过。
- 统一查询无 N+1，分页和执行计划通过。
- 独立商户号普通支付回归通过。
- 监控、告警、对账和 maintenance 开关已演练。
- 运维明确知晓：虚拟支付故障时暂停销售，不回退普通支付。

## 21. 验收标准

1. 切换后任何新年度品牌权益订单均为 wechat_virtual。
2. 旧普通支付品牌权益写接口不能创建新订单。
3. Android、鸿蒙、Windows、iOS 显示相同售价和权益内容。
4. 客户端 success 丢失时，通知或主动查单仍能完成一次且仅一次履约。
5. 重复通知、重复查单和并发请求不会重复延长权益。
6. 支付成功但权益失败可以自动补偿并告警。
7. 退款最终成功后权益只补偿一次；退款失败不调整权益。
8. iOS 退款正确展示为外部处理，不伪装为平台主动退款。
9. 租户和超管可以在统一列表查看新旧订单并识别渠道。
10. 旧已支付订单和现有权益在迁移前后保持一致。
11. 虚拟支付不可用时购买入口关闭，独立商户号不接管品牌权益。
12. 独立商户号普通支付能力仍可用于后续平台自营实物商城。

## 22. 风险与控制

| 风险 | 控制 |
| --- | --- |
| 旧订单晚付导致资金与权益不一致 | maintenance 后逐笔查单和远端关单，保留迟到通知 |
| 客户端成功回调丢失 | 发货通知与主动查单双路径 |
| 虚拟支付与普通支付密钥混用 | 独立配置表、secret ref 和 gateway |
| 当前登录未保存 session_key | 新增加密会话凭据表；缺失时要求重新登录 |
| 不同平台价格漂移 | 单一业务价格、启用前配置校验、客户端不算费率 |
| iOS 无沙箱导致验收不足 | 受控 production 小额真实支付和完整审计 |
| iOS 退款由 Apple 决定 | external_required 状态和退款问询审计 |
| 退款后错误扣减权益 | 原购买事件反向关联、事务锁和一次性补偿 |
| 旧客户端继续调用普通支付 | 停用旧写接口并返回稳定升级错误 |
| 虚拟支付故障时违规回退 | 单值 purchase_mode 状态机，禁止 virtual 回 direct |
| 后续商城误用权益订单表 | 只复用普通支付基础设施，商城另建交易领域 |

## 23. 实施拆分建议

正式实施计划应按以下批次拆分，每批可独立验证和提交：

1. 数据库基础、商品映射和 purchase_mode。
2. 微信登录 session_key 加密凭据与重新登录契约。
3. 虚拟支付签名、订单创建和支付请求。
4. 发货通知、主动查单和原子权益履约。
5. 新旧订单统一查询和 Admin 来源展示。
6. 人工退款、iOS 退款问询和权益补偿。
7. 旧订单收敛工具、灰度开关和切换 runbook。
8. 小程序交接、真实支付 smoke、对账和发布证据。

每批只解决一个清晰目标；数据库变更只通过 migration；不得修改
orange 仓库。

## 24. 参考资料

### 24.1 微信小程序官方文档

- 虚拟支付：
  https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html
- iOS 端接入：
  https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment/ios.html
- 技术服务费：
  https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment/devplan.html
- Android、鸿蒙会员订阅：
  https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/vips.html
- iOS 会员订阅：
  https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/vip.html
- 小程序发货信息管理服务：
  https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html

本项目当前不具备自动续费订阅准入条件，订阅文档只用于明确非目标和
未来边界，不作为本期实现依据。

### 24.2 微信支付官方知识库

- APIv3 普通商户 JSAPI 支付产品介绍：
  .codex/skills/wechatpay-payment-integration/assets/微信支付官网文档/APIv3/普通商户/支付产品/JSAPI支付/产品介绍-4012062524.md
- APIv3 普通商户 JSAPI 支付开发指引：
  .codex/skills/wechatpay-payment-integration/assets/微信支付官网文档/APIv3/普通商户/支付产品/JSAPI支付/开发指引-4012791870.md

对应官方地址：

- https://pay.weixin.qq.com/doc/v3/merchant/4012062524
- https://pay.weixin.qq.com/doc/v3/merchant/4012791870

### 24.3 Gooes 当前实现

- supabase/migrations/20260728120000_create_branding_addon_commerce.sql
- apps/api/src/services/tenant-branding-addon-orders.ts
- apps/api/src/services/tenant-branding-addon-order-payment.ts
- apps/api/src/services/wechat-pay-callbacks.ts
- apps/api/src/services/branding-addon-payment-confirmation.ts
- apps/api/src/repositories/branding-addon-order-records.ts
- docs/superpowers/specs/2026-07-28-tenant-support-branding-batch-b-design.md
- docs/superpowers/plans/2026-07-28-tenant-support-branding-batch-b.md

GoodCMS LightRAG 在本次资料检索时返回 502。本文对当前实现的判断以
本地代码、migration 和仓库文档为准；未使用 RAG 返回内容形成结论。
