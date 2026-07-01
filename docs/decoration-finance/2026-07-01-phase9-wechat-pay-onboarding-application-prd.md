# Phase 9 微信支付开通申请流程 PRD

日期：2026-07-01

## 背景

Phase 9 已完成微信支付配置、订单、JSAPI 预下单、回调闭环、应收核销、财务台账和 workflow 推进的代码侧基线。

当前缺口在于租户侧还没有一个清晰的“微信支付开通申请”入口。现有 `/finance/wechat-pay` 更像支付配置维护页，可以维护 `sub_merchant_id`、`sub_app_id`、进件状态、AppID 绑定状态和密钥引用，但不能表达租户从“未申请”到“资料提交、平台审核、人工进件、回填子商户、绑定 AppID、启用收款”的完整过程。

如果继续只依赖配置页，租户和平台运营都会混淆以下状态：

- 是否已经提交开通资料。
- 资料是否被平台驳回。
- 是否已在微信服务商后台发起特约商户申请。
- 是否已经拿到 `sub_mchid`。
- 平台小程序 AppID 是否已经绑定到该 `sub_mchid`。
- 当前是否可以执行真实项目收款。

因此需要新增独立的“微信支付开通申请”流程，跑通后再进入真实小额支付 smoke。

## 目标

1. 租户 Admin 可以发起微信支付开通申请。
2. 平台 Admin 可以审核租户提交的资料，并记录人工进件进度。
3. 平台 Admin 可以回填 `sub_mchid`、`sub_appid`、进件状态和 AppID 绑定状态。
4. 申请完成后自动或半自动生成可用于收款的 `tenant_payment_configs` 微信支付配置。
5. 后端支付订单创建继续使用现有校验：服务商子商户模式必须具备 `sub_mchid` / `sub_appid`，且 `applyment_state=opened`、`appid_binding_state=bound`。
6. 通过该流程准备出真实小额支付 smoke 所需的租户支付配置。

## 非目标

第一版不做以下内容：

- 不接微信支付服务商进件 API。
- 不自动上传营业执照、法人证件、结算账户附件到微信支付。
- 不保存微信支付明文密钥、私钥、APIv3 Key 或证书原文。
- 不做退款、关单、查单和对账下载。
- 不让小程序选择或管理 `sub_mchid`。
- 不绕过当前 workflow、应收计划、payment、ledger 和回调闭环。

## 角色

| 角色 | 责任 |
| --- | --- |
| 租户超级管理员 | 发起开通申请，填写主体、联系人、结算账户等资料，查看申请状态和驳回原因。 |
| 平台运营 | 审核资料，在线下或微信支付商户平台发起人工进件，回填微信申请单状态。 |
| 平台财务 | 校验结算账户、确认收款主体、启用支付配置。 |
| 平台技术管理员 | 配置密钥引用、回调地址、证书序列号和生产发布门禁。 |

## 核心流程

### 1. 租户提交申请

租户在 Admin 侧进入“微信支付开通申请”，填写并提交：

- 商户简称。
- 营业执照主体名称。
- 营业执照统一社会信用代码。
- 经营者或法人姓名。
- 超级管理员姓名、手机号、邮箱。
- 结算账户开户名。
- 结算账户开户银行。
- 结算账户账号后四位或摘要。
- 经营场景说明。
- 联系地址。
- 备注。

第一版只保存资料和必要附件引用，不直接对接微信进件 API。

提交后申请状态变为 `submitted`，租户不能直接改为已开通。

### 2. 平台审核资料

平台 Admin 在“租户微信支付开通申请”列表查看申请，支持：

- 按状态、租户、提交时间筛选。
- 查看申请详情和历史处理记录。
- 审核通过。
- 驳回并填写原因。

审核通过后状态变为 `approved`。驳回后状态变为 `rejected`，租户可修改后重新提交。

### 3. 平台人工进件

平台运营根据审核通过的资料，在微信支付服务商后台或线下流程发起特约商户申请。

系统需要记录：

- 平台内部申请编号 `application_no`。
- 微信进件业务编号 `applyment_business_code`。
- 微信申请单号 `applyment_id`。
- 进件状态 `applyment_state`。
- 进件状态说明或驳回原因。

此阶段状态可以是：

```text
approved -> applying -> reviewing -> account_verifying -> signing
```

当微信侧完成开通后，平台回填 `sub_mchid` 并将进件状态置为 `opened`。

### 4. AppID 绑定

由于平台统一小程序服务多个租户子商户，每个租户 `sub_mchid` 都必须确认平台小程序 AppID 绑定。

系统记录：

- 平台小程序 AppID。
- 子商户 AppID，也就是服务商支付请求中的 `sub_appid`。
- AppID 绑定状态 `appid_binding_state`。
- AppID 绑定说明。

只有 `appid_binding_state=bound` 时，租户项目款才能使用服务商子商户 JSAPI 支付。

### 5. 激活支付配置

当以下条件全部满足时，可以激活租户微信支付配置：

