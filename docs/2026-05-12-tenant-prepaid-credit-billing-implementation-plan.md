# 租户预付费积分计费系统落地方案

日期：2026-05-12

## 1. 目标

为多租户系统上线统一收费能力，覆盖：

- AI token
- 短信发送
- 视频转文本
- 后续可扩展的图片生成、语音合成、外部搜索等计费项

采用“租户先充值购买积分，再按用量扣减积分”的模式，保证：

1. 租户余额可见。
2. 每次扣费可追溯。
3. 平台可以灵活调价。
4. admin 和微信小程序都能感知余额、价格和扣费结果。
5. 后续支持促销积分、赠送积分、补偿积分、套餐包。

## 2. 结论

### 2.1 采用积分制是对的

建议采用：

- **租户充值购买积分**
- **所有计费项统一折算为积分扣减**
- **内部保留原始用量和原始成本，不直接只存“扣了多少积分”**

这样可以兼容：

- 不同供应商价格变化
- 不同模型价格差异
- 促销活动
- 赠送余额
- 账单追溯和人工补偿

### 2.2 你当前的三条价格建议需要调整

当前口径：

- 短信 1 条 5 积分
- 1k token 100 积分
- 视频转文本 1 秒 1 积分

问题：

1. **短信 5 积分是否合理，取决于积分汇率。**
2. **token 不适合统一按“1k token 一个价”计费。**
3. **视频转文本不建议按秒计费，建议按分钟向上取整。**

最佳实践不是“所有资源都拍成一个粗口径”，而是：

- 前台对客户展示简单价格
- 后台按真实资源维度结算

## 3. 推荐计费策略

## 3.1 积分汇率

建议第一期采用：

- **1 元 = 1000 积分**

原因：

1. 能覆盖低单价资源，不容易出现大量小数。
2. 短信、token、分钟都可以用整数积分表达。
3. 后续赠送、补偿、营销活动更灵活。

不建议：

- 1 元 = 100 积分

因为 AI input token、缓存 token、ASR 分钟成本会频繁出现小数积分，不利于实现。

## 3.2 推荐售价口径

### A. 短信

建议第一期：

- **国内短信成功发送 1 条 = 50 积分**

说明：

- 2026-05-12 查看腾讯云短信官网，国内短信套餐大约 `0.043-0.047 元/条`。
- 按 `1 元 = 1000 积分` 折算，成本大约 `43-47 积分/条`。
- 对外卖 `50 积分/条`，实现简单，毛利空间合理。

结论：

- **短信按成功条数扣费**
- **失败短信不扣费**
- **国际短信、营销短信后续单独价格表**

### B. AI

不建议：

- 所有模型统一 `1k token = 100 积分`

建议：

- **按模型档位 + 输入/输出 token 分开计费**

第一期用户侧可以简化展示为“AI 能力消耗积分”，但系统内部必须分开记：

- input tokens
- output tokens
- cached input tokens
- tool calls

推荐第一期默认价格模板：

| 计费项 | 推荐售价 |
| --- | --- |
| 基础模型 input 1k tokens | 10 积分 |
| 基础模型 output 1k tokens | 50 积分 |
| 基础模型 cached input 1k tokens | 1 积分 |
| 标准模型 input 1k tokens | 40 积分 |
| 标准模型 output 1k tokens | 180 积分 |
| 标准模型 cached input 1k tokens | 4 积分 |

说明：

1. 这里的“基础模型 / 标准模型”不是写死供应商型号，而是平台价格档位。
2. 具体模型和价格映射由后台配置，例如：
   - `gpt-5.4-mini` -> 基础模型
   - `gpt-5.4` -> 标准模型
3. 后续更换模型，只改价格规则，不改扣费架构。

结论：

- **AI 按真实 usage 扣积分**
- **不采用统一 1k token 固定价**

### C. 视频转文本

不建议：

- 按秒扣费，例如 `1 秒 1 积分`

建议：

- **按分钟向上取整**
- **1 分钟 = 60 积分**

计费公式：

```text
billing_minutes = max(1, ceil(duration_seconds / 60))
credits = billing_minutes * 60
```

说明：

