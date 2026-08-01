# 微信虚拟支付配置统一入口设计

## 1. 文档状态

- 状态：方案已确认，待实施
- 日期：2026-08-01
- 适用端：Admin 平台超管侧、API 平台管理接口
- 关联设计：`docs/superpowers/specs/2026-07-31-platform-digital-entitlement-virtual-payment-migration-design.md`

本文定义微信虚拟支付配置从“平台配置 → 品牌权益”迁移到“系统配置 → 支付配置”的信息架构、权限、接口与兼容边界。用户已确认采用统一支付配置入口，并授权后续实现所需的方案确认。

## 2. 背景与问题

当前品牌权益页面同时编辑商品资料、销售模式、沙箱/生产环境映射，并展示密钥状态和校验结果。这会造成三类问题：

1. 商品经营信息与支付基础设施配置混在同一表单，职责不清。
2. 普通微信支付配置在“系统配置 → 支付配置”，虚拟支付却在品牌权益页，运维入口割裂。
3. `platform.branding_product.manage` 可以间接修改支付通道，权限边界过宽。

系统已经有平台支付配置页面、普通支付商户配置和 `platform.payment.config.read/manage` 权限，因此本次不新建侧边栏菜单，而是在现有支付配置页内统一管理普通支付和虚拟支付。

## 3. 目标与非目标

### 3.1 目标

- “系统配置 → 支付配置”成为所有平台支付基础设施配置的唯一入口。
- “平台配置 → 品牌权益”只管理权益商品、订单和退款业务。
- 支付配置与商品配置分别使用支付权限和品牌权益权限。
- 密钥只允许覆盖写入，不向浏览器回传明文或历史值。
- 继续保留独立商户号/APIv3 普通支付配置，供后续实物商城及其他合规交易使用。
- 不改变现有虚拟支付订单、履约、退款和数据库状态机。

### 3.2 非目标

- 不切换当前 `purchase_mode`，不自动启用 `wechat_virtual`。
- 不填充或迁移真实 AppKey、消息令牌等敏感值。
- 不修改微信虚拟支付订单和权益履约模型。
- 不删除普通支付商户配置、通知、退款或对账能力。
- 不修改 Orange 小程序仓库。

## 4. 信息架构

### 4.1 系统配置 → 支付配置

现有支付配置面板增加一级页签：

- 普通微信支付：保留“平台直营充值”和“租户服务商”配置、密钥、就绪检查。
- 数字权益虚拟支付：管理年度品牌权益对应的虚拟支付通道。

虚拟支付页按以下顺序组织：

1. 总体状态：当前销售模式、沙箱/生产就绪状态、主要阻塞项。
2. 环境配置：沙箱和生产环境页签，编辑 AppID、虚拟商户号、Offer ID、微信 Product ID、预期金额和启用状态。
3. 密钥配置：AppKey 和配置修订号；只显示是否已配置、来源和版本。
4. 消息认证：微信虚拟支付消息令牌；只允许覆盖写入，不回显明文。
5. 配置校验：按环境调用微信校验并展示最近结果、时间和错误原因。
6. 销售模式：执行 `direct_legacy → maintenance → wechat_virtual` 或 `wechat_virtual → maintenance → wechat_virtual` 的受控切换。

页面以只读方式显示关联商品名称和统一售价，并提供“前往品牌权益商品”链接。价格修改仍在品牌权益页完成。

深链约定：

- 虚拟支付入口：`/settings?group=payment&section=virtual`
- 指定环境：`/settings?group=payment&section=virtual&environment=sandbox|production`

### 4.2 平台配置 → 品牌权益

原“商品与支付通道”页签改名为“权益商品”，只保留：

- 商品名称、统一售价、销售状态。
- 购买说明、退款政策等商品经营字段。
- 当前支付通道和就绪状态的只读摘要。
- “前往支付配置”按钮。

“购买订单”和“退款处理”页签及其 URL、权限、业务逻辑保持不变。

## 5. 前端组件边界

### 5.1 支付配置

`PlatformPaymentSettingsPanel` 负责一级模式切换，不直接承载虚拟支付领域细节：

- 普通微信支付继续复用现有 profile 组件。
- 新增独立的虚拟支付设置组件，负责加载快照、编辑环境映射、写入密钥、校验和切换销售模式。
- 环境表单、密钥表单、状态摘要拆为聚焦组件，避免把不同安全级别的数据放在同一次提交中。

### 5.2 品牌权益

品牌权益商品表单只提交业务商品字段。支付摘要组件只读，不复用可编辑的虚拟支付表单，避免形成两个配置源。

### 5.3 加载与错误反馈

- 支付配置和品牌权益骨架屏必须与新的页面结构一致。
- 版本冲突提示用户重新加载最新配置，不静默覆盖。
- 远端校验失败保留本地配置，并展示可行动的错误信息和 requestId。
- 密钥更新成功后，关联环境校验状态回到待校验；生产切换继续受就绪条件阻断。
- 网络失败不得把未确认的保存或校验显示为成功。

## 6. API 与权限设计

### 6.1 品牌权益接口

保留：

- `GET /platform/branding/entitlement-product`
- `PATCH /platform/branding/entitlement-product`

`PATCH` 只接受商品经营字段和商品版本，不再接受 `purchase_mode`、`virtual_product` 或虚拟支付密钥。继续要求 `platform.branding_product.manage`。

`GET` 可以返回当前支付模式和就绪摘要供页面只读展示，但该响应不构成可编辑支付配置契约。

### 6.2 虚拟支付配置接口

新增支付域接口：

