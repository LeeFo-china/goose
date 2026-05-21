# 小程序项目状态机对接文档

日期：2026-05-21

## 背景

项目状态已从直接写 `status` 逐步切换为动作驱动状态机。小程序员工端后续涉及项目状态变更时，应优先调用专用状态动作接口，而不是直接提交目标 `status`。

## 状态变更接口

```http
POST /projects/:id/status-transition
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "start_construction",
  "reason": "现场已具备施工条件",
  "metadata": {}
}
```

签约动作需要金额：

```json
{
  "action": "sign_contract",
  "signed_amount": 120000,
  "reason": "客户已签施工合同",
  "metadata": {
    "source": "miniprogram"
  }
}
```

## 当前支持动作

| Action | 说明 |
| --- | --- |
| `start_measure` | 开始量房 |
| `start_negotiation` | 开始谈单 |
| `start_design` | 开始设计 |
| `sign_contract` | 项目签约 |
| `start_construction` | 开始施工 |
| `pause_project` | 暂停项目 |
| `resume_project` | 恢复项目 |
| `start_acceptance` | 开始验收 |
| `complete_project` | 项目完工 |
| `start_after_sale` | 进入售后 |
| `mark_invalid` | 作废项目 |

## 必填规则

- `sign_contract` 必须传 `signed_amount > 0`。
- `sign_contract` 仅允许项目处于 `designing` 时执行，不能从 `negotiating` 跳过设计直接签约。
- `sign_contract` 如果项目有关联客户，会同步客户为 `contracted`。
- 关联客户必须处于 `designing / contracted`；如果仍是 `potential / following / arrived / ordered / dormant / invalid`，后端返回 400。
- `pause_project` 必须传 `reason`。
- `mark_invalid` 必须传 `reason`。
- 非法状态动作会返回 400。
- 无权限会返回 403。

## 阶段 2 写操作限制

小程序端需要根据接口返回处理错误提示：

- `invalid / on_hold / completed` 项目不能新增施工日志。
- `invalid / completed` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目能发起验收。
- 历史施工日志、历史摄像头、历史验收单仍可读取。

## 对接要求

- 员工端不要再直接通过 `PATCH /projects/:id` 提交 `status`。
- 状态按钮应按当前项目状态展示合法动作。
- 暂无可执行动作时，不展示状态操作按钮。
- 服务端返回 400 时，直接展示后端中文错误信息。
- 状态变更成功后，重新拉取项目详情、项目列表和首页统计。

## 兼容说明

短期内 `PATCH /projects/:id` 传 `status` 仍兼容，但后端会推断动作并走状态机校验。该兼容入口后续会逐步收口，新的小程序代码不要依赖它。