1. 2026-05-12 查看腾讯云 ASR 官网，录音文件识别资源包约 `72 元 / 60 小时`，折合约 `0.02 元/分钟`。
2. `60 积分/分钟` 等于 `0.06 元/分钟`，能覆盖：
   - ASR 成本
   - 抖音媒体解析
   - 存储和任务调度
   - 一定平台毛利
3. 计费单位按分钟，更符合客户理解，也更适合账单展示。

结论：

- **视频转文本按完成后的时长分钟计费**
- **缓存复用不重复扣费**
- **失败任务不扣费**

## 4. MVP 计费规则总表

第一期建议直接落地如下：

| 资源 | 扣费规则 | 扣费时机 |
| --- | --- | --- |
| 国内短信 | 成功 1 条 50 积分 | 收到成功结果后 |
| AI input token | 按模型价格表试算，试运行后再真扣 | 调用完成后 |
| AI output token | 按模型价格表试算，试运行后再真扣 | 调用完成后 |
| AI cached input token | 按模型价格表试算，试运行后再真扣 | 调用完成后 |
| 视频转文本 | 60 积分 / 分钟，向上取整 | 任务完成后 |

## 5. 数据模型

当前系统已有：

- `ai_call_logs`
- `social_video_transcriptions`
- `tenant_usage_daily`

需要新增 5 张核心表。

### 5.1 `tenant_credit_accounts`

租户积分账户。

```sql
create table public.tenant_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id),
  balance_credits bigint not null default 0,
  frozen_credits bigint not null default 0,
  total_recharged_credits bigint not null default 0,
  total_consumed_credits bigint not null default 0,
  total_granted_credits bigint not null default 0,
  status text not null default 'active',
  is_test boolean not null default false,
  expires_at timestamptz null,
  last_recharged_at timestamptz null,
  last_activity_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_credit_accounts_status_check check (
    status in ('active', 'disabled')
  )
);
```

说明：

- `balance_credits`：账户总积分
- `frozen_credits`：已预占未结算积分
- 可用积分不落库，统一按 `balance_credits - frozen_credits` 计算
- `is_test`：测试租户标记，测试环境或测试租户不扣真实积分
- `expires_at`：账户积分有效期，第一期可为空
- `last_activity_at`：最近充值或消耗时间，用于沉默租户治理

不建议存 `available_credits` 字段。`available = balance - frozen` 是派生值，冗余存储会增加不一致风险。如果前端和接口频繁需要展示可用余额，可以建视图：

```sql
create view public.tenant_credit_account_balances as
select
  *,
  greatest(balance_credits - frozen_credits, 0) as available_credits
from public.tenant_credit_accounts;
```

### 5.2 `tenant_credit_orders`

充值订单。

```sql
create table public.tenant_credit_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  order_no text not null unique,
  package_code text null,
  credits bigint not null,
  amount_fen integer not null,
  bonus_credits bigint not null default 0,
  channel text not null,
  status text not null,
  paid_at timestamptz null,
  created_by uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_credit_orders_status_check check (
    status in ('pending', 'paid', 'closed', 'refunded')
  )
);
```

第一期建议：

- 最低充值金额：`100 元`
- 充值积分：`100000 积分`
- 赠送积分先不做，避免账务复杂
- 第三方支付未接入前，允许平台超管人工创建 `paid` 订单并入账

后续如果需要积分按批次过期，应新增 `tenant_credit_batches`：

- 每次充值或赠送形成一个批次
- 扣费按先到期先扣
- 批次到期由定时任务生成过期扣减流水

第一期不建议直接做批次过期，先保留 `expires_at` 作为账户级策略字段。

### 5.3 `tenant_credit_ledger`

积分总账。所有充值、扣费、退款、赠送、补偿都走这张表。

```sql
create table public.tenant_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  account_id uuid not null references public.tenant_credit_accounts(id),
  direction text not null,
  change_credits bigint not null,
  balance_after bigint not null,
  frozen_after bigint not null,
  event_type text not null,
  correlation_id uuid null,
  source_type text null,
  source_id text null,
  source_no text null,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  remark text null,
  operator_user_id uuid null,
  created_at timestamptz not null default now(),
  constraint tenant_credit_ledger_direction_check check (
    direction in ('in', 'out', 'freeze', 'unfreeze')
  )
);
```

