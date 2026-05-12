# 租户积分计费系统分阶段执行步骤与验收标准

日期：2026-05-12

关联文档：

- `docs/2026-05-12-tenant-prepaid-credit-billing-implementation-plan.md`
- `docs/2026-05-12-tenant-credit-billing-phase1-backend-integration.md`

## 1. 推进原则

计费系统必须按阶段推进。任何阶段未完成验收，不允许进入下一阶段。

原因：

1. 计费涉及资金和客户权益，不能靠“功能看起来能用”上线。
2. 积分余额、冻结、扣费、流水必须保持一致。
3. 后续短信、视频、AI 都依赖同一套计费底座，一旦底座不稳，后续业务会重复返工。
4. 每个阶段都必须能独立回滚或关闭扣费开关。

## 2. 阶段总览

| 阶段 | 名称 | 目标 | 是否真扣费 |
| --- | --- | --- | --- |
| 阶段 0 | 准备与基线确认 | 确认现有日志、AI 路由、环境开关、测试租户 | 否 |
| 阶段 1 | 计费底座 | 账户、充值、流水、价格规则、billing event、RPC | 仅人工充值入账 |
| 阶段 2 | 影子计费 | 从现有日志生成 estimated 账单，不扣余额 | 否 |
| 阶段 3 | 短信扣费 | 短信成功后真实扣积分 | 是 |
| 阶段 4 | 视频转文本扣费 | 创建任务冻结，完成后按分钟扣费 | 是 |
| 阶段 5 | AI 试算 | AI 只生成 estimated 账单，观察 token 分布 | 否 |
| 阶段 6 | AI 真扣费 | AI 按 P95 门槛拦截，完成后扣费 | 是 |
| 阶段 7 | 运营增强 | 对账、告警、报表、过期和资源包预留 | 按能力 |

## 3. 全局验收闸门

每个阶段必须满足以下全局标准：

1. 数据库 migration 已执行到目标环境。
2. API typecheck 通过。
3. admin build 通过。
4. 本阶段涉及的接口有手工或脚本化验收记录。
5. 关键数据表无重复扣费、无负余额、无冻结大于余额。
6. 平台超管和租户权限隔离正确。
7. 错误码符合约定，前端能正确展示。
8. 有明确关闭开关或回滚方案。
9. 验收结论写入阶段执行记录文档。

不满足任一项，阶段状态为 `blocked`，不能进入下一阶段。

## 4. 阶段 0：准备与基线确认

### 4.1 执行步骤

1. 确认现有用量日志表：
   - `ai_call_logs`
   - `sms_send_logs`
   - `social_video_transcriptions`
2. 确认 AI 模型路由可用：
   - `ai_providers`
   - `ai_models`
   - `ai_scene_routes`
   - `/platform/ai-config`
   - admin `/platform/ai-models`
3. 确认 `ai_call_logs` 已具备：
   - `raw_usage`
   - `cached_input_tokens`
   - `reasoning_tokens`
4. 确认测试租户。
5. 确认环境开关命名：
   - `BILLING_CHARGE_ENABLED`
   - `SMS_CHARGE_ENABLED`
   - `SOCIAL_VIDEO_CHARGE_ENABLED`
   - `AI_CHARGE_ENABLED`
6. 确认低余额阈值：
   - `BILLING_LOW_BALANCE_THRESHOLD_CREDITS=5000`
   - `BILLING_CRITICAL_BALANCE_THRESHOLD_CREDITS=1000`

### 4.2 验收标准

1. 能在平台 admin 打开 AI 模型路由页面。
2. `marketing_page_create_fill` 已存在于 `ai_scene_routes`。
3. 一次 AI 调用能写入 `ai_call_logs`，并带上 `scene_code / provider_code / model_code`。
4. 测试租户 ID 已记录。
5. 阶段 1 migration 可以基于当前库直接执行。

### 4.3 阻断条件

- AI 路由仍有业务绕过，且无法记录 `provider_code / model_code`。
- 现有日志缺少 `tenant_id`，无法归属租户。
- 测试租户不可用。

## 5. 阶段 1：计费底座

### 5.1 执行步骤

1. 新增 migration：
   - `tenant_credit_accounts`
   - `tenant_credit_account_balances`
   - `tenant_credit_orders`
   - `tenant_credit_ledger`
   - `tenant_billing_events`
   - `tenant_pricing_rules`
