# 小程序客户状态机对接文档

日期：2026-05-21

## 背景

客户状态只表达销售推进，小程序员工端不要再把 `status` 当普通字段提交。状态按钮应从后端动作接口读取。

当前有效主路径：

`potential` 线索 -> `following` 跟进中 -> `arrived` 已到店 -> `designing` 设计中

客户点击 `start_design` 时，小程序端必须先完成项目创建/确认；项目存在后才调用客户状态动作进入 `designing`。后端要求客户已有主房产信息，并会复用同客户同房产的有效项目作为兜底。

## 开始设计两步接入

小程序端不能把 `start_design` 作为普通状态按钮直接提交，应按下面顺序执行：

1. 员工在 `arrived` 客户详情点击“开始设计”。
2. 展示项目创建/确认表单，确认客户、主房产和项目基础信息。
3. 如果客户没有主房产，在同一个表单内补齐主房产，并先调用 `POST /customers/:id/properties` 创建且设为主房产。
4. 再调用 `POST /projects` 创建/确认项目，项目状态传 `designing`。
5. 项目创建/确认成功后，再调用 `POST /customers/:id/status-transition` + `start_design`。
6. 任一步失败都不更新本地客户状态，直接展示后端中文错误。

项目创建请求体示例：

```json
{
  "name": "张三 - 某小区 1-101 设计项目",
  "customer_id": "customer_uuid",
  "property_id": "property_uuid",
  "status": "designing",
  "designer_id": null,
  "supervisor_id": null,
  "budget": null,
  "start_date": null,
  "address": "某小区 1-101",
  "visibility_status": "inherit",
  "style_tags": []
}
```

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
| `start_design` | 开始设计，需先创建/确认项目 |
| `mark_dormant` | 标记沉睡 |
| `reactivate` | 重新激活 |
| `mark_invalid` | 作废客户 |

## 当前动作矩阵

| From | 可执行动作 |
| --- | --- |
| `potential` | `start_following`, `mark_dormant`, `mark_invalid` |
| `following` | `mark_arrived`, `mark_dormant`, `mark_invalid` |
| `arrived` | `start_design`, `mark_dormant`, `mark_invalid` |
| `designing` | `mark_dormant`, `mark_invalid` |
| `dormant` | `reactivate`, `mark_invalid` |
| `invalid` | 暂无动作 |

## 必填规则

- `mark_dormant` 必须传 `reason`。
- `mark_invalid` 必须传 `reason`。
- `start_design` 要求客户已有主房产信息，并且端侧已完成项目创建/确认。
- 非法状态动作会返回 400。
- 无权限会返回 403。

## 对接要求

- 员工端不要再通过 `PATCH /customers/:id` 直接提交 `status`。
- 客户详情页状态按钮按 `GET /customers/:id/status-actions` 返回值展示。
- `start_design` 按钮点击后先进入项目创建/确认流程，不直接提交状态动作。
- 缺少主房产时，在项目创建/确认流程内先补齐主房产。
- 项目创建/确认失败时，不调用客户 `start_design`。
- 暂无可执行动作时，不展示状态操作按钮。
- 服务端返回 400 时，直接展示后端中文错误信息。
- 状态变更成功后，重新拉取客户详情、客户列表、动作列表和首页客户数据。
- 仍可用 `PATCH /customers/:id` 更新姓名、手机号、来源、负责人、房产信息等非状态字段。

## 下线说明

客户 `ordered / contracted` 状态，以及 `place_order / sign_contract` 动作已下线。小程序端不要再展示“下定”“客户签约”按钮；签约属于项目交付阶段，走项目 `sign_contract`。
