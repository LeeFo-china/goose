# 租户 AI Token 与短信用量统计方案

日期：2026-05-11

## 1. 背景

多租户 SaaS 化后，平台需要知道每个租户实际消耗了多少 AI 和短信资源，用于：

- 平台运营看板。
- 租户套餐和超量计费。
- 成本核算。
- 异常用量预警。
- 租户账单明细追溯。

当前系统已有部分基础能力，但还没有形成完整的“租户用量统计”闭环。

## 2. 当前现状评估

### 2.1 AI 用量

当前已具备：

- `aiGateway` 已统一非流式 AI 调用。
- `ai_call_logs` 已记录：
  - `tenant_id`
  - `scene_code`
  - `provider_code`
  - `model_code`
  - `model_name`
  - `status`
  - `prompt_tokens`
  - `completion_tokens`
  - `total_tokens`
  - `duration_ms`
  - `created_at`
- 已有索引：
  - `ai_call_logs(tenant_id, scene_code, created_at desc)`
  - `ai_call_logs(tenant_id, created_at desc)`
  - `ai_call_logs(tenant_id, status, created_at desc)`
- 自媒体脚本用量汇总里已经能临时聚合 AI token。

当前缺口：

- 没有统一的租户 AI 用量接口。
- 没有统一的日汇总表。
- admin 平台侧没有租户 AI token 统计页面。
- 租户后台没有“本公司 AI 用量”查看入口。
- 装修问答流式接口仍有直连实现，若未写入 `ai_call_logs`，会漏统计。
- 部分 H5/admin AI 回填场景如果没有传入 `tenantId`，会被记为平台级任务，无法归因到租户。

结论：

AI 用量“原始采集基础已经有了”，但“统计产品化还没做完整”。

### 2.2 短信用量

当前已具备：

- 短信服务支持平台通道、租户自有阿里云、租户自有腾讯云。
- 发送验证码和项目验收通知时可以传入 `tenantId`。
- 短信 ticket、验收通知等业务数据已经具备租户归属。

当前缺口：

- 没有统一短信发送日志表。
- 发送成功、失败、通道、模板、手机号脱敏、错误码没有标准化落库。
- 无法按租户统计短信发送条数。
- 无法区分平台通道代发和租户自有通道发送。
- 无法统计不同场景用量：
  - 客户绑定验证码
  - 员工绑定验证码
  - admin 登录验证码
  - 项目验收通知
- 无法做失败率、异常告警和账单明细。

结论：

短信用量“发送能力已具备”，但“用量采集基础缺失”，需要先补发送台账。

## 3. 设计目标

### 3.1 MVP 必须实现

- 每一次 AI 调用有租户归因。
- 每一次短信发送有租户归因。
- 平台超管可以查看每个租户的 AI token 和短信条数。
- 租户管理员可以查看本租户自己的用量。
- 支持按时间范围过滤。
- 支持按场景、供应商、模型、短信通道维度拆分。
- 支持失败统计，避免只看成功量。

### 3.2 MVP 不做

- 不做自动扣费。
- 不做复杂套餐计费。
- 不做实时数据仓库。
- 不做跨库 ETL。
- 不用估算 token 作为计费依据。
- 不展示完整手机号。

## 4. 数据模型方案

### 4.1 AI 明细表

继续使用现有：

```text
ai_call_logs
```

建议补充字段：

```sql
ALTER TABLE public.ai_call_logs
ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS source text NULL,
ADD COLUMN IF NOT EXISTS cost_estimate numeric(12, 6) NULL;
```

说明：

- `billable`：是否计入租户用量。平台内部测试、失败重试可按规则设置。
- `source`：来源模块，例如 `h5_builder`、`social_video`、`decoration_qa`。
- `cost_estimate`：后续如配置模型单价，可异步计算成本；MVP 可为空。

如果暂不想改表，也可以第一版只基于现有字段做统计。

### 4.2 短信发送明细表

新增：

```text
sms_send_logs
```

建议字段：

```sql
CREATE TABLE public.sms_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id),
  provider text NOT NULL,
  channel_mode text NULL,
  purpose text NOT NULL,
  template_code text NULL,
  phone_masked text NOT NULL,
  phone_hash text NOT NULL,
  status text NOT NULL,
  request_id text NULL,
  provider_code text NULL,
  provider_message text NULL,
  error_code text NULL,
  error_message text NULL,
  sms_count integer NOT NULL DEFAULT 1,
  duration_ms integer NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_send_logs_status_check CHECK (
    status IN ('success', 'failure', 'mock', 'disabled')
  ),
  CONSTRAINT sms_send_logs_sms_count_check CHECK (sms_count >= 0)
);

CREATE INDEX sms_send_logs_tenant_created_idx
ON public.sms_send_logs(tenant_id, created_at DESC);

CREATE INDEX sms_send_logs_tenant_status_created_idx
ON public.sms_send_logs(tenant_id, status, created_at DESC);

CREATE INDEX sms_send_logs_tenant_purpose_created_idx
ON public.sms_send_logs(tenant_id, purpose, created_at DESC);
```

