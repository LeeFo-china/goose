# 城市合伙人官网申请 MVP 交接文档

日期：2026-07-05
分支：`feature/partner-applications-mvp`

## 实现范围

第一期只打通“官网申请线索 -> 超管审核 -> 转正式合伙人”的后台闭环。

- 官网只提交申请线索，不直接创建正式合伙人。
- 超管后台在城市合伙人运营页新增“申请线索”tab。
- 审核通过后创建 `platform_partners` 记录，初始状态为 `pending`。
- 合伙人启用、邀请码生成、装企绑定、收入分佣仍走现有城市合伙人运营页。

## 数据库

新增 migration：

```text
supabase/migrations/20260705101000_create_partner_applications.sql
```

新增表：

```text
platform_partner_applications
```

关键字段：

- `application_no`：申请编号，唯一。
- `applicant_name`：申请主体。
- `subject_type`：`personal` / `individual_business` / `company`。
- `contact_name`、`phone`：联系人信息。
- `region_codes`、`region_name`：意向区域。
- `status`：`submitted` / `reviewing` / `approved` / `rejected`。
- `converted_partner_id`：审核通过后创建的正式合伙人 ID。

关键索引：

- `platform_partner_applications_status_created_idx`
- `platform_partner_applications_phone_created_idx`
- `platform_partner_applications_region_codes_idx`

## 公开官网接口

### 提交城市合伙人申请

```http
POST /public/partner-applications
```

认证：

- 不需要登录。

请求体：

```json
{
  "applicant_name": "信阳星河装饰运营中心",
  "subject_type": "company",
  "contact_name": "李经理",
  "phone": "13800138000",
  "region_codes": ["411500"],
  "region_name": "河南省信阳市",
  "business_description": "本地装修公司渠道资源",
  "resource_description": "10 家意向装企",
  "message": "希望代理信阳市场",
  "source_channel": "official_website",
  "source_url": "https://www.goodcms.cn/partners",
  "utm_source": "website",
  "utm_medium": "cpc",
  "utm_campaign": "city_partner",
  "agree_privacy": true
}
```

返回：

```json
{
  "data": {
    "id": "uuid",
    "application_no": "CPA-20260705-...",
    "status": "submitted"
  }
}
```

错误：

- `400 VALIDATION_ERROR`：字段缺失、格式错误、未同意隐私规则。

## 平台后台接口

### 申请列表

```http
GET /platform/partner-applications?page=1&pageSize=20
```

筛选：

- `status`
- `keyword`
- `region_code`

列表接口已分页，`pageSize` 仍受全局最大 `100` 限制。

### 申请详情

```http
GET /platform/partner-applications/:id
```

### 更新审核状态

```http
PATCH /platform/partner-applications/:id/status
```

请求体：

```json
{
  "status": "rejected",
  "review_remark": "区域资源不匹配，暂不开放该城市"
}
```

说明：

- 当前支持 `reviewing` 和 `rejected`。
- `rejected` 必须填写 `review_remark`。

### 审核通过并转正式合伙人

```http
POST /platform/partner-applications/:id/approve
```

请求体：

```json
{
  "level_id": "uuid",
  "partner_name": "信阳星河装饰运营中心",
  "region_codes": ["411500"],
  "review_remark": "官网申请审核通过"
}
```

行为：

- 创建 `platform_partners`。
- 新合伙人状态为 `pending`。
- 将申请状态更新为 `approved`。
- 写入 `converted_partner_id`。
- 对已转换申请重复调用时，按幂等成功返回，不重复创建合伙人。

## Admin 页面

页面：

```text
/platform/partners?tab=applications
```

能力：

- 申请线索列表。
- 状态、关键词、区域编码筛选。
- 查看详情。
- 审核通过并创建合伙人。
- 驳回申请。

## 官网一期页面

公开页面：

```text
/partners
```

定位：

- 第一版官网聚焦“城市合伙人招募”。
- 首屏说明区域代理商或独立业务合伙人在本地运营平台、拓展装修公司入驻。
- 页面明确平台利益边界：合伙人只参与平台收入分成，装修公司自己的业务收支独立。
- 页面说明当前收入点：装修公司充值消费、客户线索成交返点，线索服务费默认 2.5%。
- 页面说明第一期采用人工月结，不在官网承诺固定等级比例。

前端文件：

```text
apps/admin/app/(site)/partners/page.tsx
apps/admin/components/official-site/partner-application-form.tsx
apps/admin/public/partner-hero-renovation.png
```

公开提交代理：

```text
apps/admin/app/api/public/partner-applications/route.ts
```

说明：

- 官网表单提交到 `POST /api/public/partner-applications`。
- Next 代理再转发到后端 `POST /public/partner-applications`。
- 该代理不读取后台登录 token，只代理城市合伙人公开申请接口。
- 表单会采集 `source_url`、`utm_source`、`utm_medium`、`utm_campaign`。

## 后续建议

- 如果公开提交量上来，需要增加验证码、IP 限流或风控策略。
- 如果审批并发风险变高，应把“创建合伙人 + 更新申请状态”下沉为数据库 RPC 事务。