- 申请状态为 `opened`。
- 已回填 `sub_mchid`。
- 已配置 `sub_appid`。
- `appid_binding_state=bound`。
- 已配置 `encrypted_config_ref`。
- 已配置 `notify_url`。
- 已配置证书序列号或必要的签名材料引用。

激活后写入或更新 `tenant_payment_configs`：

```text
provider = wechat_pay
principal_type = tenant
merchant_mode = service_provider_sub_merchant
merchant_id = 服务商商户号
sub_merchant_id = 租户 sub_mchid
app_id = 平台小程序 AppID
sub_app_id = 平台小程序 AppID
applyment_state = opened
appid_binding_state = bound
status = active
enabled_channels = ["project_payment"]
```

说明：`merchant_id` 是否保存服务商商户号，需要与密钥引用和当前 `tenant_payment_configs` 字段语义保持一致。第一版可以由平台配置页维护，不让租户直接填写。

## 状态机

申请主状态建议：

| 状态 | 说明 | 谁可操作 |
| --- | --- | --- |
| `draft` | 租户保存草稿，未提交 | 租户 |
| `submitted` | 租户已提交，待平台审核 | 租户只读，平台审核 |
| `rejected` | 平台驳回，等待租户修改 | 租户重新提交 |
| `approved` | 平台审核通过，待人工进件 | 平台 |
| `applying` | 平台已开始人工进件 | 平台 |
| `reviewing` | 微信支付审核中 | 平台同步/回填 |
| `account_verifying` | 待账户验证 | 租户配合，平台回填 |
| `signing` | 待签约 | 租户配合，平台回填 |
| `opened` | 特约商户已开通 | 平台回填和激活配置 |
| `bound` | AppID 已绑定且配置可启用 | 平台激活 |
| `active` | 已启用支付收款 | 系统/平台 |
| `suspended` | 暂停 | 平台 |
| `closed` | 关闭 | 平台 |

`active` 不是微信侧进件状态，而是系统内“允许创建微信支付订单”的最终可用状态。

## 数据模型建议

新增申请表，避免把申请资料全部塞进 `tenant_payment_configs`：

### `tenant_wechat_pay_applyments`

建议字段：

- `id`
- `tenant_id`
- `application_no`
- `status`
- `merchant_short_name`
- `license_name`
- `license_code`
- `legal_representative_name`
- `super_admin_name`
- `super_admin_phone_masked`
- `super_admin_email`
- `settlement_account_name`
- `settlement_bank_name`
- `settlement_account_summary`
- `business_scene_description`
- `contact_address`
- `applyment_business_code`
- `applyment_id`
- `applyment_state`
- `applyment_state_message`
- `sub_mchid`
- `sub_appid`
- `appid_binding_state`
- `appid_binding_message`
- `payment_config_id`
- `submitted_at`
- `approved_at`
- `opened_at`
- `activated_at`
- `rejected_at`
- `rejected_reason`
- `created_by_employee_id`
- `updated_by_employee_id`
- `reviewed_by_employee_id`
- `created_at`
- `updated_at`

敏感资料不直接保存明文。附件只保存对象存储 key、文件名摘要、文件类型和上传人。

### `tenant_wechat_pay_applyment_events`

用于审计状态变化：

- `id`
- `tenant_id`
- `applyment_id`
- `event_type`
- `from_status`
- `to_status`
- `message`
- `operator_employee_id`
- `metadata`
- `created_at`

## API 建议

租户侧：

- `GET /finance/wechat-pay/applyment/current`
- `POST /finance/wechat-pay/applyments`
- `PUT /finance/wechat-pay/applyments/:id`
- `POST /finance/wechat-pay/applyments/:id/submit`
- `GET /finance/wechat-pay/applyments/:id`

平台侧：

- `GET /platform/finance/wechat-pay/applyments?page=1&pageSize=20`
- `GET /platform/finance/wechat-pay/applyments/:id`
- `POST /platform/finance/wechat-pay/applyments/:id/approve`
- `POST /platform/finance/wechat-pay/applyments/:id/reject`
- `POST /platform/finance/wechat-pay/applyments/:id/mark-applying`
- `PUT /platform/finance/wechat-pay/applyments/:id/wechat-status`
- `POST /platform/finance/wechat-pay/applyments/:id/activate-config`

所有列表接口必须分页，`pageSize` 最大值不超过 `100`。

## Admin 交互建议

### 租户 Admin

在财务分组新增“微信支付开通”入口。

页面状态：

- 未申请：展示开通说明和“发起申请”。
- 草稿：展示继续填写。
- 审核中：展示已提交资料和当前状态。
- 驳回：展示驳回原因和“修改后重新提交”。
- 进件中：展示平台处理进度、微信申请单号和待租户配合事项。
- 已开通：展示 `sub_mchid` 脱敏、AppID 绑定状态、支付配置状态。

### 平台 Admin

在平台运维或财务管理下新增“微信支付进件申请”：

- 申请列表。
- 详情抽屉或详情页。
- 审核动作。
- 人工进件状态回填。
- `sub_mchid` / `sub_appid` 回填。
- 一键激活配置。

