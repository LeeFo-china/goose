# 租户积分计费 Phase 6：AI 真扣费执行方案

日期：2026-05-13

关联文档：

- `docs/2026-05-12-tenant-prepaid-credit-billing-implementation-plan.md`
- `docs/2026-05-12-tenant-credit-billing-phased-execution-and-acceptance.md`
- `docs/2026-05-12-tenant-credit-billing-phase5-ai-shadow-billing-execution-report.md`

## 1. 当前状态

Phase 5 已完成 AI 试算能力：

- AI 调用可以写入 `ai_call_logs`。
- billing worker 可以从 `ai_call_logs` 生成 `tenant_billing_events(status=estimated)`。
- 已支持按 `scene_code + provider_code + model_code` 命中价格规则。
- 已支持拆分：
  - `ai_input_text_token`
  - `ai_output_text_token`
  - `ai_cached_input_token`
  - `ai_usage_missing_tokens`

但 Phase 5 执行记录显示当前不建议立即进入 Phase 6：

- 当前远端有效样本主要集中在 `social_video_script`，样本量不足。
- H5 AI 之前有租户归属缺失，修复后需要重新积累数据。
- `decoration_qa` 还缺少稳定的租户成功 token 样本。

因此 Phase 6 当前状态为：

```text
blocked：等待 AI 试算样本和 P95 门槛确认
```

## 2. Phase 6 目标

把 AI 从“只试算不扣费”切换为“调用前余额校验，调用后按真实 token 真扣费”。

核心目标：

1. AI 调用前按场景校验租户可用积分。
2. AI 调用完成后按真实 usage 扣减租户积分。
3. 扣费事件能追溯到 `ai_call_logs`。
4. 失败调用、无 token 调用不扣费，但进入异常账单。
5. 小程序和 admin 能正确展示余额不足、扣费明细和异常。

## 3. 进入 Phase 6 的前置条件

必须全部满足后才能执行：

1. AI 试算期至少运行 1 到 2 周。
2. 每个主要 AI 场景至少有 100 条成功租户样本。
3. 主要场景包括：
   - `decoration_qa`
   - `marketing_page_create_fill`
   - `marketing_page_block_fill`
   - `marketing_page_settings_fill`
   - `social_video_script`
4. 每个主要场景都有 P50/P90/P95/P99 统计。
5. 每个主要场景都确认 `min_charge_credits`。
6. `tenant_pricing_rules` 中 AI token 价格规则有效。
7. admin 平台计费中心能查看 AI 试算观察数据。
8. 微信小程序 AI 请求都能正确归属租户。
9. `AI_CHARGE_ENABLED` 当前仍为 `false`，未提前真扣。

任一条件不满足，不允许打开 AI 真扣费。

## 4. `min_charge_credits` 配置规则

Phase 6 不建议拍脑袋设置统一门槛。

推荐规则：

```text
min_charge_credits = ceil(P95 单次积分消耗 * 1.5)
```

如果某场景业务输入波动大，可用：

```text
min_charge_credits = ceil(P95 单次积分消耗 * 2.0)
```

配置优先级：

1. 租户定制规则。
2. 场景 + 模型规则。
3. 场景默认规则。
4. 平台 AI 默认规则。

配置位置建议：

- 第一版可以落在 `tenant_pricing_rules.min_charge_credits` 或等价字段。
- 如果当前表尚未支持该字段，应先补 migration。
- 不建议长期放环境变量，因为不同场景、模型、租户会不同。

## 5. 后端执行步骤

### 5.1 数据库与价格规则

1. 确认 `tenant_pricing_rules` 支持或补充：
   - `min_charge_credits`
   - `scene_code`
   - `provider_code`
   - `model_code`
   - `metric_code`
2. 为主要 AI 场景写入或更新门槛：
   - `decoration_qa`
   - `marketing_page_create_fill`
   - `marketing_page_block_fill`
   - `marketing_page_settings_fill`
   - `social_video_script`
3. 保证历史账单仍使用 `pricing_snapshot`，不被价格规则变更反向影响。

### 5.2 AI 调用前校验

AI 调用入口统一接入 billing service。

调用前：

```text
resolve tenant_id
resolve scene_code/provider_code/model_code
resolve min_charge_credits
query tenant available credits
if available < min_charge_credits:
  return TENANT_CREDITS_INSUFFICIENT
else:
  continue AI call
```

第一版 AI 不建议 freeze：

- AI 调用是秒级响应。
- 实际 token 消耗要调用完成后才知道。
- 前置门槛足以挡住明显余额不足。

后续如果出现大并发消耗透支，再考虑 AI freeze。

### 5.3 AI 调用完成后扣费

AI 成功完成后：

1. 写入 `ai_call_logs`，必须包含：
   - `tenant_id`
   - `scene_code`
   - `provider_code`
   - `model_code`
   - `prompt_tokens`
   - `completion_tokens`
   - `cached_input_tokens`
   - `raw_usage`
   - `request_id`