字段说明：

- `tenant_id`：租户归因。平台级短信可为空。
- `provider`：`mock`、`disabled`、`aliyun`、`tencent`。
- `channel_mode`：`platform`、`tenant_aliyun`、`tenant_tencent`。
- `purpose`：短信场景。
- `template_code`：阿里云模板 Code 或腾讯云模板 ID。
- `phone_masked`：脱敏手机号，例如 `186****4738`。
- `phone_hash`：手机号哈希，用于排查重复发送，不存明文。
- `status`：成功、失败、mock、disabled。
- `sms_count`：短信条数，MVP 默认 1；后续可按长短信拆分计数。

### 4.3 日汇总表

新增统一日汇总：

```text
tenant_usage_daily
```

建议字段：

```sql
CREATE TABLE public.tenant_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  usage_date date NOT NULL,

  ai_call_count integer NOT NULL DEFAULT 0,
  ai_success_count integer NOT NULL DEFAULT 0,
  ai_failure_count integer NOT NULL DEFAULT 0,
  ai_prompt_tokens integer NOT NULL DEFAULT 0,
  ai_completion_tokens integer NOT NULL DEFAULT 0,
  ai_total_tokens integer NOT NULL DEFAULT 0,
  ai_missing_token_count integer NOT NULL DEFAULT 0,

  sms_send_count integer NOT NULL DEFAULT 0,
  sms_success_count integer NOT NULL DEFAULT 0,
  sms_failure_count integer NOT NULL DEFAULT 0,
  sms_mock_count integer NOT NULL DEFAULT 0,
  sms_disabled_count integer NOT NULL DEFAULT 0,

  social_video_transcription_count integer NOT NULL DEFAULT 0,
  social_video_duration_seconds numeric(12, 2) NOT NULL DEFAULT 0,
  social_video_missing_duration_count integer NOT NULL DEFAULT 0,

  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, usage_date)
);
```

MVP 可以先不做分场景日汇总，只做总量；分场景通过明细表实时聚合最近 30 天。

后续如要提升性能，再加：

```text
tenant_usage_daily_breakdowns
```

按 `metric_type + dimension_type + dimension_value` 存储场景、provider、model、purpose 分布。

## 5. 后端采集方案

### 5.1 AI 采集

保留 `aiGateway.logCall()` 作为唯一采集入口。

需要补强：

1. 检查所有 AI 调用是否都走 `aiGateway`。
2. 对仍直连的流式装修问答补日志写入。
3. 要求租户业务场景调用 `aiGateway.chat()` 时必须传 `tenantId`。
4. 对平台级 AI 任务允许 `tenantId = null`，但不计入租户账单。
5. 供应商未返回 token 时：
   - `prompt_tokens / completion_tokens / total_tokens` 保持 null。
   - 统计时增加 `missing_token_count`。
   - 不用估算 token 参与计费。

### 5.2 短信采集

在 `apps/api/src/services/sms.ts` 增加统一日志函数：

```ts
logSmsSend({
  tenantId,
  provider,
  channelMode,
  purpose,
  templateCode,
  phone,
  status,
  requestId,
  providerCode,
  providerMessage,
  errorCode,
  errorMessage,
  durationMs,
  metadata,
})
```

采集规则：

- `mock`：记录 `status = mock`，`sms_count = 0` 或 1 需要产品确认；建议 MVP 记 0，不计费。
- `disabled`：记录 `status = disabled`，不计费用量。
- 阿里云成功：记录 `status = success`。
- 腾讯云成功：记录 `status = success`。
- 发送失败：记录 `status = failure`，并保留错误码和错误消息。
- 日志写入失败不能影响短信发送主链路，但要写服务端 warning 日志。

手机号处理：

- 不落明文手机号。
- `phone_masked = 前3位 + **** + 后4位`。
- `phone_hash = sha256(phone + SMS_LOG_HASH_SALT)`。
- `SMS_LOG_HASH_SALT` 放环境变量或平台系统配置，不返回前端。

## 6. 统计接口方案

### 6.1 平台超管接口

新增：

```text
GET /platform/usage/tenants
```

查询参数：

```text
date_from=2026-05-01
date_to=2026-05-31
tenant_id=可选
```

