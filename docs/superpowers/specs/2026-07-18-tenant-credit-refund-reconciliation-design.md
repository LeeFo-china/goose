# 租户积分充值退款主动对账设计

## 状态

方案 A 已确认：复用现有 `billing-reconcile-worker`，不新增独立退款
worker；本轮只在本地构建和验证，不 push、不 merge、不部署，也不修改
orange。

## 背景

充值退款执行已经支持普通商户和服务商 APIv3，且在首次退款结果不确定、
查单返回 `RESOURCE_NOT_EXISTS` 时，会用相同参数和相同
`out_refund_no` 幂等重试。但当前退款终态仍主要依赖微信回调：若所有回调
丢失，微信侧可能已经退款成功，本地申请却长期停留在 `refunding`，积分也
不会反冲；若微信从未受理，活动退款申请也会长期阻止重新申请。

微信支付普通商户与合作伙伴退款最佳实践均要求通过退款回调和主动查单共同
确认终态。申请退款后推荐每分钟查询一次；超过 5 分钟仍处理中时，逐步降低
频率。

## 目标

1. 为 `refunding` 申请提供可恢复、可并发、可审计的主动对账。
2. 多实例 worker 只能由一个租约持有者处理同一申请。
3. 微信返回 `SUCCESS` 时复用现有原子积分反冲 RPC，不复制资金逻辑。
4. 微信返回 `PROCESSING`、`CLOSED`、`ABNORMAL` 或不确定错误时，按官方
   状态语义收敛，不制造重复退款。
5. 所有被业务信任的 APIv3 应答先完成验签、时钟偏差检查和字段绑定校验。
6. 修复执行入口申请与订单分两次进入 `refunding` 的原子性缺口。
7. 所有列表和 claim 均有明确上限，不引入新依赖、缓存、队列或 Redis。

## 非目标

- 不改变小程序退款申请接口及 `refund_action.disabled_reason` 契约。
- 不自动处理 `ABNORMAL` 的异常退款银行卡选择；该状态继续保留人工处理入口。
- 不做日终微信资金账单对账；本设计只收敛单笔退款状态。
- 不在本轮 push、merge、部署或修改 orange。

## 方案选择

### 采用：扩展现有 billing worker

`billing-reconcile-worker` 的 tick 增加退款对账批次。订阅检查与退款对账分别
捕获错误，一个子任务失败不阻断另一个；进程级 `running` 防重入与数据库租约
共同保证安全。补充 package 启动脚本和部署清单配置，但本轮不启动远端进程。

### 未采用：独立退款 worker

隔离性更强，但需要新增部署单元、监控和发布编排；当前吞吐量不需要额外进程。

### 未采用：仅后台手工对账

无法兜底回调永久丢失或无人值守场景，不满足资金链路主动收敛要求。

## 数据模型与 migration

新增一个 migration，所有数据库变更仅通过该文件完成。

`tenant_credit_refund_requests` 新增：

- `reconcile_next_at timestamptz NULL`：下一次允许 claim 的时间；
- `reconcile_attempt_count integer NOT NULL DEFAULT 0`：已 claim 次数；
- `reconcile_claim_token uuid NULL`：当前租约令牌；
- `reconcile_claim_expires_at timestamptz NULL`：租约过期时间；
- `reconcile_last_error text NULL`：最近一次稳定错误码，最长 200 字符；
- `reconcile_last_checked_at timestamptz NULL`：最近一次完成微信查询的时间。

约束要求 claim token 与过期时间同时为空或同时非空，attempt count 非负，最近
错误不超过 200 字符。约束名固定为
`tenant_credit_refund_reconcile_attempt_count_check`、
`tenant_credit_refund_reconcile_lease_check` 和
`tenant_credit_refund_reconcile_last_error_check`，供 Task 7 精确验收。
新增部分索引：

```sql
(reconcile_next_at, id)
WHERE status = 'refunding' AND reconcile_next_at IS NOT NULL
```

索引只覆盖活动退款，claim RPC 固定 `LIMIT <= 100`，使用
`FOR UPDATE SKIP LOCKED`，避免全表扫描与多实例重复处理。