2. 生成 AI billing events：
   - input token event
   - output token event
   - cached input token event
3. `AI_CHARGE_ENABLED=true` 时调用 `billing_settle_event`。
4. 每个 event 必须幂等，重复 worker 或重复回调不能重复扣费。

### 5.4 异常处理

不扣费但要记录异常：

- AI 供应商调用失败。
- AI 成功但 token usage 缺失。
- `tenant_id` 缺失。
- `scene_code/provider_code/model_code` 缺失。
- 价格规则缺失。
- 扣费 RPC 失败。

异常事件建议：

| failure_code | 说明 |
| --- | --- |
| `AI_USAGE_MISSING_TOKENS` | 成功调用缺少 token |
| `AI_TENANT_MISSING` | 缺少租户归属 |
| `AI_PRICING_RULE_MISSING` | 未命中价格规则 |
| `AI_CHARGE_FAILED` | 扣费 RPC 失败 |

## 6. Admin 对接

平台计费中心需要支持：

1. AI 真扣费开关状态展示。
2. AI 场景 P95 观察数据。
3. 每个场景的 `min_charge_credits`。
4. AI 扣费明细：
   - 租户
   - 场景
   - 供应商
   - 模型
   - token 类型
   - token 数量
   - 积分
   - 状态
   - 源 `ai_call_logs.request_id`
5. AI 异常账单列表。
6. 余额不足拦截次数统计。

租户账务中心需要支持：

1. AI 消耗明细。
2. 按场景筛选。
3. 按时间筛选。
4. 展示扣费后的余额流水。

## 7. 微信小程序对接

小程序不允许传 `tenant_id` 决定扣费归属。

后端必须从当前客户/员工身份解析租户。

小程序需要处理：

| 错误码 | 处理 |
| --- | --- |
| `TENANT_CREDITS_INSUFFICIENT` | 展示余额不足，引导联系装修公司充值 |
| `TENANT_BILLING_DISABLED` | 展示服务暂不可用 |
| `AI_PRICING_RULE_MISSING` | 展示 AI 服务暂不可用 |

小程序 AI 功能入口建议展示简化提示：

```text
AI 功能会消耗装修公司账户积分
```

不要在小程序端展示复杂 token 价格。

## 8. 测试验收

### 8.1 数据验收

1. AI 成功调用后产生 `ai_call_logs`。
2. 成功调用后产生 `tenant_billing_events(status=settled)`。
3. `tenant_credit_ledger.direction=out`。
4. ledger 能通过 `billing_event_id` 或 `correlation_id` 追溯到 AI log。
5. 同一 AI log 重复结算不重复扣费。

### 8.2 余额验收

1. 余额充足：AI 正常调用并扣费。
2. 余额低于门槛：调用前拦截，不调用供应商。
3. 余额刚好等于门槛：允许调用。
4. 扣费后余额正确减少。
5. 不允许出现负余额。

### 8.3 异常验收

1. 供应商失败不扣费。
2. token 缺失不扣费，进入异常事件。
3. 价格规则缺失不扣费，进入异常事件。
4. 扣费 RPC 失败后有异常记录，方便重试或人工处理。

### 8.4 多端验收

1. 微信小程序客户 AI 扣到客户所属租户。
2. 微信小程序员工 AI 扣到员工所属租户。
3. 租户 admin H5 AI 扣到当前租户。
4. 平台超管 AI 不扣到任何租户，或明确标记 `billable=false`。

## 9. 灰度与回滚

建议灰度顺序：

1. 内部测试租户。
2. 1 个真实低频租户。
3. 3 到 5 个租户。
4. 全量。

回滚开关：

```text
AI_CHARGE_ENABLED=false
```

关闭后：

- AI 调用继续可用。
- 继续生成 estimated event。
- 不再真实扣余额。

回滚后需要检查：

- 是否存在扣费失败 event。
- 是否存在 AI 调用成功但未落账的异常。
- 是否需要人工补偿积分。

## 10. 上线后观察

上线后至少观察 2 周。

观察指标：

1. AI 余额不足拦截率。
2. AI 扣费失败率。
3. AI token 缺失率。
4. 每租户 AI 消耗积分。
5. 每场景 P95 是否明显变化。
6. 用户投诉或客服反馈。

调整规则：

- 拦截率 > 1%，评估是否门槛过高。
- token 缺失率 > 0.5%，优先修日志。
- 扣费失败率 > 0.1%，优先查 billing RPC 和并发。

## 11. 是否现在执行

当前不建议执行 Phase 6。

原因：

1. Phase 5 报告显示样本量不足。
2. 主要场景 P95 尚未形成正式报告。
3. 每个主要 AI 场景的 `min_charge_credits` 尚未确认。

当前建议：

```text
继续运行 Phase 5 AI 试算
补齐主要场景样本
形成 P95 和门槛配置
再进入 Phase 6
```

