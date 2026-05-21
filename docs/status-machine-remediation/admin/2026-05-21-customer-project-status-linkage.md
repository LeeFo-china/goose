# Admin 客户项目状态联动对接文档

日期：2026-05-21

## 背景

阶段 4 开始，项目签约会联动客户签约状态。Admin 端应把正式签约操作放在项目详情页，客户详情页只展示客户生命周期状态和必要的状态动作。

当前 Admin 影响文件：

- `apps/admin/components/projects/project-mutations.tsx`
- `apps/admin/components/customers/customer-mutations.tsx`

目标：

- 项目详情页提供正式签约入口。
- 项目签约弹窗补录 `signed_amount`。
- 项目签约成功后刷新项目和关联客户相关视图。
- 客户详情页保留客户状态展示，但不作为正式项目签约的主入口。

## 项目签约接口

```http
POST /projects/:id/status-transition
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "sign_contract",
  "signed_amount": 120000,
  "reason": "合同已上传并确认金额",
  "metadata": {
    "source": "admin"
  }
}
```

## 联动规则

- 项目有关联客户时，项目签约成功后客户会同步为 `contracted`。
- 客户状态同步会写入 `customer_status_transition_logs`，metadata 包含 `source=project_sign_contract` 和 `project_id`。
- 客户已是 `contracted` 时，不重复写客户状态日志。
- 项目没有关联客户时，当前阶段不阻断项目签约。
- 项目作废、暂停、完工不会反向自动修改客户状态。
- 客户作废不会自动作废项目，避免多项目客户被误伤。

## 前置状态要求

项目签约时，关联客户必须处于以下状态之一：

- `designing`
- `contracted`

如果客户仍是 `potential / following / arrived / ordered / dormant / invalid`，后端返回 400：

```json
{
  "message": "项目签约前，关联客户状态必须为设计中"
}
```

Admin 处理方式：

- 在项目详情签约按钮前检查关联客户状态，状态不满足时禁用或提示。
- 后端 400 仍作为最终准入规则。
- 签约成功后刷新项目详情、客户详情、项目列表和客户列表。

## Admin 签约弹窗建议

入口：

- 项目详情页状态动作区的“项目签约”按钮。
- 仅当前项目状态为 `negotiating` 时展示。

弹窗字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| 签约金额 | number | 是 | 提交为 `signed_amount`，必须大于 0 |
| 关联客户 | readonly | 否 | 展示客户姓名和当前客户状态 |
| 原因 / 备注 | textarea | 否 | 提交为 `reason`，建议默认“合同已确认” |

提交前校验：

- `signed_amount > 0`。
- 如果项目有关联客户，客户状态必须是 `designing / contracted`。
- 如果关联客户状态不满足，提示“请先在客户详情中推进客户状态，再进行项目签约”。

提交 payload：

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

提交成功后：

- 更新项目详情中的 `status`、`signed_amount`。
- 更新项目列表中的项目状态。
- 如果有关联客户，刷新客户详情和客户列表。
- 如果当前页面展示项目介绍费或统计数据，一并刷新。

## 客户签约入口

客户详情页的 `sign_contract` 当前不强制选择项目。后续若要强制“客户签约必须选择或创建项目”，需要先补齐 Admin 的项目选择 / 创建交互，再收紧后端校验。

当前 Admin 建议：

- 客户详情页可以展示“客户签约”，但文案应提示“正式签约建议从项目详情完成”。
- 如果客户没有关联项目，不建议在客户侧直接签约，避免客户进入 `contracted` 但没有项目签约金额。
- 客户侧签约不填写 `signed_amount`，不会触发项目介绍费相关计算。

## 多项目客户处理

当前规则：

- 任一项目签约成功后，客户进入 `contracted`。
- 项目后续暂停、作废、完工，不自动回滚客户状态。
- 如果客户已有多个项目，作废其中一个项目不影响客户签约状态。

Admin 展示建议：

- 客户详情页展示关联项目列表时，项目状态以项目自身为准。
- 客户状态 `contracted` 只表示客户生命周期已签约，不代表所有项目均已签约。
- 项目详情页签约成功后，应优先展示项目自己的 `signed_amount`，不要从客户状态推断签约金额。

## 错误处理

| 后端 message | Admin 处理 |
| --- | --- |
| `项目签约时必须提供有效的 signed_amount` | 保持签约弹窗打开，提示填写大于 0 的签约金额 |
| `项目签约前，关联客户状态必须为设计中` | 提示先推进客户到设计中，提供查看客户入口 |
| 当前项目状态不允许执行该动作 | 刷新项目详情，重新计算动作按钮 |

## 验收清单

- `negotiating` 项目详情页展示“开始设计”按钮，不展示“项目签约”按钮。
- `designing` 项目详情页展示“项目签约”按钮，点击后弹出签约弹窗，要求填写签约金额。
- 未填写 `signed_amount` 或金额小于等于 0 时不能提交。
- 关联客户为 `potential / following / arrived / ordered / dormant / invalid` 时，前端禁用或提示不能签约。
- 关联客户为 `designing` 时，签约成功后客户变为 `contracted`。
- 关联客户已是 `contracted` 时，项目签约成功且不重复写客户状态日志。
- 项目无关联客户时，当前阶段签约不被阻断。