migration 使用一次受控 DML 修复历史状态：所有历史 `status='refunding' AND
reconcile_next_at IS NULL` 申请统一写入同一个事务级 `now()`，使其立即进入 claim。
同时只修复旧执行入口可能留下的安全镜像缺口：申请仍为 `refunding` 且订单
`refund_status IS NULL` 或为 `'approved'` 时，将镜像设为 `refunding`。绝不覆盖
`refunded`、`failed`、`rejected` 或其他订单镜像状态。该 DML 只作用于活动退款，
不创建退款、不移动积分、不写积分流水。

migration 同时提供 service-role-only RPC：

1. `billing_begin_wechat_recharge_refund(...)`
   - 锁定退款申请和充值订单；
   - 校验申请状态属于 `approved|failed`、订单仍为 `paid`；
   - 在同一事务内将申请和订单镜像状态改为 `refunding`；
   - 写入稳定 `out_refund_no`，并将 `reconcile_next_at` 设为一分钟后。
2. `billing_claim_wechat_recharge_refunds(...)`
   - `p_limit` 必须在 1 到 100；租约必须在 30 到 900 秒；
   - claim 到期任务或回收已过期租约；
   - 设置新 token、租约时间并将 attempt count 加一；
   - 只返回 `id`、`tenant_id`、`order_id`、`reason`、
     `requested_amount_fen`、`out_refund_no`、`wechat_refund_id`、
     `refund_amount_fen`、`reconcile_attempt_count`，关联订单由 repository 一次
     `.in(...)` 批量加载。
3. `billing_reschedule_wechat_recharge_refund(...)`
   - 仅当前 claim token 可以清租约并写下一次时间、最近错误和元数据；
   - 若回调已经把申请改成终态，则返回空结果并按幂等成功处理。
4. `billing_close_wechat_recharge_refund(...)`
   - 仅处理微信明确返回 `CLOSED` 的申请；
   - 同一事务把申请与订单镜像状态改为 `failed` 并清租约；
   - 释放活动申请唯一约束，使人工充值后可用新退款单号重新申请。
5. `billing_apply_wechat_recharge_refund_callback_state(...)`
   - 仅供 callback 应用 `CLOSED|ABNORMAL`，不要求 worker claim token；
   - 锁定申请与订单并保留已由其他路径写入的终态。
6. `billing_confirm_claimed_wechat_recharge_refund(
   uuid, uuid, text, text, integer, timestamptz, jsonb)`
   - 仅供 worker 的 `SUCCESS` finalize，必须匹配 `refunding` 和当前 claim token；
   - 回调或其他租约持有者先完成时返回 SQL `NULL`，repository/service 将其视为
     幂等竞争而不是失败；
   - 持有申请行锁后，在同一事务内调用兼容确认 RPC，并传入
     `notification_id = NULL`，不复制资金逻辑。
   - `request_id` 或 `claim_token` 为 NULL 属于调用错误，必须先抛稳定异常；只有
     参数有效但 token/状态不再匹配时才返回 SQL `NULL` 表示幂等竞争。

现有 `billing_confirm_wechat_recharge_refund(
uuid, text, text, integer, timestamptz, uuid, jsonb)` 保留为 callback SUCCESS
兼容入口并做加固：

- `p_notification_id` 继续接收 callback 的真实通知 UUID；只有上面的 claimed worker
  包装 RPC 在内部传 `NULL`；
- `latest_notification_id` 使用 `coalesce`，不被主动查单清空；
- 成功终态同时清除对账租约和下一次执行时间；
- 回调与 worker 并发时仍依靠申请行锁、状态和唯一反向流水保持幂等。

全部七个 RPC 使用固定 `search_path`，撤销 `PUBLIC/anon/authenticated` 权限，只授权
`service_role`。migration 注释中记录回滚顺序：先停止 worker，再删除 RPC/索引，
最后仅在无活动租约时删除列；绝不自动反冲已经完成的退款或积分流水，也不自动
撤销历史 due-time backfill 或安全订单镜像修复，剩余活动退款必须逐笔核对。

## 应答可信边界

新增聚焦的 APIv3 应答读取器，供预下单、支付查单、关闭订单、申请退款和退款
查单复用：

