# 客户侧 1 元微信支付测试小程序对接说明

日期：2026-07-25

适用租户：固始晴天装饰工程有限公司

适用范围：gooes 后端与 orange 小程序对接说明。本仓库不修改
`/Users/leefo/Public/work/orange`。

## 结论

固始晴天装饰工程有限公司的微信支付申请完成后，客户侧 1 元真实支付测试应按
“后端创建测试支付订单 + 小程序调起微信支付 + 后端回调/查单确认状态”的方式接入。

当前 gooes 已有租户项目收款的微信支付核心能力：

- 服务商模式 JSAPI/小程序下单。
- 后端生成 `payment_request`。
- 微信支付回调验签、解密和订单状态闭环。
- 员工/财务侧项目收款接口 `POST /finance/wechat-pay/orders`。

但这个接口是员工/财务侧 workflow 收款接口，不适合直接放到客户页面做 1 元测试：

- 认证要求是员工 token 和租户上下文，不是客户 token。
- 请求必须带 `project_id`、`receivable_plan_id`、`workflow_task_id`。
- 当前员工必须有权处理对应收款 workflow task。
- 它会进入真实项目应收、财务台账和 workflow 闭环，不是独立的客户测试入口。

所以客户页面 1 元测试使用独立客户态 smoke 接口。小程序端只消费该接口返回的
`payment_request`，不要在前端拼微信支付参数、签名、商户号或 AppID。

## 官方依据

本说明按微信支付 APIv3 服务商模式小程序支付处理：

