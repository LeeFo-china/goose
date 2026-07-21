# Admin 超管一站式微信支付正式进件设计

> 日期：2026-07-21  
> 状态：设计确认  
> 接入模式：普通服务商 + APIv3 + 平台统一小程序

## 1. 背景

当前系统已经具备租户填写申请、平台审核、人工回填微信状态和激活租户支付配置的内部流程，但没有调用微信支付特约商户进件 API。现有实现还有以下结构性缺口：

- 手机号和银行账号只保存掩码，正式提交时已经无法取得原值。
- 缺少主体类型、法人证件号码和有效期、客服电话、经营场景、结算规则等微信必填字段。
- 本地附件没有上传到微信支付并换取 `MediaID`。
- 没有调用微信提交申请、查询申请状态接口。
- 没有展示签约链接、账户验证状态和逐字段驳回原因。
- 平台操作依赖人工修改微信状态，容易产生本系统状态与微信真实状态不一致的问题。

因此，本次目标不是继续增强人工回填，而是把 Admin 建设为微信支付正式进件的唯一运营入口。

## 2. 目标

1. 租户 Admin 可以完整填写企业或个体工商户的进件资料。
2. 平台超管可以在审核通过后直接向微信支付提交正式申请。
3. 后端自动上传媒体、加密敏感字段、签名请求并验签响应。
4. 平台超管可以在 Admin 内同步审核、账户验证、签约和开通状态。
5. Admin 展示签约链接、驳回字段、微信申请单号和 `sub_mchid`。
6. 微信进件完成后，平台超管通过明确确认动作激活租户收款配置。
7. 正常链路不允许人工伪造微信状态；人工修复只能作为独立受控能力存在。

## 3. 首版范围

### 3.1 支持主体

- 企业：`SUBJECT_TYPE_ENTERPRISE`
- 个体工商户：`SUBJECT_TYPE_INDIVIDUAL`

政府机关、事业单位和社会组织需要不同登记证书、经办人授权与账户验证分支，不纳入首版。

首版经营者或法定代表人证件限定为中国大陆居民身份证
`IDENTIFICATION_TYPE_IDCARD`。超级管理员支持法人/经营者本人 `LEGAL`，也支持经办人
`SUPER`；选择经办人时必须额外填写经办人身份证号码、有效期并上传身份证正反面。

### 3.2 经营场景

首版固定使用小程序场景：

```text
sales_scenes_type = ["SALES_SCENES_MINI_PROGRAM"]
mini_program_appid = 平台 tenant_service_provider profile.app_id
mini_program_sub_appid = null
```

租户不选择服务商 AppID，也不维护 `sub_appid`。平台统一小程序 AppID 必须已经绑定服务商商户号并通过支付配置验证。

### 3.3 非目标

- 不支持普通商户直连进件。
- 不支持银行、支付机构、电商收付通进件接口。
- 不让租户接触服务商证书、私钥、APIv3 Key 或微信支付公钥。
- 不自动激活真实收款；进件完成后仍由平台超管确认激活。
- 不以人工状态回填替代微信查询结果。

## 4. 方案选择

采用“租户资料草稿 + 平台审核门禁 + 后端正式提交”的方案。

不采用租户提交后立即调用微信接口，因为错误资料会直接产生正式申请；也不保留线下进件作为主流程，因为这不能保证微信状态与平台状态一致。

## 5. 业务流程

```text
租户保存草稿
  -> 租户提交平台审核
  -> 平台审核通过
  -> 平台确认提交微信
  -> 后端上传附件并创建微信申请单
  -> 微信审核中
  -> 待账户验证（按微信实际结果）
  -> 待签约
  -> 开通权限中
  -> 进件完成并取得 sub_mchid
  -> 平台确认激活租户收款配置
```

微信驳回后，平台同步逐字段驳回原因，申请退回租户修改。租户重新提交后沿用同一个稳定 `business_code` 覆盖原申请，不生成并行申请单。

## 6. 状态模型

### 6.1 微信原始状态映射

| 微信状态 | 平台主状态 | 页面含义 |
| --- | --- | --- |
| `APPLYMENT_STATE_EDITTING` | `wechat_editing` | 提交异常，允许修正后重试 |
| `APPLYMENT_STATE_AUDITING` | `reviewing` | 微信审核中 |
| `APPLYMENT_STATE_REJECTED` | `rejected` | 微信驳回，租户可修改 |
| `APPLYMENT_STATE_TO_BE_CONFIRMED` | `account_verifying` | 待账户验证 |
| `APPLYMENT_STATE_TO_BE_SIGNED` | `signing` | 待签约 |
| `APPLYMENT_STATE_SIGNING` | `opening` | 开通权限中 |
| `APPLYMENT_STATE_FINISHED` | `opened` | 微信进件完成 |
| `APPLYMENT_STATE_CANCELED` | `closed` | 微信申请已作废 |

数据库同时保存 `wechat_applyment_state_raw`，禁止丢失微信原始状态。

### 6.2 平台动作

详情接口返回 `available_actions[]`，Admin 只按后端动作渲染：