1. 使用 `response.text()` 保留未经修改的原始 body；
2. 要求 `Wechatpay-Timestamp`、`Wechatpay-Nonce`、`Wechatpay-Serial`、
   `Wechatpay-Signature` 完整；
3. serial 必须等于 secret bundle 的微信支付公钥 ID；
4. timestamp 与本机时间偏差不得超过 5 分钟；
5. 使用已有 RSA-SHA256 验签函数验证
   `timestamp + "\n" + nonce + "\n" + rawBody + "\n"`；
6. 验签通过后才解析 JSON；缺字段、签名探测流量或验签失败均丢弃应答并返回
   稳定 error-factory 错误。

gateway 所有网络调用使用共享的有界 fetch 包装器，默认 10 秒超时，可在测试中
注入。网络错误和超时映射为稳定业务错误；申请退款的调用方仍把这类结果视为
“结果不确定”，不能直接落 `failed`。

## 微信退款响应绑定

申请退款、退款查单和退款成功回调在进入持久化或积分 RPC 前，统一校验：

- `out_refund_no` 等于本地稳定退款单号；
- `refund_id` 非空，已有值时必须相同；
- `transaction_id`、`out_trade_no` 等于充值订单；
- `amount.refund` 等于申请退款金额；
- `amount.total` 等于本地已支付金额；
- 申请退款和退款查单 API 应答必须包含 `amount.currency=CNY`；官方普通商户与合作
  伙伴退款回调解密资源不定义 `amount.currency`，回调在校验文档定义的退款/交易
  ID、退款/订单金额和商户身份后，按本地产品绑定隐含为 `CNY`；若扩展回调显式
  携带 `amount.currency`，则非 `CNY` 必须拒绝；
- `status` 只能是 `PROCESSING|SUCCESS|CLOSED|ABNORMAL`；
- API 请求按订单的支付配置构造并签名；普通商户请求绑定 `mchid`，服务商请求
  绑定 `sp_mchid` 与 `sub_mchid`，不要求应答回显契约未定义的商户字段；
- 回调中官方定义的 `mchid`，或 `sp_mchid` 与 `sub_mchid`，必须与订单支付配置
  一致；`event_type` 与解密资源状态也必须一致，不能用“任一字段成功”代替一致性。

字段缺失或不一致时保留 `refunding`、记录稳定错误并重试/告警，不执行积分反冲。

## 对账数据流

每个 tick 默认 claim 20 条，配置最大值 100：

1. service 使用精确 claim 时间计算 120 秒租约截止时间。单行最坏预算绑定 gateway
   已导出的 10 秒默认超时，按“查单 10 秒 + 同参退款 10 秒 + finalize 10 秒余量”
   固定为 30 秒；每行开始和调用微信查单前都读取并校验新时间，剩余时间不足时
   立即停止顺序批次，当前及后续 claim 留待租约自然过期后回收，不再加载密钥、
   调微信或伪造 checked time。
2. repository 调 claim RPC，批量加载订单与原支付配置；配置必须按订单的
   `payment_config_id` 精确读取，不能使用后来切换的活动配置。
3. service 加载对应 secret bundle，调用退款查单。查单返回
   `RESOURCE_NOT_EXISTS` 后、同参调用 `requestRefund` 前再次读取时间；剩余时间
   少于“退款请求 10 秒 + finalize 10 秒余量”时不再发起退款，而用当前 token、
   实际查单完成时间和稳定错误
   `BILLING_RECHARGE_REFUND_RECONCILE_LEASE_BUDGET_EXHAUSTED` 重排。
