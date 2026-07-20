# Phase 9 支付就绪、配置来源与预下单恢复加固

日期：2026-07-20

## 范围

本轮完成真实平台直连充值和租户服务商支付前的五项工作：

1. 对平台支付配置、目标租户开通申请和回调地址执行只读就绪核查。
2. 修复项目微信支付订单在付款人 openid 缺失或预下单失败后的不可恢复问题。
3. 增加 APIv3 profile 验证、脱敏验证证据和只读就绪检查。
4. 将租户服务商配置绑定到平台中央 profile，并在运行时校验来源一致性。
5. 使用数据库行锁、配置版本 CAS 和原子 RPC 防止配置轮换与建单竞态。

本轮已执行两条 additive migration，没有创建真实微信支付订单，也没有手工修改远端业务状态。

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

### 首次建单并发冲突

同一 workflow task 的两个首次请求可能同时通过 pending 查询，随后由数据库唯一索引裁决其中一个请求。旧实现会把该 `23505` 当作数据库异常返回 500。

修复后，direct merchant insert 和服务商原子 RPC 都只把
`wechat_payment_orders_pending_task_unique_idx` 冲突映射为稳定的
`409 WECHAT_PAY_PENDING_ORDER_CONCURRENT`。service 收到该冲突后会重新读取胜出的 pending 订单：已有 `prepay_id` 时复用既有幂等校验并在本地重签；`prepay_id` 仍为空时保留原 409，且不发起第二次微信预下单。调用方应稍后使用完全相同的请求参数重试。若冲突后查不到订单，同样保留原错误，不吞掉异常。

### 配置就绪校验不完整

订单写入前现在统一检查：

- 配置状态为 `active`。
- `merchant_id`、`app_id`、密钥引用、证书序列号和回调地址均已配置。
- `enabled_channels` 包含 `project_payment`。
- 服务商子商户模式具有 `sub_mchid`。
- 服务商子商户进件状态为 `opened`。
- AppID 授权或绑定状态为 `bound`。
- 回调地址必须使用 HTTPS、包含非根路径、长度不超过 256 字符，且不能带 query、fragment、userinfo，不能使用 IP、`localhost` 或单标签内部主机名。

新订单在写入前会先加载密钥包。密钥引用无效、密钥包缺失或无法解密时不会产生 pending 订单。

### APIv3 验证和密钥版本绑定

平台支付 profile 现在通过以下接口执行只读验证：

```http
POST /platform/payment/wechat-pay/profiles/:profileCode/validate
GET /platform/payment/wechat-pay/readiness
```

验证使用官方 `GET /v3/certificates` 探测签名身份。数据库只保存稳定错误码、固定的脱敏提示、
微信 Request-ID 和验证时间，不保存原始响应、私钥、APIv3 key 或完整证书内容。

每次保存密钥包都会生成新的不透明 `secret_bundle_revision`，并将 profile 重置为
`unchecked`。只有 profile 与实际加载的密钥包 revision 完全一致且最新验证为 `valid`，
运行时才允许创建订单。公钥模式无法通过证书响应解密证明 APIv3 key 内容，因此验证证据会明确记录
`api_v3_key_probe=format_only`；APIv3 key 的最终真实性仍需由合法支付回调解密或真实支付闭环证明。

### 服务商配置中央来源和原子建单

- 平台 `tenant_service_provider` profile 是服务商商户号、AppID、证书、密钥引用、回调地址和渠道的唯一来源。
- 租户激活只保存 `sub_mchid`、进件/AppID 绑定状态及中央 profile 快照，不再接收客户端传入的服务商公共配置。
- 租户 Admin 对中央托管的服务商配置只读；租户 API 会拒绝创建或修改服务商模式配置，返回 `409 WECHAT_PAY_CONFIG_PLATFORM_MANAGED`。租户直连商户的非敏感资料仍按原权限管理，内部 secret locator 不再由租户 API 读写。
- 每次服务商项目建单都会重新核对中央 profile 的状态、验证时间、渠道、密钥 revision 和租户来源快照。
- 原子建单 RPC 固定按“中央 profile -> 租户配置”的顺序加行锁，并同时校验中央 guard version 与租户 `updated_at`。
- 存在关联 pending 充值或项目订单时，中央 profile 和对应密钥包禁止轮换，避免订单签名来源发生漂移。

### 审查收口

- 平台 profile 响应不再返回内部 `secret_setting_key`；Admin 也不保存或渲染该字段。
- 租户支付配置响应只返回 `has_encrypted_config_ref`，不再返回内部 `encrypted_config_ref`；租户更新 schema 和 Admin 表单也不再接受该 locator，保存其他字段只保留既有数据库值。
- 平台充值运营页已移除不兼容脱敏响应的旧支付配置编辑器，只保留状态摘要并跳转到系统设置中的统一 profile、密钥包和验证流程。
- `database.ts` 已同步完整 `platform_payment_configs` 表、租户配置来源外键和服务商原子建单 RPC 类型；平台配置 repository 和项目支付 repository 均不再使用自定义 untyped 查询或 RPC client。
- Admin 验证按钮在请求期间禁用。若商户资料或密钥保存与验证请求重叠，后端 `updated_at` CAS 会拒绝旧验证结果；readiness 查询同时使用 latest-wins 协调器，因此不会由旧响应覆盖新配置。
- 微信支付公钥模式下，官方签名响应只能证明商户签名身份和公钥验签链路；`api_v3_key_probe=format_only` 只证明 APIv3 key 长度/格式，不能替代真实回调解密。该限制是已接受的上线前残余风险，必须通过一分钱支付和合法回调闭环解除。

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