- `approve`
- `reject`
- `submit_to_wechat`
- `sync_wechat_status`
- `open_sign_url`
- `activate_payment_config`
- `repair_wechat_state`，仅异常修复权限可见

按钮状态不由前端根据中文状态名称推导。

## 7. 资料模型

### 7.1 普通字段

申请表保存以下非敏感、低敏审核投影或可脱敏展示字段：

- 主体类型、商户简称、主体名称、统一社会信用代码。
- 营业执照地址和有效期。
- 法人姓名、证件类型、证件有效期。
- 超级管理员类型、姓名、邮箱、手机号掩码；经办人证件类型和有效期。
- 客服电话、经营地址、经营场景说明。
- 结算账户类型、开户名审核投影、银行名称、支行名称、联行号、账号掩码。
- `settlement_id`、`qualification_type`。
- 微信申请单号、签约链接、`sub_mchid`、原始状态和同步时间。
- 驳回字段明细，以结构化 JSON 保存。

### 7.2 敏感字段

以下微信接口传输原值必须在正式提交前可恢复，并统一进入加密载荷：

- 法人或经营者证件姓名、证件号码、证件地址。
- 超级管理员姓名、手机号和邮箱。
- 超级管理员为经办人时的证件姓名、号码和地址。
- 结算账户开户名和银行账号。

姓名、邮箱、开户名可以另外保存为仅授权审核人员可读的低敏投影，用于核对申请；身份证号、手机号和银行账号只保留掩码，任何详情接口均不得返回原值。正式微信请求始终从加密载荷读取原值，不从展示投影拼装。

使用独立的申请敏感载荷密文：

```text
sensitive_payload_ciphertext
sensitive_payload_version = 1
sensitive_payload_updated_at
```

加密规则：

- AES-256-GCM。
- 根密钥来自服务端 `APP_CONFIG_ENCRYPTION_KEY`，通过 HKDF-SHA256 和用途字符串派生进件专用密钥。
- AAD 固定包含 `tenant_id + applyment_id + payload_version`，防止跨租户或跨申请替换密文。
- API 只返回 `has_sensitive_payload` 和掩码，不返回密文或原值。
- 微信状态进入 `opened` 并成功激活后清除密文；审计事件只记录字段名，不记录值。

草稿更新时，服务端解密旧载荷并合并本次提交的新敏感字段；前端留空表示保留原值，显式“清除”动作才删除字段。

### 7.3 附件与 MediaID

本地附件仍保存在私有 COS。新增媒体映射表：

```text
tenant_wechat_pay_applyment_media
- applyment_id
- category
- object_key
- sha256
- media_id
- uploaded_at
- request_id
```

规则：

- 正式进件只接受 JPG、JPEG、PNG、BMP。
- 单张图片按 2MB 保守上限校验大小，并校验扩展名、MIME 和文件头。
- 后端通过私有签名 URL 下载，不接受客户端提供任意 URL。
- 相同 `object_key + sha256` 复用 MediaID；附件替换后重新上传。
- 微信上传失败时保留已经成功的 MediaID，重试不重复上传。

## 8. 微信 API 网关

新增独立 `WechatPayApplymentGateway`，复用现有支付签名和响应验签基础设施，但不把进件逻辑塞入交易网关。

### 8.1 能力

1. `uploadMedia`
   - `POST /v3/merchant/media/upload`
   - multipart 请求签名正文只使用 `meta` JSON。
2. `submitApplyment`
   - `POST /v3/applyment4sub/applyment/`
   - 返回并保存 `applyment_id`。
3. `queryByBusinessCode`
   - `GET /v3/applyment4sub/applyment/business_code/{business_code}`。

### 8.2 敏感字段传输加密

- 使用中央服务商 secret bundle 中的微信支付公钥 PEM。
- 使用 RSAES-OAEP，Node.js `RSA_PKCS1_OAEP_PADDING`，OAEP 哈希为 SHA-1。
- 请求头 `Wechatpay-Serial` 使用微信支付公钥 ID。
- 商户 API 证书序列号只用于 `Authorization` 请求签名，两者不能混用。

### 8.3 幂等和重试

- `business_code` 在申请创建时生成并保持不变。
- 提交前通过数据库原子 claim 防止并发双提交。
- 微信提交超时或网络结果未知时，先按 `business_code` 查询；查询到申请即视为提交成功。
- 只有微信明确返回不存在时才允许使用相同参数重试提交。
- 每次调用记录 operation、request ID、HTTP 状态、微信错误码和耗时，不记录请求敏感正文。

## 9. 服务和 API

### 9.1 租户接口

保留现有接口路径并扩充字段：

- `POST /finance/wechat-pay/applyments`
- `PUT /finance/wechat-pay/applyments/:id`
- `POST /finance/wechat-pay/applyments/:id/submit`
- `GET /finance/wechat-pay/applyment/current`

租户提交只进入平台审核，不直接调用微信。

### 9.2 平台接口

- `POST /platform/finance/wechat-pay/applyments/:id/approve`
- `POST /platform/finance/wechat-pay/applyments/:id/reject`
- `POST /platform/finance/wechat-pay/applyments/:id/submit-to-wechat`
- `POST /platform/finance/wechat-pay/applyments/:id/sync-wechat-status`
- `POST /platform/finance/wechat-pay/applyments/:id/activate-config`