- [服务商小程序支付产品介绍](https://pay.weixin.qq.com/doc/v3/partner/4012085810.md)
- [服务商小程序支付开发指引](https://pay.weixin.qq.com/doc/v3/partner/4012076732.md)
- [服务商 JSAPI/小程序下单](https://pay.weixin.qq.com/doc/v3/partner/4012759974.md)
- [服务商小程序调起支付](https://pay.weixin.qq.com/doc/v3/partner/4012085827.md)
- [服务商商户订单号查单](https://pay.weixin.qq.com/doc/v3/partner/4012760115.md)
- [支付成功回调通知](https://pay.weixin.qq.com/doc/v3/partner/4012085801.md)

关键规则：

- 小程序不能直接请求微信支付下单接口；必须由后端调用微信支付 APIv3。
- 后端先下单拿 `prepay_id`，再用商户私钥生成小程序 `requestPayment` 参数。
- 小程序 `requestPayment:ok` 只代表客户端支付流程完成，最终状态以后端回调或查单为准。
- `prepay_id` 有效期有限，不应长期缓存。
- 1 元测试对应微信支付下单金额 `amount.total = 100`，单位是分。

## 后端现状核对

相关 gooes 文件：

```text
apps/api/src/controllers/finance/wechat-pay-controller.ts
apps/api/src/schema/wechat-pay-orders.ts
apps/api/src/services/wechat-pay-orders.ts
apps/api/src/services/wechat-pay-order-payment-request.ts
apps/api/src/services/wechat-pay-jsapi-request-builder.ts
apps/api/src/services/wechat-pay-gateway.ts
apps/api/src/services/wechat-pay-signatures.ts
apps/api/src/controllers/wechat-pay-callbacks/index.ts
```

现有财务侧接口：

```http
POST /finance/wechat-pay/orders
Authorization: Bearer <employee-token>
Content-Type: application/json
```

请求体：

```json
{
  "project_id": "project-id",
  "receivable_plan_id": "receivable-plan-id",
  "workflow_task_id": "workflow-task-id",
  "amount": 1,
  "payer_openid": "用户在当前小程序 AppID 下的 openid"
}
```

注意：这里的 `amount` 是元。后端在组装微信支付请求时会执行
`Math.round(Number(amount) * 100)` 转成分。因此 1 元测试应传 `amount: 1`，
不是 `100`。传 `100` 会变成 100 元。

返回重点：

```json
{
  "idempotent": false,
  "payment_request": {
    "timeStamp": "1782873600",
    "nonceStr": "nonce",
    "package": "prepay_id=wx-prepay-id",
    "signType": "RSA",
    "paySign": "signature"
  },
  "order": {
    "id": "wechat-payment-order-id",
    "out_trade_no": "WX202607250001",
    "status": "pending",
    "amount": 1
  }
}
```

该返回结构可以复用到客户态 smoke 接口。

## 已实现的客户态 smoke API 契约

### 1. 创建 1 元测试订单

```http
POST /customer/wechat-pay/smoke-test-orders
Authorization: Bearer <customer-token>
Content-Type: application/json
```

请求体：

```json
{
  "payer_openid": "用户在当前小程序 AppID 下的 openid"
}
```

字段要求：

| 字段 | 要求 | 说明 |
| --- | --- | --- |
| `payer_openid` | 必填 | 从当前客户登录态解析；缺失时小程序可 silent login 刷新登录态 |
| `idempotency_key` | 可选 | UUID；需要前端防重复点击时可传，不传也可正常创建订单 |

后端处理要求：

- 从客户 token 解析 `tenant_id`、`customer_id`，前端不传 `tenant_id`。
- 后端固定测试金额为 1 元，不允许前端传金额。
- 后端固定测试描述，例如：`固始晴天装饰微信支付测试-1元`。
- 后端使用该租户已激活的微信支付配置：
  - `merchant_mode = service_provider_sub_merchant`
  - `sub_merchant_id` 为固始晴天装饰特约商户号
  - `app_id` 为实际调起支付的小程序 AppID
  - 未配置 `sub_app_id` 时，后端按服务商小程序模式传 `payer.sp_openid`
- 记录订单元数据：
  - `source = customer_wechat_pay_smoke`
  - `tenant_id`
  - `customer_id`
  - `payer_openid`
- 重复提交同一个 `idempotency_key` 时返回同一笔 pending 订单。

响应体：

```json
{
  "idempotent": false,
  "order": {
    "id": "smoke-order-id",
    "order_no": "SMOKE202607250001",
    "out_trade_no": "WXSMOKE202607250001",
    "amount": 1,
    "amount_fen": 100,
    "status": "pending",
    "created_at": "2026-07-25T13:30:00+08:00",
    "paid_at": null
  },
  "payment_request": {
    "timeStamp": "1782873600",
    "nonceStr": "nonce",
    "package": "prepay_id=wx-prepay-id",
    "signType": "RSA",
    "paySign": "signature"
  },
  "server_time": "2026-07-25T13:30:01+08:00"
}
```

### 2. 查询测试订单状态

```http
GET /customer/wechat-pay/smoke-test-orders/:id
Authorization: Bearer <customer-token>
```

响应体：

```json
{
  "order": {
    "id": "smoke-order-id",
    "order_no": "SMOKE202607250001",
    "out_trade_no": "WXSMOKE202607250001",
    "amount": 1,
    "amount_fen": 100,
    "status": "paid",
    "trade_state": "SUCCESS",
    "trade_state_desc": "支付成功",
    "transaction_id": "4200000000000000000000000000",
    "created_at": "2026-07-25T13:30:00+08:00",
    "paid_at": "2026-07-25T13:30:12+08:00"
  }
}
```

状态枚举建议：

```text
pending | paid | closed | failed | refunded
```

小程序只把 `paid` 当作最终成功。`requestPayment:ok` 后仍应轮询该接口，直到
`paid` 或进入终态。

### 3. 错误码建议

| 错误码 | 前端提示建议 |
| --- | --- |
| `WECHAT_PAY_CONFIG_NOT_ACTIVE` | 当前商户微信支付尚未启用 |
| `WECHAT_PAY_CONFIG_NOT_VALIDATED` | 当前商户微信支付配置未验证通过 |
| `WECHAT_PAY_CHANNEL_NOT_ENABLED` | 当前商户未开启小程序收款 |
| `WECHAT_PAY_SUB_MERCHANT_NOT_READY` | 特约商户暂未完成授权或 AppID 绑定 |
| `WECHAT_PAY_PAYER_OPENID_REQUIRED` | 当前登录态缺少微信支付身份，请重新登录 |
| `WECHAT_PAY_PREPAY_FAILED` | 微信支付预下单失败，请稍后重试 |
| `WECHAT_PAY_ORDER_IDEMPOTENCY_CONFLICT` | 正在处理上一笔测试订单，请稍后刷新 |
| `PAYMENT_ORDER_NOT_FOUND` | 测试订单不存在或无权访问 |

## 小程序端建议改动

orange 仓库只读检查到的可复用位置：

```text
/Users/leefo/Public/work/orange/src/utils/api.ts
/Users/leefo/Public/work/orange/src/utils/https.ts
/Users/leefo/Public/work/orange/src/utils/wechat_payment.ts
/Users/leefo/Public/work/orange/src/utils/jwt_payload.ts
/Users/leefo/Public/work/orange/src/utils/idempotency.ts
/Users/leefo/Public/work/orange/src/packageEmployees/pages/creditRecharge/index.tsx
/Users/leefo/Public/work/orange/src/packageCustomerPortal/pages/customer-home/index.tsx
/Users/leefo/Public/work/orange/src/packageCustomerPortal/pages/customer-project-detail/index.tsx
/Users/leefo/Public/work/orange/src/packageCustomerPortal/pages/customer-project-detail/components/CustomerProjectDetailContent.tsx
```

### 推荐落点

优先放在客户项目详情页，而不是只放客户首页。

原因：当前 `customer-home/index.tsx` 在客户只有一个项目时会自动
`redirectToSingleProject` 跳转到项目详情。如果入口只放首页，单项目客户可能看不到
测试按钮。

推荐：

- 主入口：客户项目详情页的操作区或项目菜单。
- 可选入口：客户首页多项目卡片底部增加“微信支付测试（1 元）”按钮。
- 如果产品明确要求必须在客户首页展示测试入口，需要先调整单项目自动跳转逻辑，或在跳转前显示测试入口。

### 新增类型文件

建议新增：

```text
src/types/api/customer_wechat_pay_smoke.d.ts
```

```ts
export interface CustomerWechatPaySmokePaymentRequest {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}

export type CustomerWechatPaySmokeOrderStatus =
  | 'pending'
  | 'paid'
  | 'closed'
  | 'failed'
  | 'refunded';

export interface CustomerWechatPaySmokeOrder {
  id: string;
  order_no: string;
  out_trade_no: string;
  amount: number;
  amount_fen: number;
  status: CustomerWechatPaySmokeOrderStatus;
  trade_state?: string | null;
  trade_state_desc?: string | null;
  transaction_id?: string | null;
  created_at: string;
  paid_at?: string | null;
}

export interface CreateCustomerWechatPaySmokeOrderPayload {
  payer_openid: string;
  idempotency_key: string;
  source: 'customer_home' | 'customer_project_detail';
}

export interface CreateCustomerWechatPaySmokeOrderResponse {
  order: CustomerWechatPaySmokeOrder;
  payment_request: CustomerWechatPaySmokePaymentRequest | null;
  server_time?: string;
}

export interface CustomerWechatPaySmokeOrderDetailResponse {
  order: CustomerWechatPaySmokeOrder;
}
```

### 新增服务文件

建议新增：

```text
src/services/customer_wechat_pay_smoke.ts
```

```ts
import { api } from '@/utils/api';
import type {
  CreateCustomerWechatPaySmokeOrderPayload,
  CreateCustomerWechatPaySmokeOrderResponse,
  CustomerWechatPaySmokeOrderDetailResponse,
} from '@/types/api/customer_wechat_pay_smoke';

export const CustomerWechatPaySmokeService = {
  createOrder: (payload: CreateCustomerWechatPaySmokeOrderPayload) =>
    api.post<CreateCustomerWechatPaySmokeOrderResponse>(
      '/customer/wechat-pay/smoke-test-orders',
      payload,
      { showErrorToast: false },
    ),

  getOrder: (id: string) =>
    api.get<CustomerWechatPaySmokeOrderDetailResponse>(
      `/customer/wechat-pay/smoke-test-orders/${id}`,
      {},
      { showErrorToast: false },
    ),
};
```

再从 `src/services/index.ts` 导出。

### 支付处理模式

客户侧可直接复用员工积分充值页的处理模式：

1. 按钮点击后先防重复点击。
2. 从当前 token 解析微信 openid。
3. openid 缺失时调用 `AuthService.silentLogin({ forceRefresh: true })` 刷新登录态。
4. 调后端创建 1 元测试订单。
5. 用 `src/utils/wechat_payment.ts` 的 `requestWechatPayment(payment_request)` 调起支付。
6. `requestPayment` 返回后，轮询后端订单状态。
7. 以后端 `order.status === 'paid'` 展示最终成功。

示例伪代码：

```ts
const SMOKE_ORDER_MAX_POLL_ATTEMPTS = 10;
const SMOKE_ORDER_POLL_INTERVAL_MS = 1500;

const delay = (duration: number) =>
  new Promise((resolve) => setTimeout(resolve, duration));

const resolvePayerOpenid = async () => {
  const token = useAuthStore.getState().token || Taro.getStorageSync('token') || '';
  const storedOpenid = getWechatOpenIdFromAuthToken(token);
  if (storedOpenid) return storedOpenid;

  const auth = await AuthService.silentLogin({
    forceRefresh: true,
    source: 'customer-wechat-pay-smoke:resolve-openid',
  });
  return getWechatOpenIdFromAuthToken(auth.token || '');
};

const pollSmokeOrder = async (orderId: string) => {
  for (let attempt = 0; attempt < SMOKE_ORDER_MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await CustomerWechatPaySmokeService.getOrder(orderId);
    const order = response.data.order;
    if (order.status === 'paid') return order;
    if (['closed', 'failed', 'refunded'].includes(order.status)) return order;
    await delay(SMOKE_ORDER_POLL_INTERVAL_MS);
  }
  return null;
};

const handleWechatPaySmoke = async () => {
  if (paying) return;
  setPaying(true);

  try {
    const payerOpenid = await resolvePayerOpenid();
    if (!payerOpenid) {
      await Taro.showModal({
        title: '无法发起微信支付',
        content: '当前登录态缺少微信支付身份，请退出后重新通过微信登录。',
        showCancel: false,
      });
      return;
    }

    const response = await CustomerWechatPaySmokeService.createOrder({
      payer_openid: payerOpenid,
      idempotency_key: createUuidV4(),
      source: 'customer_project_detail',
    });

    const { order, payment_request: paymentRequest } = response.data;
    if (!paymentRequest) {
      await Taro.showModal({
        title: '订单暂不可支付',
        content: '后端未返回微信支付参数，请稍后刷新订单状态后再试。',
        showCancel: false,
      });
      return;
    }

    await requestWechatPayment(paymentRequest);

    const paidOrder = await pollSmokeOrder(order.id);
    if (paidOrder?.status === 'paid') {
      Taro.showToast({ title: '1 元测试支付成功', icon: 'success' });
    } else {
      await Taro.showModal({
        title: '支付处理中',
        content: '微信支付已返回，后端仍在确认到账。请稍后刷新。',
        showCancel: false,
      });
    }
  } catch (error) {
    const errMsg =
      typeof (error as { errMsg?: unknown })?.errMsg === 'string'
        ? (error as { errMsg: string }).errMsg
        : '';

    if (errMsg.includes('cancel')) {
      Taro.showToast({ title: '支付已取消', icon: 'none' });
      return;
    }

    console.error('customer wechat pay smoke failed:', error);
    Taro.showToast({ title: '支付测试失败，请稍后重试', icon: 'none' });
  } finally {
    setPaying(false);
  }
};
```

前端注意：

- 不要在小程序里生成 `paySign`。
- 不要在小程序里维护 `sp_mchid`、`sub_mchid`、`sp_appid`、`sub_appid`。
- 不要把 `requestPayment:ok` 当成支付成功入账。
- 不要让前端传测试金额；1 元必须由后端固定。
- 按钮必须有 loading/disabled，避免重复点击。
- UI 文案要明确“真实扣款 1 元”。

建议按钮文案：

```text
微信支付测试（1 元）
用于验证固始晴天装饰微信收款链路，真实扣款 1 元。
```

## 验收清单

准备条件：

- 使用固始晴天装饰工程有限公司租户。
- 租户微信支付配置为 active/valid。
- 特约商户已开通 JSAPI/小程序支付。
- AppID 已绑定，且付款人的 openid 属于实际调起支付的小程序 AppID。
- 后端回调地址可公网访问。

小程序 smoke：

1. 用客户身份进入客户项目详情页。
2. 点击“微信支付测试（1 元）”。
3. 微信收银台展示金额 `¥1.00`。
4. 微信收银台商户信息符合预期的服务商/特约商户收款展示。
5. 完成支付。
6. 小程序先显示“正在确认支付结果”。
7. 后端订单状态变为 `paid`。
8. 订单记录有 `transaction_id`、`paid_at`。
9. 支付回调通知已处理成功。
10. 重复点击不会产生多笔重复待支付订单。
11. 用户取消支付时，小程序提示“支付已取消”，不展示成功。

后端核对：

- 微信下单金额 `amount.total = 100`。
- 服务商小程序模式下，下单 body 使用：
  - `sp_appid`
  - `sp_mchid`
  - `sub_mchid`
  - `payer.sp_openid`
- `payment_request.paySign` 使用实际调起支付的小程序 AppID 签名。
- 回调和主动查单以 `sp_mchid + sub_mchid + out_trade_no + amount` 校验资金归属。

## 给小程序端的说明

可以直接转给小程序团队：

```text
这次不要让小程序直接对接微信支付 API。后端会提供客户态 1 元测试支付接口：

POST /customer/wechat-pay/smoke-test-orders
GET  /customer/wechat-pay/smoke-test-orders/:id

小程序在客户项目详情页放一个“微信支付测试（1 元）”入口。点击后从当前登录态拿 openid，
POST 创建测试订单；后端返回 payment_request 后，直接复用 src/utils/wechat_payment.ts
调用 Taro.requestPayment。前端不要生成 paySign，不要维护商户号/AppID，不要传金额。

requestPayment 的 success/cancel/fail 只用于交互提示，最终支付结果必须轮询后端订单详情，
以后端 order.status === 'paid' 为准。

实现模式参考 src/packageEmployees/pages/creditRecharge/index.tsx：
取 openid → 创建订单 → requestWechatPayment(payment_request) → 轮询后端状态。

注意：1 元金额由后端固定。现有 /finance/wechat-pay/orders 是员工/财务 workflow 收款接口，
不是客户页面接口，不要在客户页直接调用。
```

## 当前缺口

gooes 后端已实现并挂载
`/customer/wechat-pay/smoke-test-orders` 客户态 smoke 路由，开发库已应用
`20260725194000_customer_wechat_pay_smoke_orders.sql` migration。

小程序侧继续按本文接口调用，不要把客户小程序页面接到 `/finance/wechat-pay/orders`。