## 权限建议

租户侧：

- `wechat_pay.applyment.read`
- `wechat_pay.applyment.submit`

平台侧：

- `platform.wechat_pay.applyment.read`
- `platform.wechat_pay.applyment.review`
- `platform.wechat_pay.applyment.manage`
- `platform.wechat_pay.config.activate`

现有 `wechat_pay.config.read`、`wechat_pay.config.manage` 继续用于支付配置维护，不直接代表申请审核权限。

## 与现有支付闭环关系

申请流程只负责让租户支付配置达到可用状态，不直接创建支付订单。

真实项目收款仍沿用当前 Phase 9 主链路：

1. 收款 workflow task 当前员工可执行。
2. 小程序传真实 `payer_openid` 调用 `POST /finance/wechat-pay/orders`。
3. 后端创建微信支付订单并返回 `payment_request`。
4. 小程序调用 `wx.requestPayment`。
5. 微信支付回调。
6. 后端验签、解密、幂等处理。
7. 创建 confirmed payment。
8. 应收核销。
9. 财务台账入账。
10. workflow task complete 并推进下一节点。

## 小程序边界

小程序第一版不需要参与租户 `sub_mchid` 申请。

小程序只需要在支付 smoke 阶段：

- 提供平台小程序 AppID 下的用户 `openid`。
- 调用后端微信支付订单接口。
- 使用后端返回的 `payment_request` 调用 `wx.requestPayment`。
- 支付后刷新后端状态。

小程序不保存商户号、不选择 `sub_mchid`、不保存密钥、不本地确认 payment、不本地推进 workflow。

## 验收标准

第一版 PRD 对应实现完成后，至少满足：

1. 租户 Admin 可以创建、保存、提交微信支付开通申请。
2. 租户 Admin 可以看到申请当前状态、驳回原因、进件进度和开通结果。
3. 平台 Admin 可以分页查看申请列表。
4. 平台 Admin 可以审核通过或驳回申请。
5. 平台 Admin 可以回填微信申请单、进件状态、`sub_mchid`、`sub_appid` 和 AppID 绑定状态。
6. 平台 Admin 可以在条件满足后激活租户微信支付配置。
7. 激活后 `tenant_payment_configs` 满足服务商子商户支付校验。
8. 未开通或未绑定 AppID 的租户不能创建微信支付订单，返回稳定错误码。
9. 所有状态变化有审计记录。
10. 完成后可以执行真实小额支付 smoke，并回填订单、回调、payment、ledger 和 workflow 证据。

## 真实小额支付 smoke 前置清单

进入真实支付前必须确认：

- 已轮换之前沟通中暴露过的微信支付敏感材料。
- 已配置真实 secret bundle。
- 租户申请状态已到 `active`。
- `sub_mchid` 已回填。
- 平台小程序 AppID 已绑定到该 `sub_mchid`。
- 测试环境回调域名可被微信支付访问。
- 有一个真实 pending 收款 workflow task。
- 有一个平台小程序 AppID 下的真实用户 `openid`。
- 小额金额符合微信支付最小支付要求。

## 实施拆分建议

### Task 1：PRD 与 migration

- 新增 `tenant_wechat_pay_applyments`。
- 新增 `tenant_wechat_pay_applyment_events`。
- 新增权限码。
- 建立租户、状态、提交时间索引。

### Task 2：租户侧 API

- 当前申请读取。
- 创建草稿。
- 更新草稿。
- 提交申请。
- 读取详情和事件时间线。

### Task 3：平台侧 API

- 分页列表。
- 详情。
- 审核通过。
- 驳回。
- 回填进件状态。
- 激活支付配置。

### Task 4：Admin 页面

- 租户 Admin 开通申请页。
- 平台 Admin 申请列表和详情。
- 状态和审计时间线展示。
- 与当前微信支付配置页互相跳转。

### Task 5：真实支付 smoke

- 准备一个真实租户申请样本。
- 激活配置。
- 创建真实收款 workflow task。
- 小程序拉起支付。
- 微信回调闭环。
- Admin 只读核验。

## 风险和约束

- 微信支付主体、服务商、租户和平台小程序 AppID 的绑定关系必须在上线前由微信商户平台确认。
- 密钥和证书材料必须通过安全配置管理，不进入数据库明文字段。
- 人工进件第一版会依赖平台运营及时回填状态，后续可接微信进件 API 降低人工成本。
- 申请资料包含敏感经营信息，Admin 页面和 API 必须严格按租户和平台权限隔离。
- 支付配置激活必须是受控动作，不能让租户自己把未开通配置改成 `active`。

## 结论

新增独立“微信支付开通申请”流程是必要的。它能补上当前 Phase 9 支付能力和真实租户开通之间的运营闭环，使租户知道自己处于哪个阶段，也使平台能够有据可查地完成人工进件、`sub_mchid` 回填、AppID 绑定和支付配置激活。

第一版应优先完成人工进件闭环。等真实小额支付 smoke 通过后，再评估是否进入微信支付服务商 API 进件自动化。
