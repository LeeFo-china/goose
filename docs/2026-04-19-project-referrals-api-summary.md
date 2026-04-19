# 项目介绍费接口对接摘要

本文档用于说明“外部介绍人 / 项目介绍费”当前后端已落地的接口口径，方便前端或后台管理页直接对接。

---

## 1. 当前可用接口

### 外部介绍人

```http
GET /external-referrers
GET /external-referrers/:id
POST /external-referrers
PATCH /external-referrers/:id
PUT /external-referrers/:id
```

### 项目介绍费

```http
GET /project-referrals
GET /project-referrals/:id
GET /project-referrals/project?project_id=<projectId>
POST /project-referrals
PATCH /project-referrals/:id
PUT /project-referrals/:id
POST /project-referrals/:id/pay
```

---

## 2. 核心业务规则

- 项目介绍费按项目维度存储，不走 `payments`
- 项目状态变为 `signed` 时，如果存在介绍费配置，会自动按 `signed_amount` 计算
- 已计算但未支付时，允许修改介绍人 / 比例，并自动重算
- 已支付后，不允许再修改介绍人、比例和 `signed_amount`

---

## 3. 外部介绍人接口

### 创建请求

```http
POST /external-referrers
Content-Type: application/json
```

```json
{
  "name": "王先生",
  "phone": "13800138000",
  "bank_name": "招商银行",
  "bank_account": "6225888888888888",
  "wechat_account": "wx_ref_001",
  "alipay_account": null,
  "status": "active",
  "remark": "老客户转介绍"
}
```

### 返回字段

```json
{
  "data": {
    "id": "0a8dc242-a60f-4e1f-9b27-7d6d4b4dd321",
    "name": "王先生",
    "phone": "13800138000",
    "bank_name": "招商银行",
    "bank_account": "6225888888888888",
    "wechat_account": "wx_ref_001",
    "alipay_account": null,
    "status": "active",
    "remark": "老客户转介绍",
    "created_at": "2026-04-19T10:00:00.000Z",
    "updated_at": "2026-04-19T10:00:00.000Z"
  },
  "message": "success"
}
```

---

## 4. 项目介绍费创建接口

### 请求

```http
POST /project-referrals
Content-Type: application/json
```

```json
{
  "project_id": "31ad3bf6-31bb-4678-bac4-c91697dbd53a",
  "referrer_id": "0a8dc242-a60f-4e1f-9b27-7d6d4b4dd321",
  "rate_bps": 150,
  "remark": "签约介绍费按 1.5% 计算"
}
```

### 说明

- `rate_bps` 按基点存储
- `100 = 1%`
- `150 = 1.5%`
- `400 = 4%`

如果项目当前已经是 `signed` 且存在有效的 `signed_amount`，创建后会自动计算。

---

## 5. 项目介绍费查询返回结构

### `GET /project-referrals`

支持查询参数：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | `number` | 否 | 页码，默认 `1` |
| `pageSize` | `number` | 否 | 每页条数，默认 `20` |
| `status` | `string` | 否 | 介绍费状态筛选 |
| `project_id` | `string` | 否 | 按项目筛选 |

返回结构：

```json
{
  "data": {
    "list": [
      {
        "id": "ee9962ce-634b-4644-8cce-bf3f0f86e777",
        "project_id": "31ad3bf6-31bb-4678-bac4-c91697dbd53a",
        "referrer_id": "0a8dc242-a60f-4e1f-9b27-7d6d4b4dd321",
        "rate_bps": 150,
        "base_amount": 200000,
        "commission_amount": 3000,
        "status": "calculated",
        "calculated_at": "2026-04-19T12:00:00.000Z",
        "recalculated_at": null,
        "paid_at": null,
        "paid_evidence_images": [],
        "paid_remark": null,
        "paid_by": null,
        "remark": "签约介绍费按 1.5% 计算",
        "created_at": "2026-04-19T11:00:00.000Z",
        "updated_at": "2026-04-19T12:00:00.000Z",
        "project": {
          "id": "31ad3bf6-31bb-4678-bac4-c91697dbd53a",
          "name": "郑州龙湖天街项目",
          "status": "signed",
          "signed_amount": 200000,
          "customer_id": "cfbc4a07-6cb5-4f38-960f-9e2f81573fb9"
        },
        "referrer": {
          "id": "0a8dc242-a60f-4e1f-9b27-7d6d4b4dd321",
          "name": "王先生",
          "phone": "13800138000",
          "status": "active"
        },
        "paid_operator": null
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

### `GET /project-referrals/:id`

返回单条完整联查结构，字段与列表项一致。

### `GET /project-referrals/project?project_id=<projectId>`

按项目查询一条介绍费记录，返回结构与 `GET /project-referrals/:id` 一致。

---

## 6. 修改项目介绍费

### 请求

```http
PATCH /project-referrals/:id
Content-Type: application/json
```

```json
{
  "referrer_id": "70f3cb1d-b4f1-48b6-8f6a-a9998b8c6f22",
  "rate_bps": 200,
  "remark": "改为按 2% 计算"
}
```

### 规则

- 已计算但未支付：允许修改，并自动重算
- 已支付：接口会拒绝修改

---

## 7. 标记已支付

### 请求

```http
POST /project-referrals/:id/pay
Content-Type: application/json
```

```json
{
  "paid_at": "2026-04-19T15:30:00.000Z",
  "paid_evidence_images": [
    "https://example.com/receipt-1.jpg"
  ],
  "paid_remark": "已通过招商银行卡转账支付",
  "paid_by": "f2a2f1fa-0d20-4a8a-9d26-2a35a1945610"
}
```

### 规则

- 只有 `status = calculated` 的记录允许标记支付
- `paid_evidence_images` 至少传一张
- `paid_by` 必须传有效员工 ID

---

## 8. 前端 / 后台展示建议

介绍费列表建议展示：

1. `project.name`
2. `referrer.name`
3. `rate_bps / 100 + "%" `
4. `base_amount`
5. `commission_amount`
6. `status`
7. `calculated_at`
8. `paid_at`

介绍费详情建议展示：

- 项目名称
- 项目状态
- 签约金额
- 介绍人姓名 / 手机号
- 提成比例
- 介绍费金额
- 计算时间
- 重算时间
- 支付时间
- 支付登记人
- 支付凭证
- 支付备注

---

## 9. TypeScript 类型建议

```ts
type ProjectReferralItem = {
  id: string;
  project_id: string;
  referrer_id: string;
  rate_bps: number;
  base_amount: number | null;
  commission_amount: number | null;
  status: "pending" | "calculated" | "paid" | "cancelled";
  calculated_at: string | null;
  recalculated_at: string | null;
  paid_at: string | null;
  paid_evidence_images: string[];
  paid_remark: string | null;
  paid_by: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
  project: {
    id: string;
    name: string | null;
    status: string | null;
    signed_amount: number | null;
    customer_id: string | null;
  } | null;
  referrer: {
    id: string;
    name: string;
    phone: string | null;
    status: "active" | "inactive";
  } | null;
  paid_operator: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
};
```

---

## 10. 一句话结论

当前项目介绍费接口已经具备“配置介绍人、签约自动计算、未支付可修改重算、已支付留痕”的完整基础能力，前端或后台页可以直接按这份返回结构对接。