2. seed 默认价格规则：
   - `sms_domestic_success`
   - `social_video_transcription_minute`
   - `ai_input_text_token`
   - `ai_output_text_token`
   - `ai_cached_input_token`
3. 新增 SQL RPC：
   - `billing_ensure_account`
   - `billing_manual_recharge`
   - `billing_freeze_credits`
   - `billing_unfreeze_credits`
   - `billing_charge_credits`
   - `billing_settle_event`
4. 新增后端模块：
   - `controllers/billing`
   - `schema/billing`
   - `repositories/billing`
   - `services/billing`
5. 新增平台接口：
   - `GET /platform/billing/summary`
   - `GET /platform/billing/tenants`
   - `POST /platform/billing/tenants/:tenantId/manual-recharge`
   - `GET /platform/billing/pricing-rules`
   - `POST /platform/billing/pricing-rules`
   - `PATCH /platform/billing/pricing-rules/:id`
   - `GET /platform/billing/ledger`
6. 新增租户接口：
   - `GET /billing/account`
   - `GET /billing/summary`
   - `GET /billing/ledger`
7. 新增小程序只读接口：
   - `GET /billing/account`
   - `GET /billing/feature-estimates`
8. admin 新增平台计费中心。
9. admin 新增租户账务中心。
10. 小程序接入余额展示和余额不足错误提示。

### 5.2 测试项

#### 数据库测试

1. 创建账户后：
   - `balance_credits = 0`
   - `frozen_credits = 0`
   - `available_credits = 0`
2. 人工充值 100 元：
   - `tenant_credit_orders.status = paid`
   - `tenant_credit_accounts.balance_credits` 增加 100000
   - `tenant_credit_ledger.direction = in`
3. 重复同一充值请求：
   - 不重复入账
   - 不重复写 ledger
4. 冻结 60 积分：
   - `frozen_credits` 增加 60
   - `available_credits` 减少 60
5. 释放 60 积分：
   - `frozen_credits` 回到原值
6. 扣费 50 积分：
   - `balance_credits` 减少 50
   - `total_consumed_credits` 增加 50
7. 余额不足扣费：
   - 返回 `TENANT_CREDITS_INSUFFICIENT`
   - 账户余额不变
   - 不写 out ledger

#### API 测试

1. 平台超管可访问 `/platform/billing/*`。
2. 普通租户不能访问 `/platform/billing/*`。
3. 租户只能访问自己的 `/billing/*`。
4. 小程序客户身份不能传 `tenant_id` 伪造查询其它租户。
5. 价格规则新增、停用、查询正常。
6. 手工充值接口能写平台审计日志。

#### 并发测试

1. 同一租户同时发起 10 次扣费，总扣费不能超过可用余额。
2. 同一 billing event 并发结算 10 次，只扣一次。
3. 冻结和扣费并发时，不允许出现 `frozen_credits > balance_credits`。

### 5.3 验收标准

1. 平台超管能给租户人工充值。
2. 充值、冻结、释放、扣费都能产生 ledger。
3. 账户余额、冻结积分、可用积分一致。
4. 价格规则可以配置和查询。
5. `billing_settle_event` 幂等。
6. admin 能展示平台和租户账务数据。
7. 小程序能读取余额和功能价格提示。
8. 所有错误码符合文档。
9. API typecheck 通过。
10. admin build 通过。

### 5.4 阻断条件

- 出现负余额。
- 出现 `frozen_credits > balance_credits`。
- 重复结算会重复扣费。
- 租户能看到其它租户账务数据。
- 手工充值无法审计。

## 6. 阶段 2：影子计费

### 6.1 执行步骤

1. 新增 billing worker。
2. worker 扫描：
   - `ai_call_logs`
   - `sms_send_logs`
   - `social_video_transcriptions`
3. 只生成 `tenant_billing_events(status=estimated)`。
4. 不调用 `billing_settle_event`。
5. admin 展示 estimated 账单和预计积分消耗。

### 6.2 测试项

1. 同一条 `ai_call_logs` 只生成一次 estimated event。
2. 同一条 `sms_send_logs` 只生成一次 estimated event。
3. 同一条 `social_video_transcriptions` 只生成一次 estimated event。
4. 缺少 token 的 AI 调用标记为异常，不估算扣费。
5. 缺少时长的视频转文本标记为异常。
6. worker 重跑不会重复生成 event。