- `platform_direct_recharge` 已配置并处于 `active`，但 migration 后尚未重新保存密钥包，
  `secret_bundle_revision` 为空且验证状态为 `unchecked`，因此 readiness 明确为未就绪。
- 当前没有 `tenant_service_provider` 平台配置记录。

代码已禁止新的租户激活继续信任人工传入的服务商公共资料；必须先在平台 Admin 创建并验证
`tenant_service_provider` profile，再由进件激活动作生成租户配置。

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

代码与数据库侧已具备验证、门禁、来源追溯和安全重试能力，但当前 profile 和目标租户仍不满足真实小额支付条件。必须按顺序完成：

1. 轮换此前曾在聊天、文档或 secret manager 之外暴露的商户私钥、APIv3 key 和回调解密 key。
2. 在平台 Admin 重新保存 `platform_direct_recharge` 密钥包，再执行 profile 验证直至 readiness 为 ready。
3. 在平台 Admin 创建 `tenant_service_provider` profile、保存轮换后的服务商密钥包并验证为 ready。
4. 平台审核最新开通申请，在微信支付侧完成进件并回填新的 `sub_mchid`，确认 AppID 状态为 `bound`。
5. 通过平台 Admin 激活租户配置；服务商统一小程序模式保持租户 `sub_app_id=null`，禁止手工改库。
6. 准备 pending 收款 workflow task，先完成平台直连一分钱充值 smoke，再完成租户服务商一分钱项目收款 smoke。
7. 分别核对订单、微信 `transaction_id`、回调去重、财务流水/应收分配、积分流水和 Admin 可见性。

## 数据库 migration 与权限核验

已执行并纳入版本控制：

- `20260720223000_platform_payment_validation_readiness.sql`
- `20260720224000_platform_payment_secret_bundle_revision.sql`

远端核验结果：

- Local/Remote migration version 完全对齐。
- `secret_bundle_revision`、pending 项目订单索引、配置触发器和原子建单 RPC 均已存在。
- RPC 包含中央/租户行锁及双重 CAS；配置和密钥 guard 均覆盖项目 pending 订单。
- 原子 RPC 仅 `service_role` 可执行，`authenticated` 与 `anon` 均无执行权限。
- 生成类型已依据远端 catalog 精确同步 `platform_payment_configs` 全部 27 个字段、2 个外键，以及本阶段新增的租户来源外键和项目支付 RPC。Supabase Management API 对历史 project id 返回 `Project must be active and healthy`，而 `--db-url` 全量生成依赖本机 Docker；因此本轮没有用空输出覆盖生成文件，而是对照远端 `information_schema`、约束目录和已执行 migration 同步，并通过 typed repository 与 API typecheck 验证。

回滚必须使用新的 forward migration：先暂停微信建单并部署不依赖新字段/RPC 的代码，再恢复旧函数和触发器；
确认没有依赖后才能删除索引、外键和 nullable 字段。禁止直接回退远端 migration 或手工执行 DDL。

此前发现的 `platform_partner_member_rebind_requests` 和 `tenant_credit_refund_requests` RLS
问题已由 `20260720120000_harden_sensitive_service_role_tables_rls.sql` 处理，不再属于本阶段阻塞项。

## 验收证据

- openid schema 和 service 双重校验测试。
- pending 无 `prepay_id` 的预下单恢复测试。
- 已有 `prepay_id` 的本地重签测试。
- 金额/openid 等幂等冲突测试。
- 支付配置切换阻断测试。
- 服务商小程序 `sub_app_id=null` 就绪测试。
- 同一 workflow task 首次并发建单的唯一约束恢复测试。
- 严格回调地址规则测试。
- 租户服务商配置只读和 API 拒绝修改测试。
- Phase 9 API 变更测试：39 个文件，376 pass，0 fail。
- Phase 9 Admin 变更测试：4 个文件，34 pass，0 fail。
- `bun run api:check` 通过。
- `bun run admin:check` 通过。
- 仓库稳定测试：589 pass，2 个既有契约失败。发布 migration 预检测试硬编码期望 10 个显式事务 migration、实际为 16 个；官网 Nginx 切换测试期望 2 个 server block、实际为 4 个。两项均已在 main 工作区复现，本分支没有修改对应测试或部署配置。
- 远端 migration list 和数据库目录对象/权限核验通过。
- 远端查询全程只返回状态和布尔字段，没有读取或输出商户号、证书、私钥或密钥正文。
