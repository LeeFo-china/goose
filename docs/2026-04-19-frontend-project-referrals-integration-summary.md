# 项目介绍费前端对接摘要

本文档只面向前端 / 后台管理页联调。

以当前后端已经落地并已在远端 Supabase 验证通过的实现为准，不要再按旧方案稿自行猜测字段和流程。

如果前端需要直接照抄的请求封装和页面状态示例，再看：
[2026-04-19-frontend-project-referrals-code-examples.md](/Users/leefo/Public/work/gooes/docs/2026-04-19-frontend-project-referrals-code-examples.md:1)

---

## 1. 前端本次必须完成的改动

前端至少要完成这 2 件事：

1. 项目签约时补录 `signed_amount`
2. 对接“外部介绍人 / 项目介绍费”接口

如果当前页面还没做介绍费模块，也必须先把第 1 点接上，否则项目签约会直接失败。

---

## 2. 一句话记住这套流程

- `signed_amount` 不是创建项目时必填
- 项目状态改成 `signed` 时，`signed_amount` 必填
- 如果项目已配置介绍费规则，后端会自动计算 `commission_amount`
- 前端不需要单独调用“计算介绍费”接口
- 已支付后，`signed_amount / referrer_id / rate_bps` 全部只读

---

## 3. 接口总表

| 用途 | 方法 | 路径 | 前端何时调用 |
| :--- | :--- | :--- | :--- |
| 更新项目 | `PATCH` | `/projects/:id` | 项目签约、修改签约金额 |
| 外部介绍人列表 | `GET` | `/external-referrers?page=1&pageSize=20` | 介绍人下拉选择 |
| 新建外部介绍人 | `POST` | `/external-referrers` | 下拉里没有介绍人时 |
| 介绍费列表 | `GET` | `/project-referrals?page=1&pageSize=20` | 介绍费管理列表页 |
| 介绍费详情 | `GET` | `/project-referrals/:id` | 介绍费详情页 |
| 按项目查介绍费 | `GET` | `/project-referrals/project?project_id=<projectId>` | 项目编辑页、项目详情页 |
| 新建介绍费配置 | `POST` | `/project-referrals` | 首次给项目绑定介绍人和比例 |
| 修改介绍费配置 | `PATCH` | `/project-referrals/:id` | 未支付时修改介绍人或比例 |
| 标记介绍费已支付 | `POST` | `/project-referrals/:id/pay` | 财务登记支付 |

推荐前端统一使用 `PATCH`，不要混用 `PUT`。

---

## 4. 前端必须知道的真实后端规则

### 4.1 项目签约

当请求：

```http
PATCH /projects/:id
```

请求体为：

```json
{
  "status": "signed",
  "signed_amount": 200000
}
```

后端会做这些事：

- 校验 `signed_amount > 0`
- 更新项目
- 如果该项目已经存在 `project_referral` 配置，则自动计算介绍费

前端不要再额外调用“计算接口”。

### 4.2 介绍费配置存在但项目还没签约

如果先创建了介绍费配置，但项目状态还不是 `signed`：

- 介绍费记录会先存在
- 状态通常是 `pending`
- 不会立刻算金额

等项目后续签约并传入 `signed_amount` 后，后端才会自动变成 `calculated`。

### 4.3 项目已经签约后再新增介绍费配置

如果项目已经是 `signed`，并且已经有有效的 `signed_amount`：

- 新建 `project-referral` 后会自动计算
- 返回结果里通常已经是 `calculated`

### 4.4 已计算但未支付

只要介绍费还没支付，下面这些字段允许改：

- `signed_amount`
- `referrer_id`
- `rate_bps`

改完以后后端会自动重算。

### 4.5 已支付

只要介绍费已经支付，下面这些字段都不能再改：

- `signed_amount`
- `referrer_id`
- `rate_bps`

前端必须直接做成只读，不要等提交后才让用户看到报错。

---

## 5. `signed_amount` 的前端规则

### 5.1 创建项目

创建项目时可以不传：

```json
{
  "name": "龙湖天街项目",
  "status": "lead"
}
```

### 5.2 项目签约

项目状态切到 `signed` 时必须传：

```json
{
  "status": "signed",
  "signed_amount": 200000
}
```

### 5.3 项目已签约但介绍费未支付

允许只改单独的签约金额：

```json
{
  "signed_amount": 220000
}
```

### 5.4 项目已签约且介绍费已支付

前端必须：

- 禁用 `signed_amount` 输入框
- 禁止提交修改签约金额

因为数据库会直接拒绝。

---

## 6. 推荐调用顺序

### 6.1 项目编辑页初始化

进入项目编辑页后，建议这样查：

1. 先查项目详情
2. 再查 `GET /project-referrals/project?project_id=<projectId>`
3. 如果返回 `data = null`，表示当前项目还没有介绍费配置，不是异常

这里很重要：

- `data = null` 代表“没有配置介绍费”
- 不是接口报错
- 前端不要把它当成失败态弹窗

### 6.2 用户把项目状态改成 `signed`

前端流程建议固定成：

1. 用户选择状态 `signed`
2. 页面显示 `signed_amount`
3. 提交前校验 `signed_amount > 0`
4. 调 `PATCH /projects/:id`
5. 成功后重新请求 `GET /project-referrals/project?project_id=<projectId>`
6. 用最新返回刷新介绍费卡片

### 6.3 用户首次配置介绍费

前端流程建议：

1. 先调 `GET /external-referrers?page=1&pageSize=20`
2. 用户选择介绍人
3. 用户输入 `rate_bps`
4. 调 `POST /project-referrals`
5. 成功后重新请求 `GET /project-referrals/project?project_id=<projectId>`

