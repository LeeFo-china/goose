# Admin 客户状态机对接文档

日期：2026-05-21

## 背景

客户状态变更已进入状态机整改阶段。Admin 端应从“直接编辑客户 `status` 字段”调整为“展示当前状态可执行动作，并调用动作接口”。

## 状态变更接口

```http
POST /customers/:id/status-transition
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "mark_dormant",
  "reason": "客户近期无装修计划",
  "metadata": {
    "source": "admin"
  }
}
```

## Admin 表单调整

客户详情页：

- 不建议继续把 `status` 作为普通下拉字段直接保存。
- 状态区域展示当前状态、状态标签和可执行动作按钮。
- 需要原因的动作弹出确认框并要求填写原因。
- `contracted` 和 `invalid` 当前暂无后续动作。

客户编辑页：

- 基础信息编辑仍使用 `PATCH /customers/:id`。
- 不要在普通保存里混入 `status`。
- 状态变化走 `POST /customers/:id/status-transition`。

## 当前动作

| Action | From | To | Admin UI 建议 |
| --- | --- | --- | --- |
| `start_following` | `potential` | `following` | 主按钮 |
| `mark_arrived` | `following` | `arrived` | 主按钮 |
| `place_order` | `following/arrived` | `ordered` | 主按钮 |
| `sign_contract` | `following/arrived/ordered` | `contracted` | 主按钮，二次确认 |
| `mark_dormant` | `potential/following/arrived/ordered` | `dormant` | 普通按钮，要求原因 |
| `reactivate` | `dormant` | `following` | 主按钮 |
| `mark_invalid` | `potential/following/arrived/ordered/dormant` | `invalid` | 危险按钮，要求原因 |

## 错误处理

Admin 端需要处理以下 400 错误：

- 当前客户状态不允许执行该动作。
- 该状态动作必须填写原因。
- 当前客户状态不允许直接变更为目标状态。

建议：

- 在 UI 上提前禁用明显非法的状态按钮。
- 后端 400 仍作为最终准入规则，不要只依赖前端判断。
- 状态变更成功后，刷新客户详情、客户列表和首页统计。

## 后续待接

- 状态流转日志列表接口。
- 客户详情展示状态流转时间线。
- 根据后端返回的“可执行动作列表”动态渲染按钮。