关键要求：

- `source_type + source_id + event_type` 必须保证幂等
- 所有扣费必须落账
- `available_after` 不落库，需要时按 `balance_after - frozen_after` 计算
- `correlation_id` 用于串联同一业务的一组流水，例如视频转文本的 `freeze -> unfreeze -> out`

### 5.4 `tenant_billing_events`

业务扣费事件表。先记“该资源应该扣多少钱”，再写入积分总账。

```sql
create table public.tenant_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  metric_code text not null,
  source_type text not null,
  source_id text not null,
  source_sub_id text null,
  billable_units numeric(18, 6) not null,
  unit_name text not null,
  unit_price_credits numeric(18, 6) not null,
  credits bigint not null,
  status text not null default 'pending',
  provider_request_id text null,
  pricing_rule_id uuid null,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  raw_usage jsonb not null default '{}'::jsonb,
  settled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_events_status_check check (
    status in ('pending', 'estimated', 'charged', 'waived', 'refunded', 'failed')
  )
);

create unique index tenant_billing_events_source_unique_idx
on public.tenant_billing_events(
  metric_code,
  source_type,
  source_id,
  coalesce(source_sub_id, '')
);
```

用途：

- 解决幂等问题
- 保留扣费快照
- 支持后续重新结算和补差价
- `provider_request_id` 保留供应商原始响应或请求 ID，便于后续与 OpenAI、短信、ASR 等供应商对账
- `raw_usage` 必须完整保留供应商返回的 usage 结构，包括 `reasoning_tokens`、`cached_tokens` 等非标准 token 维度

### 5.5 `tenant_pricing_rules`

价格规则表。