### 6.4 用户修改介绍人或比例

前端流程建议：

1. 先判断当前介绍费状态不是 `paid`
2. 调 `PATCH /project-referrals/:id`
3. 成功后重新请求 `GET /project-referrals/project?project_id=<projectId>`

### 6.5 用户登记已支付

前端流程建议：

1. 先判断当前状态是 `calculated`
2. 收集支付时间、支付凭证、备注、支付登记人
3. 调 `POST /project-referrals/:id/pay`
4. 成功后重新请求详情
5. 把 `signed_amount / referrer_id / rate_bps` 全部切成只读

---

## 7. 请求示例

### 7.1 新建外部介绍人

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

### 7.2 创建项目介绍费配置

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

### 7.3 修改项目介绍费配置

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

### 7.4 标记已支付

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

---

## 8. 返回结构和字段语义

### 8.1 通用成功结构

列表接口：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "totalPages": 0
    }
  },
  "message": "success"
}
```

详情接口：

```json
{
  "data": {},
  "message": "success"
}
```

### 8.2 按项目查介绍费

请求：

```http
GET /project-referrals/project?project_id=<projectId>
```

有配置时，返回：

```json
{
  "data": {
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
  },
  "message": "success"
}
```

没有配置时，返回：

```json
{
  "data": null,
  "message": "success"
}
```

这不是异常，前端要按“未配置介绍费”处理。

### 8.3 字段解释

- `rate_bps`：提成比例，按基点传，`100 = 1%`，`150 = 1.5%`
- `base_amount`：本次计算基数，通常等于 `project.signed_amount`
- `commission_amount`：最终介绍费金额
- `status`：
  - `pending`：已配置但还没算
  - `calculated`：已计算，待支付
  - `paid`：已支付
  - `cancelled`：已作废
- `paid_evidence_images`：支付凭证图片数组
- `paid_operator`：登记支付的人

---

## 9. 前端字段格式化要求

### 9.1 `rate_bps`

后端传的是整数，不是百分比字符串。

前端不要传：

- `"1.5%"`
- `1.5`

前端应该传：

- `150`

展示时自己格式化：

```ts
const rateLabel = `${rate_bps / 100}%`;
```

### 9.2 金额

`signed_amount / base_amount / commission_amount` 都按金额处理。

前端建议统一保留两位小数展示。

---

## 10. 页面只读矩阵

| 当前状态 | 是否可改 `signed_amount` | 是否可改 `referrer_id` | 是否可改 `rate_bps` | 是否可点“标记已支付” |
| :--- | :--- | :--- | :--- | :--- |
| `pending` | 取决于项目是否允许编辑 | 可以 | 可以 | 不可以 |
| `calculated` | 可以 | 可以 | 可以 | 可以 |
| `paid` | 不可以 | 不可以 | 不可以 | 不可以 |
| `cancelled` | 按业务页面决定，当前建议只读 | 当前建议只读 | 当前建议只读 | 不可以 |

前端最重要的是把 `paid` 状态处理对。

---

## 11. 前端不要做的事

- 不要在项目签约后再额外调一个“计算介绍费”接口
- 不要把 `GET /project-referrals/project` 返回的 `data = null` 当成异常
- 不要把 `rate_bps` 当成百分比字符串提交
- 不要在 `paid` 状态下继续允许编辑介绍人、比例、签约金额
- 不要假设一个项目可以配置多条介绍费记录，当前是一项目一条

---

## 12. 常见报错和前端处理

### 12.1 项目签约时没传 `signed_amount`

后端会报：

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "项目签约时必须提供有效的 signed_amount"
}
```

前端处理：

- 提交前拦截
- 表单直接提示签约金额必填

### 12.2 已支付后仍尝试改签约金额

后端会报：

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "已支付介绍费的项目不允许修改 signed_amount"
}
```

前端处理：

- 页面直接禁用签约金额输入框

### 12.3 已支付后仍尝试改介绍人或比例

后端会拒绝。

前端处理：

- 页面直接禁用介绍人和比例编辑入口

### 12.4 支付时没传凭证

后端会报类似：

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "请至少上传一张支付凭证"
}
```

前端处理：

- 提交前校验至少一张支付凭证

---

## 13. TypeScript 类型建议

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

按项目查介绍费时，前端类型需要允许：

```ts
type GetProjectReferralResponse = {
  data: ProjectReferralItem | null;
  message: string;
};
```

---

## 14. 联调前最后自检

前端提测前请逐条确认：

- 项目签约时一定会传 `signed_amount`
- 创建项目时不会强制传 `signed_amount`
- 项目签约成功后会重新拉一次项目介绍费详情
- `GET /project-referrals/project` 的 `data = null` 已按“未配置”处理
- `rate_bps` 按整数基点传
- 已支付后 `signed_amount / referrer_id / rate_bps` 都是只读
- 支付时 `paid_evidence_images` 至少一张
- 支付时一定传 `paid_by`
- 列表和详情展示优先读取联查后的 `project / referrer / paid_operator`

---

## 15. 前端可以直接照着实现的最小方案

如果前端想一次通过，最小实现按这个顺序做：

1. 项目签约弹窗或编辑页补 `signed_amount`
2. 项目状态切到 `signed` 时强制校验签约金额
3. 项目页增加“介绍费卡片”，初始化时调用 `GET /project-referrals/project`
4. 没有介绍费配置时展示“去配置”
5. 已有配置时展示介绍人、比例、签约金额、介绍费金额、状态
6. `paid` 状态全部只读
7. 财务支付弹窗强制上传支付凭证并传 `paid_by`

做到以上这 7 条，联调就不会偏。