返回：

```json
{
  "list": [
    {
      "tenant": {
        "id": "tenant-id",
        "name": "某装修公司",
        "slug": "tenant-slug"
      },
      "ai": {
        "call_count": 120,
        "success_count": 116,
        "failure_count": 4,
        "prompt_tokens": 100000,
        "completion_tokens": 30000,
        "total_tokens": 130000,
        "missing_token_count": 2
      },
      "sms": {
        "send_count": 80,
        "success_count": 76,
        "failure_count": 4,
        "mock_count": 0,
        "disabled_count": 0
      }
    }
  ]
}
```

### 6.2 平台明细接口

```text
GET /platform/usage/ai-logs
GET /platform/usage/sms-logs
```

用途：

- 平台排查租户异常用量。
- 查询失败短信和失败 AI 调用。
- 按 provider/model/scene/purpose 过滤。

### 6.3 租户后台接口

```text
GET /usage/summary
GET /usage/ai-logs
GET /usage/sms-logs
```

规则：

- 后端根据 `authContext.tenantId` 自动过滤。
- 租户不可传 `tenant_id` 查看其它租户。
- 明细手机号只展示脱敏值。

## 7. Admin 页面方案

### 7.1 平台超管

新增菜单：

```text
平台运营 -> 用量统计
```

页面：

```text
/platform/usage
```

核心模块：

- 顶部时间范围筛选。
- 租户搜索。
- 汇总卡片：
  - AI 总 token
  - AI 调用次数
  - 短信发送数
  - 短信失败数
- 租户用量表：
  - 租户
  - AI 调用次数
  - AI total_tokens
  - AI 失败数
  - 短信发送数
  - 短信失败数
  - 操作：查看明细
- 明细 tabs：
  - AI 明细
  - 短信明细

### 7.2 租户后台

新增入口：

```text
系统 -> 用量统计
```

页面：

```text
/usage
```

展示：

- 本租户本月 AI token。
- 本租户本月短信条数。
- 按天趋势。
- 按场景分布。
- 最近失败记录。

MVP 可先只做平台超管页面，租户后台页面放第二阶段。

## 8. 定时汇总方案

### 8.1 MVP 方案

先用应用内运维脚本或 cron 执行：

```text
scripts/aggregate-tenant-usage-daily.ts
```

执行逻辑：

1. 输入日期，默认昨天。
2. 查询所有 active 租户。
3. 对每个租户聚合：
   - `ai_call_logs`
   - `sms_send_logs`
   - `social_video_transcriptions`
4. upsert 到 `tenant_usage_daily`。
5. 记录运行日志到现有 ops 脚本日志或新增 `usage_aggregation_runs`。

### 8.2 为什么不直接实时聚合

实时聚合近期少量数据可以接受，但平台级全租户月度统计如果直接扫明细表，会随着租户和调用量增长变慢。

MVP 推荐：

- 近 7 天明细可实时查。
- 平台首页、租户列表、月度统计读 `tenant_usage_daily`。

## 9. 阶段计划

### 阶段 1：短信发送台账

Todo：

- [x] 新增 `sms_send_logs` migration。
- [x] 新增 `sms-send-logs` repository。
- [x] 在 `sms.ts` 中统一记录发送日志。
- [x] 阿里云、腾讯云、mock、disabled 全部落日志。
- [x] 手机号脱敏和 hash。
- [ ] 验证项目验收短信、验证码短信均有租户归因。

验收：

- 租户发送一条验证码，`sms_send_logs.tenant_id` 正确。
- 租户发送一条项目验收短信，`purpose = project_acceptance`。
- 发送失败能记录 `failure`。
- 日志不包含明文手机号。

### 阶段 2：AI 用量归因补齐

Todo：

- [ ] 扫描所有 AI 调用点，确认是否走 `aiGateway`。
- [ ] 装修问答流式接口补 `ai_call_logs` 写入。
- [ ] H5/admin 租户 AI 回填确认传入 `tenantId`。
- [x] `ai_call_logs` 可选补 `billable/source/cost_estimate`。
- [ ] 明确平台级 AI 调用不计租户账单。

验收：

- H5 租户活动页 AI 回填能写入租户 `tenant_id`。
- 自媒体脚本 AI 生成能写入租户 `tenant_id`。
- 装修问答流式调用能写入 token；若供应商未返回 token，则 `missing_token_count` 可统计。

### 阶段 3：统一用量汇总接口

Todo：

- [x] 新增 `tenant_usage_daily` migration。
- [x] 新增 usage repository/service。
- [x] 新增平台接口：
  - `GET /platform/usage/tenants`
  - `GET /platform/usage/ai-logs`
  - `GET /platform/usage/sms-logs`