4. 严格验签并绑定响应后按状态处理：
   - `SUCCESS`：worker 调用 token-gated
     `billing_confirm_claimed_wechat_recharge_refund`，由它在同一事务复用现有确认
     RPC，原子扣减积分、写唯一反向流水并更新申请/订单；callback SUCCESS 仍调用
     `billing_confirm_wechat_recharge_refund` 并传真实通知 UUID；
   - `PROCESSING`：保持 `refunding` 并按退避表重排；
   - `CLOSED`：调用 close RPC 原子关闭本地镜像，允许重新申请；
   - `ABNORMAL`：保持 `refunding`，30 分钟后再查并记录需人工处理；
   - `RESOURCE_NOT_EXISTS`：以原 `transaction_id`、金额、原因和
     `out_refund_no` 同参重试申请退款一次；成功后保存并重排，仍不确定则保持
     `refunding`；
   - 其他网络、验签、限流或 5xx：保留 `refunding`，写稳定错误并重排。
   每次 provider 响应后、写入 finalize 或重排前都重新读取并校验时间；
   `checked_at`、metadata 时间和下一次退避均以该行实际完成时间为基准，不能复用
   batch 开始时间。`ABNORMAL` 重排若首次数据库调用抛错，只能用完全相同的
   30 分钟时间、错误码和 ABNORMAL metadata 再尝试一次，不能降级为通用退避。
5. 所有 finalize 都携带 claim token。回调先完成时，worker 的 finalize 返回空，
   视为幂等竞争失败，不覆盖终态。

退避表以 claim 次数计算：

- 第 1 至 5 次：每 1 分钟；
- 第 6 次：5 分钟；
- 第 7 次：10 分钟；
- 第 8 次：20 分钟；
- 第 9 次及以后：30 分钟。

资金任务不因达到固定次数而永久放弃。每次只处理有界批次，失败任务不会阻塞
后续任务。

## 组件边界

- `repository`：claim/finalize RPC、按 ID 批量加载申请/订单/支付配置；
- `refund reconciliation service`：单笔状态机、响应绑定、退避计算和批次汇总；
- `wechat gateway`：请求签名、应答验签、超时和原始协议错误；
- `billing-reconcile-worker`：定时、并发防重入、调用独立批次并输出结构化摘要；
- callback service：回调验签/解密后复用相同绑定校验；SUCCESS 调用兼容确认 RPC，
  CLOSED/ABNORMAL 调用 callback state RPC，不进入 worker claimed RPC。

不在 controller 中放对账逻辑，不为 worker 增加公开 HTTP 接口。

## 可观测性与隐私

worker 每个 tick 输出 claimed、success、processing、closed、abnormal、rescheduled、
failed 计数和耗时。单笔错误只记录 request ID、order ID、out refund no、稳定错误码
及微信 `Request-ID`；不记录私钥、APIv3 key、Authorization、完整响应或登录凭证。

## 测试与验收

1. SQL contract tests：列/约束/索引、历史 active backfill 与安全镜像修复、
   `LIMIT <= 100`、30..900 秒租约、最小 claim 返回字段、`SKIP LOCKED`、token
   finalize 与 NULL 参数拒绝、七个 RPC 的 service-role 权限、原子
   begin/close/callback/confirm。
2. repository tests：分页/批量加载，无 N+1，配置按 `payment_config_id` 读取。
3. gateway tests：普通商户与服务商路径、有效/缺失/过期/错误/SIGNTEST 签名、
   timeout/network mapping、Request-ID。
4. domain tests：所有字段匹配与不匹配、四种退款状态、事件/状态冲突。
5. service tests：回调丢失后 SUCCESS 主动确认、PROCESSING 退避、CLOSED 关闭、
   ABNORMAL 保持、RESOURCE_NOT_EXISTS 同参重试、双重不确定、租约竞争。
6. worker tests：tick 防重入、批次上限、订阅与退款子任务互不阻断、结构化摘要。
7. 回归：退款执行、退款回调、gateway、稳定套件和 `bun run api:check`。
8. migration：应用前列出待执行文件；应用到已授权 dev 后运行
   `supabase migration list`，确认 Local/Remote 对齐。禁止手工 DDL/DML。
9. 本轮不执行真实退款；如以后执行，只使用明确测试订单和最小金额。

## 完成标准

- 回调完全丢失时，worker 能把微信 `SUCCESS` 收敛为本地 `refunded` 和唯一反向
  积分流水；
- 多 worker 实例不会同时处理同一申请；
- 不可信或不匹配的微信应答不能进入资金 RPC；
- `CLOSED`、`ABNORMAL`、不确定错误符合官方状态语义；
- 所有查询有界，migration 可审计，完整验证通过，release worktree 干净；
- 未 push、未 merge、未部署、未修改 orange。