现有 `mark-applying` 和通用 `wechat-status` 从正常 UI 移除。后者保留为带单独修复权限、原因必填和完整审计的内部端点。

### 9.3 分层

- controller：读取请求、Zod 校验、调用 service、统一响应。
- service：审核状态机、资料组装、媒体上传编排、提交与同步。
- gateway：微信 HTTP、签名、验签、传输加密。
- repository：Supabase 读写、原子 claim RPC 和事件落库。

## 10. Admin 交互设计

### 10.1 租户申请页

使用紧凑的四步表单，不做营销式大卡片：

1. 主体与证照。
2. 法人和超级管理员。
3. 经营及结算账户。
4. 附件与提交复核。

使用 shadcn `Field`、`Input`、`Select`、`Checkbox`、`Tabs`、`AlertDialog`、`Progress` 和 `Button`。每一步可保存草稿，提交前显示按字段分组的缺失项。敏感字段只显示掩码和“已保存”，不回显原值。

超级管理员选择“经办人”时，第二步动态展示经办人身份证号码、地址、有效期和身份证正反面上传位；选择法人/经营者本人时隐藏并清除这些经办人专用字段。

### 10.2 平台进件详情

页面结构：

- 顶部：申请编号、租户、当前状态、微信申请单号。
- 主区：资料审阅、附件预览、逐字段驳回详情。
- 侧栏：当前唯一主动作和前置条件，不平铺所有危险按钮。
- 底部：完整事件时间线。

状态流程使用紧凑步骤条：

```text
平台审核 -> 微信审核 -> 账户验证 -> 商户签约 -> 开通完成 -> 激活收款
```

提交微信和激活收款使用 `AlertDialog` 二次确认。签约阶段展示“打开签约链接”和复制按钮；不在前端自行生成或解析微信状态。

### 10.3 自动刷新

页面处于微信处理中状态时，每 30 秒调用一次同步接口；页面隐藏后停止。保留手动同步按钮，并展示最后同步时间和微信 request ID。

## 11. 权限与审计

新增或细分权限：

- `platform.wechat_pay.applyment.submit`
- `platform.wechat_pay.applyment.sync`
- `platform.wechat_pay.applyment.repair`

正式提交、驳回、同步、激活和人工修复均写入事件表。人工修复必须填写原因，事件 metadata 保存修改前后状态，但不保存敏感值。

## 12. 错误处理

- 所有错误通过 `error-factory.ts` 生成。
- 微信参数错误返回字段级 blocker，Admin 定位到对应表单区。
- 微信驳回保存 `audit_detail[]`，租户只看到与自身资料相关的驳回内容。
- 网络超时标记为“结果待确认”，不直接回退到可重复提交状态。
- 中央服务商 profile 未验证、密钥 revision 不一致、微信公钥缺失时禁止提交。

## 13. 数据库变更

通过 migration 完成：

- 扩充申请字段和官方状态约束。
- 增加敏感载荷密文及版本字段。
- 增加签约链接、原始状态、驳回明细、同步信息和提交 claim 字段。
- 新建 MediaID 映射表及唯一索引。
- 新建原子 claim/release RPC。
- 增加正式提交、同步、修复权限。

迁移仅新增字段和表，不删除现有数据。回滚时先停用正式提交入口，再删除新增 RPC、表和字段；已激活的支付配置不随进件功能回滚而删除。

## 14. 验证

### 14.1 自动化

- Schema 条件必填测试。
- 敏感载荷加密、AAD 隔离、错误密钥和掩码测试。
- RSA-OAEP 加密测试。
- multipart 签名正文和媒体 SHA256 测试。
- 提交、未知结果查询恢复、并发 claim、微信驳回和完成状态测试。
- Admin 动作可见性、字段缺失定位和状态步骤条测试。
- API 与 Admin 类型检查、构建和文件大小检查。

### 14.2 联调

1. 使用 mock 微信网关跑完整状态链。
2. 对真实租户执行只读提交前检查，确认字段和媒体符合要求。
3. 获得明确执行确认后，向微信提交真实申请。
4. 同步至待签约，验证签约链接。
5. 商户完成签约后同步到 `APPLYMENT_STATE_FINISHED`。
6. 激活租户支付配置并执行真实 1 分支付 smoke。

真实提交和真实支付均属于外部生产动作，必须在执行前再次确认申请主体和操作窗口。

## 15. 验收标准

- 平台超管不离开 Admin 即可提交微信正式申请。
- 微信媒体上传、敏感字段加密、API 签名和响应验签全部由后端完成。
- 重复点击或网络超时不会创建并行微信申请单。
- 微信状态、签约链接、驳回字段和 `sub_mchid` 可以同步并追溯。
- 租户不能修改微信状态或激活支付配置。
- 平台不能在微信未完成进件时激活收款。
- API 和 Admin 不返回敏感明文、密文、密钥引用或证书内容。
- 真实申请完成后可生成受中央服务商 profile 管理的租户支付配置。
- 最终通过一笔真实 1 分支付验证资金链路。