```sql
create table public.tenant_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_group_id uuid null,
  version integer not null default 1,
  tenant_id uuid null references public.tenants(id),
  metric_code text not null,
  provider_code text null,
  model_code text null,
  scene_code text null,
  unit_name text not null,
  unit_price_credits numeric(18, 6) not null,
  min_charge_credits bigint not null default 0,
  enabled boolean not null default true,
  effective_at timestamptz not null default now(),
  expires_at timestamptz null,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

说明：

- `tenant_id is null`：平台默认价
- `tenant_id not null`：租户专属价
- 按 `priority` 选择命中的价格规则
- `rule_group_id + version` 用于价格规则版本化，方便财务追溯“当时为什么按这个价格扣”
- 修改价格不覆盖旧规则，推荐创建新 version，并让旧 version 设置 `expires_at`

### 5.6 价格规则匹配逻辑

价格规则必须有明确短路逻辑，不能只依赖人工理解 `priority`。

推荐匹配顺序：

1. 租户专属价：`tenant_id + metric_code + provider_code + model_code + scene_code`
2. 租户 metric 价：`tenant_id + metric_code`
3. 平台模型价：`metric_code + provider_code + model_code`
4. 平台场景价：`metric_code + scene_code`
5. 平台默认价：`metric_code`

筛选条件：

- `enabled = true`
- `effective_at <= now()`
- `expires_at is null or expires_at > now()`

同级命中多条时：

- `priority` 小的优先
- `effective_at` 晚的优先
- 仍冲突则拒绝结算，并记录异常

历史账单不能因为价格规则修改而变化。所有 `tenant_billing_events` 必须写入 `pricing_snapshot`，后续查账只看快照，不回查当前价格表。

## 6. 计费编码设计

建议统一 `metric_code`：

| metric_code | 含义 |
| --- | --- |
| `sms_domestic_success` | 国内短信成功发送 |
| `ai_input_text_token` | AI 输入文本 token |
| `ai_output_text_token` | AI 输出文本 token |
| `ai_cached_input_token` | AI 缓存输入 token |
| `social_video_transcription_minute` | 视频转文本分钟 |

后续可扩展：

- `image_generate_count`
- `tts_audio_second`
- `web_search_call`

## 7. 扣费时机

## 7.1 短信

规则：

- 发送前先校验余额是否 >= 50 积分
- 收到最终 delivery receipt 成功后创建 `tenant_billing_events`
- 成功后再落 `tenant_credit_ledger`
- 失败不扣费

注意：

- 运营商返回失败不扣费
- 运营商只返回“已提交”时，先写日志但不扣费
- 运营商最终回执为成功时再扣费
- 若供应商没有最终回执能力，第一期可以把“提交成功”视为成功，但必须在 `sms_send_logs.billed=true` 上留下口径
- mock / disabled 环境不扣费

建议 `sms_send_logs` 增加字段：

```sql
delivery_status text null,
billed boolean not null default false,
billed_at timestamptz null
```

第一期执行口径：

- 以短信供应商返回的成功状态作为扣费依据。
- 如果供应商支持最终送达回执，优先按最终送达成功扣费。
- 如果供应商只支持提交成功回执，则接受按提交成功扣费，但 `delivery_status` 必须记录为 `submitted_success`。
- 不同供应商是否支持最终送达回执，需要在短信通道配置中显式标注，例如 `supports_delivery_receipt=true/false`。
- 如果供应商支持最终送达回执，但回执可能延迟：
  - 预计 5 分钟内返回：等待最终回执后扣费。
  - 超过 30 分钟仍未返回：定时任务按提交成功扣费，`delivery_status=submitted_success_timeout`，并写入异常对账。
  - 5-30 分钟之间由供应商通道配置决定，建议统一先等最终回执。

## 7.2 AI

规则：

1. 第一期开启试运行，不真扣，只生成 `estimated` 账单事件。
2. 试运行 1-2 周后，按模型和场景统计 P95 单次消耗。
3. 真扣阶段调用前可用 `P95 * 1.5` 作为余额门槛。
4. 调用完成后根据真实 usage 结算。
3. 若供应商未返回 token：
   - 不自动估算并收费
   - 记录 `status=failed` 或 `waived`
   - 进入异常对账

原因：

- token 是主要计费依据，供应商没返回 usage 时，不建议第一期凭估算扣客户钱。
- AI 调用前无法准确知道最终 token，前置门槛不能拍脑袋。

第一期建议：

- **没有真实 token 的 AI 调用，不收费，只统计异常**
- **AI 先试算，不立即真扣**

P95 门槛实施口径：

- 阶段 4 试算结束前，由研发或数据同学拉取最近 2 周 token 分布。
- 按 `scene_code + provider_code + model_code` 统计单次调用总积分消耗 P95。
- 前置余额门槛建议为 `ceil(P95 * 1.5)`。
- 第一阶段门槛值先人工配置，不做自动调整。
- 配置位置优先使用 `tenant_pricing_rules.min_charge_credits`。
- 如果实现前期还没有价格规则管理页，可以短期放入环境变量或系统设置，例如 `AI_MIN_CHARGE_CREDITS_DECORATION_QA=xxx`。

真扣后可选两种模式：

- 严格预付费：余额低于 P95 门槛时拒绝调用。
- 高信任租户：允许后扣，扣费失败后进入欠费状态并通知租户管理员和平台运维。

第一期只采用严格预付费，不启用欠费追缴。高信任租户后扣模式只作为未来扩展，不进入第一期实现。

## 7.3 视频转文本

规则：

1. 任务创建时先校验租户余额是否大于最低门槛，第一期建议 60 积分。
2. 任务创建时执行 `freeze`，冻结金额按预估时长计算；没有时长时冻结最低门槛 60 积分。
3. 任务完成后根据真实 `duration_seconds` 计算分钟。
4. 成功任务执行 `unfreeze` 并 `out` 实扣。
5. 失败任务只执行 `unfreeze`，不扣费。
6. 缓存复用不扣费。
7. 时长缺失不扣费，进入异常列表。

最低门槛说明：

- `60 积分` 等于 1 分钟视频门槛。
- 当前短视频转文本可能存在 30 秒以内的视频，`300 积分` 会拦截过多正常请求。
- 后续如果发现长视频占比高，可调到 120 积分或按租户策略配置。

Freeze 规则：

- AI 和短信是毫秒/秒级响应，第一期不做 freeze，采用“校验余额 -> 执行 -> 扣费”。
- 视频转文本是异步长任务，必须做 freeze，防止租户在任务执行期间通过其它窗口消耗余额。
- `freeze / unfreeze / out` 使用同一个 `correlation_id`。
- 实扣金额小于冻结金额时，释放差额。
- 实扣金额大于冻结金额时，先扣冻结金额，再尝试扣差额；差额扣费失败则任务进入异常对账。

## 8. 与现有日志表的衔接

## 8.1 AI

继续复用：

- `ai_call_logs`

新增 billing worker：

1. 监听或轮询新 `ai_call_logs`
2. 读取：
   - `tenant_id`
   - `provider_code`
   - `model_code`
   - `scene_code`
   - `prompt_tokens`
   - `completion_tokens`
   - `cached_input_tokens`，如后续补充
3. 生成 1-N 条 `tenant_billing_events`

注意：

- 如果当前 `ai_call_logs` 没有 `cached_input_tokens` 字段，第一期不启用 `ai_cached_input_token` 计费项。
- 如果供应商返回 `reasoning_tokens`、`cached_tokens`、`audio_tokens` 等扩展 usage，必须完整放入 `tenant_billing_events.raw_usage`。
- 第一版可以不对 `reasoning_tokens` 单独计费，但必须保留原始数据，避免后续无法回溯。
- 推荐在 AI 计费前补字段：

```sql
alter table public.ai_call_logs
add column if not exists cached_input_tokens integer null;
```

- 字段未接入供应商 usage 前，价格规则可先保留，但不生成 `ai_cached_input_token` billing event。

示例：

- 一次 AI 调用，可能生成两条账单事件：
  - `ai_input_text_token`
  - `ai_output_text_token`

## 8.2 短信

新增：

- `sms_send_logs`

短信服务成功发送后：

1. 写 `sms_send_logs`
2. 创建 `tenant_billing_events(metric_code=sms_domestic_success)`
3. 扣积分

## 8.3 视频转文本

继续复用：

- `social_video_transcriptions`

完成任务后读取：

- `tenant_id`
- `billing_duration_seconds`
- `billing_minutes`
- `billable`

再创建：

- `tenant_billing_events(metric_code=social_video_transcription_minute)`

## 9. Admin 侧对接

## 9.1 平台超管

新增页面建议：

### A. `/platform/billing`

平台总览：

- 全平台积分充值额
- 全平台积分消耗
- 租户余额排名
- 风险租户：余额低于阈值

### B. `/platform/billing/tenants`

租户计费中心：

- 当前余额
- 冻结积分
- 总充值
- 总消耗
- 最近 30 天消耗
- 短信 / AI / 视频分项

### C. `/platform/billing/pricing`

价格规则管理：

- metric_code
- provider/model/scene
- 单价
- 生效时间
- 是否启用

### D. `/platform/billing/ledger`

积分流水：

- 充值
- 扣费
- 退款
- 补偿
- 赠送

### E. `/platform/billing/anomalies`

异常对账：

- AI 没有 token
- 视频没有时长
- 扣费失败
- 余额不足导致业务失败

## 9.2 租户 admin

新增：

### `/billing`

租户账务中心：

- 当前积分余额
- 近 30 天消耗
- AI / 短信 / 视频分项
- 充值入口
- 流水明细

### `/billing/ledger`

租户积分流水：

- 时间
- 资源类型
- 业务场景
- 用量
- 扣减积分
- 剩余积分

### `/usage`

现有用量页保留，但增加：

- 原始用量
- 对应积分消耗

也就是：

- token 数 != 积分
- 秒数 / 分钟 != 积分

这两个维度都要展示。

## 10. 微信小程序对接

需要补 4 类能力。

### 10.1 余额展示

小程序首页、AI 页、视频工具页应能看到：

- 当前租户剩余积分
- 本次功能预计消耗

### 10.2 下单前提示

示例：

- 发短信前：`本次将消耗 50 积分`
- 视频转文本前：`按完成后时长计费，60 积分/分钟`
- AI 问答前：`按实际 token 消耗计费`

### 10.3 余额不足错误码

新增统一错误码：

- `TENANT_CREDITS_INSUFFICIENT`
- `TENANT_BILLING_DISABLED`
- `TENANT_PRICING_RULE_MISSING`

小程序收到后：

- 展示“余额不足，请联系装修公司管理员充值”
- 不让前端自己算租户 ID 或自己算扣费

### 10.4 流水与明细

如后续客户侧也要展示，可提供只读接口：

- 当前余额
- 最近消耗摘要

但第一期建议先只给租户 admin 看，不先给客户看。

## 11. 后端接口建议

## 11.1 平台

- `GET /platform/billing/summary`
- `GET /platform/billing/tenants`
- `GET /platform/billing/ledger`
- `GET /platform/billing/pricing-rules`
- `POST /platform/billing/pricing-rules`
- `PATCH /platform/billing/pricing-rules/:id`
- `POST /platform/billing/tenants/:tenantId/grants`
- `GET /platform/billing/anomalies`

## 11.2 租户 admin

- `GET /billing/account`
- `GET /billing/summary`
- `GET /billing/ledger`
- `POST /billing/orders`
- `GET /billing/orders/:id`

## 11.3 内部结算

- `POST /internal/billing/settle-ai-log`
- `POST /internal/billing/settle-sms-log`
- `POST /internal/billing/settle-social-video`

也可以不走 HTTP，直接 worker / service 内部调用。

## 12. 幂等与一致性

必须保证：

1. 同一条原始 usage 只能扣一次。
2. 重试不会重复扣费。
3. 充值到账只能加一次。

建议实现：

- `tenant_billing_events` 用唯一键做幂等
- 积分扣减和 ledger 写入放同一事务
- 所有外部支付回调必须校验支付单号幂等
- 积分余额更新只维护 `balance_credits` 和 `frozen_credits`
- 所有展示可用余额的接口统一计算 `balance_credits - frozen_credits`

## 13. 风控与保护机制

第一期必须做：

1. 余额不足拦截
2. 租户计费开关
3. 日消耗告警阈值
4. 月消耗告警阈值
5. 平台手工补偿能力
6. 平台手工冻结能力

建议阈值：

- 余额 < 5000 积分：低余额预警
- 余额 < 1000 积分：高风险预警

阈值配置口径：

- 第一版不做租户级阈值。
- 平台级阈值放在环境变量或 `system_settings`。
- 推荐配置项：
  - `BILLING_LOW_BALANCE_THRESHOLD_CREDITS=5000`
  - `BILLING_CRITICAL_BALANCE_THRESHOLD_CREDITS=1000`
  - `BILLING_DAILY_CONSUMPTION_ALERT_CREDITS`
  - `BILLING_MONTHLY_CONSUMPTION_ALERT_CREDITS`
- 后续如租户规模扩大，再加租户级自定义阈值。

## 14. 定时任务与对账

计费系统必须有后台任务，否则扣费失败、冻结超时、异常账单会长期堆积。

建议第一期落地以下任务：

| 任务 | 频率 | 作用 |
| --- | --- | --- |
| 冻结积分超时释放 | 每小时 | 防止预占积分长期不释放 |
| 异常账单重试 | 每小时 | 重试扣费失败或待结算事件 |
| AI 试算账单生成 | 每小时 | 将 `ai_call_logs` 转为 `estimated` billing events |
| 视频转文本结算 | 每小时 | 将完成任务转为扣费事件 |
| 日账单汇总 | 每天 | 生成积分维度的租户日汇总 |
| 余额预警 | 每天 | 触发低余额通知 |
| 积分过期处理 | 每天 | 处理到期积分或长期沉默账户 |

第一期如果没有队列，可以用 cron worker 扫表实现，但必须保证幂等。

冻结积分超时释放口径：

- 第一版统一冻结超时时长：`30 分钟`。
- 适用范围：AI 预占、视频转文本预占、其它长任务预占。
- 超过 30 分钟仍未结算的冻结记录，由定时任务自动 `unfreeze`。
- 自动释放必须写入 `tenant_credit_ledger`，`event_type=auto_unfreeze_timeout`。
- 同时写入异常对账，方便平台排查任务是否卡死。
- 冻结释放后，关联业务任务必须进入终态：
  - AI 任务：标记为 `failed` 或记录 `billing_timeout`。
  - 视频转文本任务：标记为 `timeout` 或 `failed`。
  - 短信：若已按 TTL 提交成功扣费，不再冻结；若还处于冻结状态则释放并标记异常。
- 冻结释放后不自动重试扣费，需要人工处理或用户重新发起。

## 15. 通知机制

计费必须配套通知，否则余额不足会变成业务不可用但没人知道。

建议新增：

```text
billing_notifications
```

字段建议：

- `tenant_id`
- `notification_type`
- `level`
- `status`
- `target_role`
- `payload`
- `sent_at`
- `created_at`

通知场景：

| 场景 | 通知对象 |
| --- | --- |
| 余额低于阈值 | 租户管理员 |
| 扣费失败 | 平台运维 |
| 充值到账 | 租户管理员 |
| AI token 缺失异常 | 平台运维 |
| 视频时长缺失异常 | 平台运维 |

如果现有通知中心已支持租户管理员通知，优先复用；否则第一期先写 `billing_notifications`，后续再接微信、短信或站内信。

## 16. 测试环境隔离

开发、测试、预发环境不能扣真实积分。

建议三层保护：

1. 环境变量：`BILLING_CHARGE_ENABLED=false` 时只试算不真扣。
2. 租户标记：`tenant_credit_accounts.is_test=true` 时不真扣。
3. 价格规则：测试租户可以命中测试价格，但账单状态只写 `estimated`。

生产环境上线初期也建议：

- `AI_CHARGE_ENABLED=false`
- `SMS_CHARGE_ENABLED=true`
- `SOCIAL_VIDEO_CHARGE_ENABLED=true`

这样短信和视频先真实扣费，AI 只试算。

## 17. 上线顺序

建议分 6 个阶段。

### 阶段 0：影子计费

可与阶段 1 并行。

- 所有业务照常运行。
- billing worker 根据当前 `tenant_pricing_rules` 模拟生成 `tenant_billing_events(status=estimated)`。
- 不扣真实积分。
- 用于验证：
  - 当前价格是否会让租户余额迅速枯竭。
  - 当前价格是否会导致平台亏本。
  - AI token 分布是否适合当前模型档位。

### 阶段 1：计费底座

- 新增积分账户、订单、总账、扣费事件、价格规则表
- 接入充值订单
- 搭建平台价格配置页

第一期不接第三方支付，采用平台人工充值：

1. 平台超管在 admin 选择租户。
2. 输入充值金额和备注。
3. 系统生成 `tenant_credit_orders`：
   - `status = paid`
   - `channel = manual`
   - `created_by = 当前平台超管 employee_id`
   - `paid_at = now()`
4. 同一事务内写入 `tenant_credit_ledger`：
   - `direction = in`
   - `event_type = manual_recharge`
   - `source_type = tenant_credit_order`
   - `source_id = order.id`
5. 更新 `tenant_credit_accounts.balance_credits / total_recharged_credits / last_recharged_at / last_activity_at`。
6. 所有人工充值必须可在平台审计或账务流水中看到操作人。

### 阶段 2：短信接入扣费

- 新增 `sms_send_logs`
- 短信成功后扣积分
- admin 看得到短信积分消耗

### 阶段 3：视频转文本接入扣费

- 使用现有 `social_video_transcriptions`
- 创建任务时按预估时长或最低门槛 freeze
- 完成任务后按分钟 unfreeze + out
- 缓存复用和失败任务不扣

### 阶段 4：AI 接入试算

- 统一所有 AI 调用进入 `ai_call_logs`
- 只对有真实 token 的调用生成试算账单
- admin 和租户账务页展示 AI 明细与试算积分消耗
- 观察 1-2 周 token 分布和 P95 消耗

### 阶段 5：AI 真扣费

- 根据 P95 数据确定前置余额门槛
- 打开 AI 真扣费开关
- 余额不足直接拒绝调用

建议先做顺序：

- **影子计费**
- **短信**
- **视频转文本**
- **AI 试算**
- **AI 真扣费**

原因：

- 短信和视频计费口径更稳定
- AI 的模型价格波动和 token 口径更复杂，必须先试运行

上线顺序评估：

| 阶段 | 风险 | 建议 |
| --- | --- | --- |
| 影子计费 | 低 | 与阶段 1 并行，先验证价格和账单口径 |
| 短信 | 低 | 可以先上，计费口径稳定 |
| 视频 | 中 | 可以上，重点测试缓存复用和时长缺失 |
| AI | 高 | 先试算 1-2 周，再真扣 |

## 18. 最终推荐定价

如果今天直接落地，我建议第一期就按下面执行：

| 项目 | 推荐价格 |
| --- | --- |
| 充值汇率 | 1 元 = 1000 积分 |
| 国内短信 | 50 积分 / 成功 1 条 |
| 视频转文本 | 60 积分 / 分钟，向上取整 |
| AI | 按模型档位拆分 input / output / cached input |

不建议今天直接上线的口径：

- 统一 `1k token = 100 积分`
- 视频 `1 秒 = 1 积分`

## 19. 外部价格参考

以下为 2026-05-12 核查到的公开价格口径，仅作为本方案定价参考，正式定价仍以平台策略为准：

- OpenAI API Pricing  
  https://openai.com/api/pricing/
- OpenAI Developer Pricing Docs  
  https://developers.openai.com/api/docs/pricing
- 腾讯云短信  
  https://cloud.tencent.com/product/sms
- 腾讯云语音识别  
  https://cloud.tencent.com/product/asr

## 20. 需要立即拍板的事项

上线前需要明确：

1. 是否确认 `1 元 = 1000 积分`
2. 是否确认国内短信 `50 积分/条`
3. 是否确认视频转文本 `60 积分/分钟`
4. AI 第一批接入 `装修 AI 问答` 做试算，因为该场景消耗最容易预测。
5. 是否先不上第三方支付，只做平台人工充值
6. 积分有效期是否先不启用，后续再定
7. AI 真扣费第一期采用严格预付费，不允许欠费追缴

如果需要最低风险上线，建议：

- **第一期先做平台人工充值 + 短信/视频扣费**
- **AI 先记录积分试算，不立即真扣**
- 观察 1-2 周后再打开 AI 真扣费

## 21. 潜在风险备忘

以下风险不阻塞第一期上线，但建议在阶段 2 / 3 / 4 完成后回看。

| 风险点 | 说明 | 建议应对 |
| --- | --- | --- |
| 短信扣费与供应商账单对账 | 按提交成功扣费后，如果供应商最终失败，可能导致租户多扣或平台承担补偿成本。 | 每月对账拉取 `submitted_success_timeout` 和供应商实际失败记录，必要时人工补偿。 |
| AI P95 门槛滞后 | 2 周窗口的 P95 可能无法覆盖突发高消耗场景，例如单次超长输入。 | AI 真扣后前两周持续监控拦截率，若拦截率 > 1%，将安全系数从 1.5 调整到 2.0。 |
| 视频缓存复用判断准确性 | 缓存 key 如果设计不准，可能误复用或重复扣费。 | 阶段 3 上线前对相同 URL、相同视频 ID、短链跳转 URL 做专项测试。 |
| 定时任务单点故障 | 如果冻结释放、异常重试只依赖单机 cron，单机故障会导致账务任务停摆。 | 第一版 cron 任务必须幂等；阶段 2 后补分布式锁，后续迁移到消息队列或调度平台。 |

## 22. 后续扩展：资源包

第一期只做积分余额，不做资源包。

后续如果需要卖“短信包”“视频分钟包”，建议新增：

```text
tenant_resource_buckets
```

字段建议：

- `tenant_id`
- `bucket_type`
- `total_units`
- `remaining_units`
- `unit_name`
- `expires_at`
- `source_order_id`
- `status`

扣费顺序：

1. 先检查是否有可用资源包。
2. 有资源包则扣减资源包额度。
3. 资源包不足或没有资源包时，再扣积分余额。

资源包流水仍应写入 `tenant_credit_ledger` 或独立 `tenant_resource_bucket_ledger`，并通过 `correlation_id` 与 billing event 关联。