- `GET /platform/payment/wechat-virtual/branding-entitlement`
  - 权限：`platform.payment.config.read`
  - 返回关联商品只读摘要、销售模式、两个环境的映射、密钥状态、消息令牌状态、校验状态和 `can_manage`。
- `PATCH /platform/payment/wechat-virtual/branding-entitlement`
  - 权限：`platform.payment.config.manage`
  - 只接受 `purchase_mode`、可选的环境映射和对应乐观锁版本。
  - 复用现有数据库原子 RPC，禁止在 controller 中拼接多次写入。
- `PUT /platform/payment/wechat-virtual/branding-entitlement/:environment/secret-bundle`
  - 权限：`platform.payment.config.manage`
  - 请求包含 `app_key` 和 `revision`；环境只能为 `sandbox` 或 `production`。
  - 服务端把环境映射到固定系统设置键，客户端不得指定设置键或密文引用。
- `PUT /platform/payment/wechat-virtual/message-token`
  - 权限：`platform.payment.config.manage`
  - 覆盖写入 `WECHAT_VIRTUAL_MESSAGE_TOKEN`，不返回明文。
- `POST /platform/payment/wechat-virtual/branding-entitlement/:environment/validate`
  - 权限：`platform.payment.config.manage`
  - 执行环境映射与微信侧商品校验，返回结构化校验结果。

旧品牌权益虚拟商品校验路径保留一个版本作为兼容入口，但改用支付配置管理权限，并在代码中标记弃用；Admin 新代码不得继续调用。

### 6.3 Controller、Service 与 Repository 边界

- Controller 只读取请求、执行 Zod 校验、检查权限、调用 service，并用 `ResponseHandler.success` 包装响应。
- 支付配置 service 组合商品只读摘要、虚拟映射、系统密钥状态和就绪检查。
- 数据库访问继续通过现有 repository/RPC 客户端，不在 controller 直接访问 Supabase。
- 错误统一通过 `error-factory.ts` 创建，禁止直接抛出 `Error`。

## 7. 数据与密钥安全

### 7.1 数据事实来源

- 商品名称、价格、说明和上下架：`platform_addon_products`。
- 销售模式：`platform_addon_products.purchase_mode`。
- 沙箱/生产映射与校验状态：`platform_virtual_payment_products`。
- AppKey 与消息令牌：平台级加密系统设置。

不新增重复配置表，也不在前端缓存形成第二事实来源。

### 7.2 密钥约束

- 沙箱 AppKey 使用 `WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE`。
- 生产 AppKey 使用 `WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE`。
- 回调消息认证使用 `WECHAT_VIRTUAL_MESSAGE_TOKEN`。
- GET 响应只返回 `configured`、`source`、`revision` 等元数据。
- 日志、错误响应、审计详情和浏览器状态不得包含 AppKey、消息令牌或解密后的 secret bundle。
- 写入采用独立请求，商品或环境映射更新不得携带密钥。

## 8. 状态、校验与切换

总体就绪状态由以下条件共同决定：

- 关联商品已启用且价格满足虚拟支付要求。
- 目标环境映射字段完整，数量和预期金额与业务商品一致。
- 对应环境 AppKey 已配置。
- 消息令牌已配置。
- 微信侧商品校验通过且校验结果对应当前映射版本。

生产环境未就绪时，服务端拒绝切换到 `wechat_virtual`。商品价格变化后，即使历史校验仍存在，金额不一致也必须使生产就绪状态变为阻断，直至重新保存映射并校验。

切换遵循原设计中的前向状态机，不提供 `wechat_virtual → direct_legacy`。暂停销售使用 `maintenance`，不得以旧普通支付作为自动降级通道。

## 9. 数据库与迁移判断

本次优先复用现有表、RPC 和权限：

- `platform.payment.config.read`
- `platform.payment.config.manage`
- `branding_manage_virtual_product_configuration(...)`

若 `WECHAT_VIRTUAL_MESSAGE_TOKEN` 仅需加入代码内系统设置定义，则不创建数据库 migration。只有实际新增数据库字典数据、权限、约束、索引、函数或策略时才新增前向 migration，并在应用后核对 Local/Remote migration 对齐。禁止修改已经应用的 migration。

## 10. 兼容与发布策略

1. 先发布 API 新路径和权限拆分，旧读取路径保持兼容。
2. Admin 支付配置页改用新路径，品牌权益页移除支付编辑控件并增加深链。
3. 保留旧校验接口一个版本，确认无调用后再单独移除。
4. 发布不修改数据库中的真实配置和 `purchase_mode`。
5. 若新页面出现问题，可回滚 Admin/API 代码；已有普通支付配置、虚拟支付映射、订单和权益数据不需要回滚。

## 11. 验收标准

- 平台超管在“系统配置 → 支付配置”可以看到“普通微信支付”和“数字权益虚拟支付”。
- 普通支付两个 profile 的功能和数据保持不变。
- 虚拟支付页面可以分别管理沙箱/生产映射、AppKey、消息令牌、校验和销售模式。
- 品牌权益商品页不再出现可编辑的虚拟商户号、Offer ID、Product ID、密钥或销售模式控件。
- 品牌权益页可以跳转到虚拟支付配置深链，并显示只读支付状态。
- 只有支付配置管理权限可以修改支付映射、密钥和销售模式；品牌商品权限不能越权修改。
- 所有列表接口继续分页；本次快照接口为固定单商品、双环境数据，不属于列表接口。
- GET、日志和错误中均无法获取密钥明文。
- 版本冲突、远端校验失败、未就绪切换和无权限操作均返回稳定业务错误。
- API 聚焦测试、Admin 类型检查、相关构建和浏览器 smoke 通过，骨架屏与新布局一致。

