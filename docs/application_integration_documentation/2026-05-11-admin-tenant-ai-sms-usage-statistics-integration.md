# Admin 租户 AI 与短信用量统计对接文档

日期：2026-05-11

## 1. 对接目标

本次后端已提供租户 AI token 与短信用量统计的 V1 接口，admin 端可据此实现：

- 平台超管查看所有租户的 AI 调用量、token 消耗、短信发送量。
- 平台超管查看 AI / 短信明细，排查失败和异常用量。
- 租户管理员查看本租户自己的 AI / 短信用量。
- 按时间范围、租户、供应商、模型、场景过滤。

## 2. 页面建议

### 2.1 平台超管

建议新增：

```text
/platform/usage
```

菜单位置：

```text
平台运营 -> 用量统计
```

页面结构：

- 顶部筛选：时间范围、租户搜索。
- 汇总列表：租户、AI 调用次数、AI token、短信发送条数、失败数。
- Tabs：
  - 租户汇总
  - AI 明细
  - 短信明细

### 2.2 租户后台

建议新增：

```text
/usage
```

菜单位置：

```text
系统管理 -> 用量统计
```

页面结构：

- 顶部统计卡片：AI token、AI 调用、短信发送、失败数。
- Tabs：
  - AI 明细
  - 短信明细

## 3. 平台接口

### 3.1 租户用量汇总

```http
GET /platform/usage/tenants
```

权限：

- 仅平台超管可访问。

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认沿用后端分页规则 |
| tenant_id | uuid | 否 | 精确过滤租户 |
| keyword | string | 否 | 搜索租户名称或 slug |
| date_from | YYYY-MM-DD | 否 | 默认当月 1 日 |
| date_to | YYYY-MM-DD | 否 | 默认今天 |

返回示例：

```json
{
  "list": [
    {
      "tenant": {
        "id": "tenant-id",
        "name": "默认装修公司",
        "slug": "default",
        "status": "active"
      },
      "ai": {
        "call_count": 12,
        "success_count": 10,
        "failure_count": 2,
        "prompt_tokens": 1200,
        "completion_tokens": 600,
        "total_tokens": 1800,
        "missing_token_count": 0,
        "status_counts": { "success": 10, "failure": 2 },
        "scene_counts": { "h5_page_ai_fill": 5 },
        "provider_counts": { "deepseek": 12 },
        "model_counts": { "deepseek-chat": 12 }
      },
      "sms": {
        "send_count": 8,
        "success_count": 7,
        "failure_count": 1,
        "mock_count": 0,
        "disabled_count": 0,
        "status_counts": { "success": 7, "failure": 1 },
        "provider_counts": { "aliyun": 8 },
        "channel_mode_counts": { "platform": 8 },
        "purpose_counts": { "project_acceptance": 3 }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 3.2 平台 AI 明细

```http
GET /platform/usage/ai-logs
```

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| tenant_id | uuid | 否 | 过滤租户 |
| scene_code | string | 否 | 业务场景 |
| status | success/failure | 否 | 调用状态 |
| provider_code | string | 否 | AI 供应商 |
| model_code | string | 否 | 模型编码 |
| date_from | YYYY-MM-DD | 否 | 开始日期 |
| date_to | YYYY-MM-DD | 否 | 结束日期 |

说明：

- 明细可用于失败排查。
- token 字段依赖供应商返回，供应商不返回时可能为空。

### 3.3 平台短信明细

```http
GET /platform/usage/sms-logs
```

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页数量 |
| tenant_id | uuid | 否 | 过滤租户 |
| status | success/failure/mock/disabled | 否 | 发送状态 |
| provider | string | 否 | mock/disabled/aliyun/tencent |
| purpose | string | 否 | 短信场景 |
| date_from | YYYY-MM-DD | 否 | 开始日期 |
| date_to | YYYY-MM-DD | 否 | 结束日期 |

返回明细字段包含：

- `phone_masked`：脱敏手机号。
- `phone_hash`：手机号 hash，仅用于排查重复发送，不展示给普通租户用户。
- `provider_code` / `provider_message`：短信服务商返回信息。
- `error_code` / `error_message`：失败原因。

## 4. 租户接口

### 4.1 租户用量汇总

```http
GET /usage/summary
```

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| date_from | YYYY-MM-DD | 否 | 默认当月 1 日 |
| date_to | YYYY-MM-DD | 否 | 默认今天 |

规则：

- 后端从登录态读取 `tenant_id`。
- 租户不能传 `tenant_id` 查看其它租户。

### 4.2 租户 AI 明细

```http
GET /usage/ai-logs
```

Query 与平台 AI 明细基本一致，但不支持跨租户查看。

### 4.3 租户短信明细

```http
GET /usage/sms-logs
```

Query 与平台短信明细基本一致，但不支持跨租户查看。

## 5. 统计口径

### 5.1 AI

- `call_count`：AI 调用记录数。
- `success_count`：成功调用数。
- `failure_count`：失败调用数。
- `total_tokens`：供应商返回的总 token。
- `missing_token_count`：供应商未返回 token 的调用数。

### 5.2 短信

- `send_count`：实际计入发送条数的数量。
- `success_count`：成功发送条数。
- `failure_count`：失败事件数。
- `mock_count`：mock 事件数。
- `disabled_count`：禁用事件数。

注意：

- `mock` 和 `disabled` 默认 `sms_count = 0`，不会计入真实发送量。
- 手机号不返回明文，只返回脱敏值。

## 6. 前端异常处理

- 平台账号访问租户接口时，如果后端返回无租户上下文，提示“当前为平台管理模式，请使用平台用量统计入口”。
- 租户账号访问平台接口时，提示“无平台权限”。
- 明细列表为空时展示空状态，不展示报错卡片。
- 日期切换后直接刷新数据，不需要额外搜索按钮。

## 7. 后端落地状态

已落地：

- `sms_send_logs` migration。
- `tenant_usage_daily` migration。
- `ai_call_logs` 补充 `billable/source/cost_estimate` 字段。
- 短信发送日志采集。
- 平台和租户用量查询接口。

待后续增强：

- Admin 页面实现。
- 日汇总定时任务。
- 用量告警和套餐限额。
- 装修问答流式 AI 调用 token 归因复核。