### 6.3 验收标准

1. estimated event 数量与原始日志数量可对账。
2. 预计积分计算正确。
3. 所有 estimated event 有 `pricing_snapshot`。
4. admin 可以按租户、资源类型、状态查询。
5. worker 可重复运行且幂等。

### 6.4 阻断条件

- estimated event 重复生成。
- pricing rule 命中不稳定。
- raw usage 丢失。
- 异常数据未进入异常列表。

## 7. 阶段 3：短信扣费

### 7.1 执行步骤

1. 补齐 `sms_send_logs` 计费字段：
   - `delivery_status`
   - `billed`
   - `billed_at`
2. 明确供应商是否支持最终送达回执。
3. 短信发送前校验可用积分 >= 50。
4. 短信成功后生成 `tenant_billing_events(metric_code=sms_domestic_success)`。
5. `SMS_CHARGE_ENABLED=true` 时调用 `billing_settle_event`。
6. 失败、mock、disabled 不扣费。

### 7.2 测试项

1. 成功短信扣 50 积分。
2. 失败短信不扣费。
3. mock 短信不扣费。
4. disabled 短信不扣费。
5. 同一短信日志重复结算只扣一次。
6. 余额不足时发送前拦截。
7. `delivery_status=submitted_success_timeout` 能进入异常对账。

### 7.3 验收标准

1. 短信扣费金额正确。
2. 短信日志和 billing event 可一一对账。
3. 租户账务页能看到短信积分消耗。
4. 平台能看到短信扣费异常。
5. 关闭 `SMS_CHARGE_ENABLED` 后只试算不扣余额。

### 7.4 阻断条件

- 失败短信被扣费。
- 成功短信重复扣费。
- 余额不足仍能发送计费短信。
- 供应商回执口径没有记录。

## 8. 阶段 4：视频转文本扣费

### 8.1 执行步骤

1. 创建视频转文本任务时校验余额。
2. 按预估时长或最低 60 积分调用 `billing_freeze_credits`。
3. 任务完成后读取：
   - `billing_duration_seconds`
   - `billing_minutes`
   - `billable`
4. 生成 `tenant_billing_events(metric_code=social_video_transcription_minute)`。
5. 成功任务执行：
   - `billing_unfreeze_credits`
   - `billing_settle_event`
6. 失败任务只释放冻结积分。
7. 缓存复用不扣费。
8. 任务超时由定时任务释放冻结，并进入异常对账。

### 8.2 测试项

1. 30 秒视频按 1 分钟扣 60 积分。
2. 61 秒视频按 2 分钟扣 120 积分。
3. 失败任务释放冻结，不扣费。
4. 缓存复用不重复扣费。
5. 时长缺失不扣费，进入异常。
6. 余额不足无法创建计费任务。
7. 同一任务重复完成回调只扣一次。
8. 冻结超时能自动释放。

### 8.3 验收标准

1. 视频任务创建时有 freeze ledger。
2. 视频任务完成后有 unfreeze 和 out ledger。
3. `correlation_id` 能串联同一任务的冻结、释放、扣费。
4. 任务状态和账务状态一致。
5. admin 能查看视频扣费明细和异常。
6. 小程序余额不足提示正确。

### 8.4 阻断条件

- 失败视频被扣费。
- 缓存复用重复扣费。
- 冻结积分长期不释放。
- 任务成功但账务未结算且无异常记录。

## 9. 阶段 5：AI 试算

### 9.1 执行步骤

1. 确认所有 AI 调用都走 `aiGateway` 或至少写入 `ai_call_logs`。
2. worker 根据 `ai_call_logs` 生成 estimated event。
3. 按 `scene_code + provider_code + model_code` 命中价格规则。
4. 拆分生成：
   - `ai_input_text_token`
   - `ai_output_text_token`
   - `ai_cached_input_token`
5. `AI_CHARGE_ENABLED=false`，不扣余额。
6. 运行 1-2 周，统计 P50/P90/P95/P99 单次消耗。

### 9.2 测试项

