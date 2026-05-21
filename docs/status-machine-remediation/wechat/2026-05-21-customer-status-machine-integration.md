# 小程序客户状态机对接文档

日期：2026-05-21

## 背景

客户状态已从直接写 `status` 逐步切换为动作驱动状态机。小程序员工端涉及客户状态变更时，应优先调用专用状态动作接口，不再把 `status` 当普通字段提交。

## 状态变更接口

```http
POST /customers/:id/status-transition
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "start_following",
  "reason": null,
  "metadata": {
    "source": "miniprogram"
  }
}
```

## 当前支持动作

| Action | 说明 |
| --- | --- |
| `start_following` | 开始跟进 |
| `mark_arrived` | 标记到店 |
| `place_order` | 客户下定 |
| `sign_contract` | 客户签约 |
| `mark_dormant` | 标记沉睡 |
| `reactivate` | 重新激活 |
| `mark_invalid` | 作废客户 |

## 必填规则

- `mark_dormant` 必须传 `reason`。
- `mark_invalid` 必须传 `reason`。
- 非法状态动作会返回 400。
- 无权限会返回 403。

## 对接要求

- 员工端不要再通过 `PATCH /customers/:id` 直接提交 `status`。
- 客户详情页状态按钮按当前状态展示合法动作。
- 暂无可执行动作时，不展示状态操作按钮。
- 服务端返回 400 时，直接展示后端中文错误信息。
- 状态变更成功后，重新拉取客户详情、客户列表和首页客户数据。
- 仍可用 `PATCH /customers/:id` 更新姓名、手机号、来源、负责人、房产信息等非状态字段。

## 当前动作矩阵

| From | 可执行动作 |
| --- | --- |
| `potential` | `start_following`, `mark_dormant`, `mark_invalid` |
| `following` | `mark_arrived`, `place_order`, `sign_contract`, `mark_dormant`, `mark_invalid` |
| `arrived` | `place_order`, `sign_contract`, `mark_dormant`, `mark_invalid` |
| `ordered` | `sign_contract`, `mark_dormant`, `mark_invalid` |
| `dormant` | `reactivate`, `mark_invalid` |
| `contracted` | 暂无动作 |
| `invalid` | 暂无动作 |

## 兼容说明

短期内 `PATCH /customers/:id` 传 `status` 仍兼容，但后端会推断动作并走状态机校验。`mark_dormant`、`mark_invalid` 缺少原因会返回 400，所以新的小程序代码必须使用动作接口。