- [x] 新增租户接口：
  - `GET /usage/summary`
  - `GET /usage/ai-logs`
  - `GET /usage/sms-logs`
- [x] 加权限控制：
  - 平台接口仅 `platform_admin`。
  - 租户接口必须有 `tenantId`。

验收：

- 平台超管能按时间范围查看所有租户用量。
- 租户管理员只能查看本租户用量。
- A 租户不能通过参数查询 B 租户用量。

### 阶段 4：Admin 页面

Todo：

- [ ] 新增 `/platform/usage` 页面。
- [ ] 平台侧边栏增加“用量统计”。
- [ ] 用 shadcn/ui 重构统计卡片、表格、tabs、筛选器。
- [ ] 支持 AI / 短信 tabs。
- [ ] 增加失败明细入口。
- [ ] 第二阶段再新增租户 `/usage` 页面。

验收：

- 平台超管可看到租户用量排行。
- 可按租户、时间筛选。
- 可查看短信失败明细。
- 租户模式看不到平台全量用量。

### 阶段 5：告警与限额

Todo：

- [ ] `tenant_usage_limits` 表。
- [ ] 支持月度 AI token 上限。
- [ ] 支持月度短信条数上限。
- [ ] 达到 80% 发站内信。
- [ ] 超过 100% 时先告警，不自动停用。
- [ ] 后续再接套餐计费。

验收：

- 用量超过阈值可生成通知。
- 平台可查看超限租户。

## 10. 风险与决策点

### 10.1 AI token 不一定总能拿到

不同供应商返回格式不完全一致，某些调用可能没有 usage。

决策：

- 真实 token 字段为空时，不估算计费。
- 统计 `missing_token_count`，用于排查供应商能力缺口。

### 10.2 短信长短信计费条数

不同供应商对长短信拆分计费规则不同。

MVP：

- `sms_count` 默认 1。
- 如果供应商返回实际计费条数，再写实际值。
- 后续按供应商回执增强。

### 10.3 平台通道代发如何归因

即使使用平台短信通道，只要短信由租户业务触发，也应归因到该租户。

规则：

- `tenant_id = 触发业务所属租户`
- `channel_mode = platform`
- `provider = 平台配置 provider`

### 10.4 租户自有通道是否计入平台账单

租户自有短信通道不应该计入平台短信成本，但仍应计入“使用次数”。

建议：

- 平台看板展示“发送量”。
- 成本核算时区分 `channel_mode`：
  - `platform`：平台成本。
  - `tenant_aliyun / tenant_tencent`：租户自担成本。

## 11. 推荐执行顺序

推荐先做：

1. 阶段 1：短信发送台账。
2. 阶段 2：AI 归因补齐。
3. 阶段 3：统一用量接口。
4. 阶段 4：平台 admin 用量页面。

原因：

- AI 已有明细日志，补齐成本低。
- 短信没有明细日志，是最大缺口，必须先补。
- 没有明细表就做报表，会导致后续无法排查账单。
- 日汇总可以在明细稳定后再做，避免口径反复修改。

## 12. 最小可用版本定义

MVP 完成后应具备：

- 平台能看到每个租户本月 AI total_tokens。
- 平台能看到每个租户本月短信发送数。
- 平台能查看 AI 和短信失败明细。
- 租户数据严格隔离。
- AI token 缺失有独立计数。
- 短信日志不保存明文手机号。
- 后续可以基于同一套明细和汇总表扩展计费。

## 13. 2026-05-11 V1 执行记录

已完成：

- 新增 `sms_send_logs`，短信发送链路会记录成功、失败、mock、disabled。
- 新增 `tenant_usage_daily`，为后续日汇总任务预留结构。
- `ai_call_logs` 已补 `billable/source/cost_estimate` 扩展字段。
- 新增平台接口：
  - `GET /platform/usage/tenants`
  - `GET /platform/usage/ai-logs`
  - `GET /platform/usage/sms-logs`
- 新增租户接口：
  - `GET /usage/summary`
  - `GET /usage/ai-logs`
  - `GET /usage/sms-logs`
- 已补 admin 对接文档：
  - `docs/application_integration_documentation/2026-05-11-admin-tenant-ai-sms-usage-statistics-integration.md`

未完成，后续继续：

- Admin 页面实现。
- 日汇总任务从明细表回填 `tenant_usage_daily`。
- 装修问答流式 AI 调用是否完整落 `ai_call_logs` 的专项复核。
- 真实环境执行 migration 后，用项目验收短信和验证码短信验证租户归因。