1. 装修问答能生成 AI estimated event。
2. H5 AI 回填能生成 AI estimated event。
3. 短视频脚本 AI 能生成 AI estimated event。
4. 缺 token 的 AI 调用不收费，进入异常。
5. cached token 计费项只在 `cached_input_tokens > 0` 时生成。
6. raw usage 完整保留。
7. 同一 AI log 重跑 worker 不重复生成 event。

### 9.3 验收标准

1. AI estimated event 与 `ai_call_logs` 可对账。
2. AI 价格规则命中正确。
3. admin 能按场景、模型、租户查看 AI 预计积分。
4. 已形成 P95 统计报告。
5. 已确定每个主要 AI 场景的 `min_charge_credits`。

### 9.4 阻断条件

- AI 调用缺少 tenant 归属。
- AI 调用缺少 provider/model/scene。
- token usage 丢失比例过高且没有异常记录。
- P95 数据不足，无法配置前置余额门槛。

## 10. 阶段 6：AI 真扣费

### 10.1 执行步骤

1. 将主要 AI 场景配置 `min_charge_credits`。
2. 打开 `AI_CHARGE_ENABLED=true`。
3. AI 调用前校验可用积分 >= `min_charge_credits`。
4. 调用完成后根据真实 usage 生成 billing event。
5. 调用 `billing_settle_event` 实扣。
6. 余额不足返回 `TENANT_CREDITS_INSUFFICIENT`。
7. 保留失败和 token 缺失异常。

### 10.2 测试项

1. 余额充足时 AI 正常调用并扣费。
2. 余额不足时调用前拦截。
3. AI 供应商失败时不扣费。
4. AI 成功但无 token 时不扣费，进入异常。
5. 同一 AI log 重复结算只扣一次。
6. 不同模型命中不同价格规则。
7. 小程序客户 AI 消耗归属租户账户。

### 10.3 验收标准

1. AI 真扣金额与 token usage 一致。
2. AI 扣费明细可追溯到 `ai_call_logs.request_id`。
3. 租户账务页可看到 AI 积分消耗。
4. 小程序余额不足提示正确。
5. AI 扣费失败不影响已完成业务的异常记录。
6. 上线后 2 周内拦截率低于 1%，或有调价/门槛调整记录。

### 10.4 阻断条件

- AI 成功调用但未落账且无异常。
- AI 失败调用被扣费。
- 小程序客户 AI 未归属租户。
- 模型价格规则命中错误。

## 11. 阶段 7：运营增强

### 11.1 执行步骤

1. 新增余额预警。
2. 新增扣费失败通知。
3. 新增日账单汇总。
4. 新增月度对账导出。
5. 新增冻结超时释放定时任务。
6. 新增异常账单重试任务。
7. 评估积分过期和资源包。

### 11.2 测试项

1. 余额低于阈值能通知租户管理员。
2. 扣费失败能通知平台运维。
3. 日账单汇总与 ledger 汇总一致。
4. 异常重试不会重复扣费。
5. 冻结超时释放有 ledger 和异常记录。

### 11.3 验收标准

1. 平台可看到账务健康状态。
2. 租户余额风险可提前发现。
3. 账务异常可定位到源业务记录。
4. 对账报表可支撑人工核查。

## 12. 阶段推进记录模板

每个阶段完成时，必须新增执行记录：

```text
docs/YYYY-MM-DD-tenant-credit-billing-phase-X-execution-record.md
```

内容模板：

```md
# 租户积分计费系统阶段 X 执行记录

日期：
执行分支：
提交：

## 实施内容

- 

## 测试命令

- 

## 数据验收

- 

## API 验收

- 

## admin / 小程序验收

- 

## 遗留问题

- 

## 是否允许进入下一阶段

结论：允许 / 不允许
原因：
```

## 13. 最终上线前总验收

所有阶段完成后，正式上线前必须做总验收：

1. 随机抽取 5 个租户核对账户余额。
2. 随机抽取 20 条 ledger 核对源业务记录。
3. 随机抽取 20 条 billing event 核对价格快照。
4. 对短信、视频、AI 分别做成功、失败、余额不足、重复重试测试。
5. 关闭各计费开关验证能回到试算模式。
6. 平台审计能看到人工充值和价格配置操作。
7. 租户无法访问其它租户账务。
8. 小程序客户无法伪造 tenant_id。
9. 所有对账异常都有处理入口。
10. 生成上线验收报告。

未通过总验收，不允许打开全量真扣费。
