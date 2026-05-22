# Admin 项目状态机对接文档

日期：2026-05-21

## 背景

项目状态只表达交付推进。Admin 项目详情页应展示当前状态、可执行动作和流转时间线，状态变更统一调用动作接口。

当前有效主路径：

`designing` 设计中 -> `proposal_confirmed` 方案已确认 -> `signed` 已签约 -> `design_finalized` 设计定稿 -> `pending_start` 待开工 -> `started` 已开工 -> `constructing` 施工中 -> `acceptance` 竣工验收

项目默认从 `designing` 开始。客户侧点击 `start_design` 时，应先创建/确认 `designing` 项目，再提交客户状态动作。

## 状态变更接口

```http
POST /projects/:id/status-transition
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "confirm_proposal",
  "metadata": {
    "source": "admin"
  }
}
```

请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `action` | string | 是 | 项目状态动作，见下方动作表 |
| `reason` | string | 条件必填 | `pause_project` / `mark_invalid` 必填，最长 500 字 |
| `signed_amount` | number | 条件必填 | `sign_contract` 必填且必须大于 0 |
| `metadata` | object | 否 | 建议传 `{ "source": "admin" }` |

成功返回更新后的项目详情数据。

## Admin 表单调整

- 新增项目默认 `designing`。
- 编辑项目基础信息时，`PATCH /projects/:id` payload 不包含 `status`。
- 项目详情页新增状态区域，展示当前状态、动作按钮和状态时间线。
- `sign_contract` 使用独立弹窗填写 `signed_amount > 0`。
- 项目签约成功后，后端自动把关联客户销售状态从 `designing` 推进到 `signed`；关联客户已是 `signed` 时保持不变。
- 项目签约不再写旧客户状态 `contracted`。

## 当前动作

| Action | From | To | Admin UI 建议 |
| --- | --- | --- | --- |
| `confirm_proposal` | `designing` | `proposal_confirmed` | 主按钮，紧挨“开始设计”右侧 |
| `sign_contract` | `proposal_confirmed` | `signed` | 主按钮，要求签约金额 |
| `finalize_design` | `signed` | `design_finalized` | 主按钮 |
| `schedule_construction` | `design_finalized` | `pending_start` | 主按钮，要求确认开工日期 |
| `start_project` | `pending_start` | `started` | 主按钮 |
| `start_construction` | `started` | `constructing` | 主按钮 |
| `start_acceptance` | `constructing` | `acceptance` | 主按钮 |
| `pause_project` | 多个进行中状态 | `on_hold` | 危险按钮，要求原因 |
| `resume_project` | `on_hold` | 暂停前状态 | 主按钮 |
| `mark_invalid` | 非 `invalid` 状态 | `invalid` | 危险按钮，要求原因 |

按钮渲染：

- 优先调用 `GET /projects/:id/status-actions` 渲染动作按钮。
- 响应里的 `actions[].requires_reason` 决定是否弹出原因输入。
- `resume_project` 由后端根据最近一次暂停日志里的 `paused_from_status` 计算目标状态，前端不要自己推断。

动作按钮建议排序：

1. 主推进动作：`confirm_proposal`、`sign_contract`、`finalize_design`、`schedule_construction`、`start_project`、`start_construction`、`start_acceptance`、`resume_project`。
2. 暂停动作：`pause_project`。
3. 危险动作：`mark_invalid`。

## 关键交互

项目处于 `designing` 时，当前阶段是“开始设计”。下一步必须是 `confirm_proposal`，按钮视觉上应紧挨“开始设计”右侧。项目不能从 `designing` 直接签约。

项目签约动作：

```json
{
  "action": "sign_contract",
  "signed_amount": 120000,
  "reason": "合同已确认",
  "metadata": {
    "source": "admin"
  }
}
```

签约前置规则：

- 当前项目状态必须是 `proposal_confirmed`。
- 必须填写 `signed_amount > 0`。
- 如果项目有关联客户，关联客户销售状态应处于 `designing` 或 `signed`。
- 关联客户为 `designing` 时，签约成功后后端同步写入客户状态 `signed`，并追加客户状态流转日志 `mark_signed`。

排期开工动作：

```json
{
  "action": "schedule_construction",
  "start_date": "2026-06-01",
  "metadata": {
    "source": "admin"
  }
}
```

排期开工前置规则：

- 当前项目状态必须是 `design_finalized`。
- 必须先确认 `start_date`。
- Admin 点击“排期开工”时弹出开工日期确认组件；用户未选择日期时不能提交状态动作。

暂停项目：

```json
{
  "action": "pause_project",
  "reason": "客户暂缓施工",
  "metadata": {
    "source": "admin"
  }
}
```

## 写操作限制

Admin 端需要处理以下 400 错误：

- `invalid / on_hold / acceptance` 项目不能新增施工日志。
- `invalid / acceptance` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目能发起或查看验收相关流程。

## 后端兼容边界

- 短期 `PATCH /projects/:id` 传 `status` 仍可能被后端推断为状态动作并校验。
- 新 Admin 代码不要依赖这个兼容路径。
- 项目 `lead / measure / negotiating / completed / after_sale` 已下线。
- 项目 `start_measure / start_negotiation / start_design / complete_project / start_after_sale` 已下线。

## Admin 验收清单

- 编辑已有项目保存时，请求 payload 不包含 `status`。
- 项目详情页能看到当前状态标签、动作按钮和时间线。
- `designing` 项目只能执行 `confirm_proposal`，不能直接 `sign_contract`。
- `proposal_confirmed` 项目能执行 `sign_contract`，且必须填写 `signed_amount > 0`。
- `signed` 项目的下一步是 `finalize_design`。
- `start_acceptance` 后项目进入 `acceptance`，不再进入旧 `completed` 或 `after_sale`。
- `pause_project` / `mark_invalid` 未填写原因不能提交。
- 状态动作成功后，详情、列表和动作按钮同步刷新。
