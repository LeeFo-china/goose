# Admin 项目状态机对接文档

日期：2026-05-21

## 背景

项目状态变更已进入状态机整改阶段。Admin 端应从“直接编辑项目 `status` 字段”调整为“展示当前状态可执行动作，并调用动作接口”。

## 状态变更接口

```http
POST /projects/:id/status-transition
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "pause_project",
  "reason": "客户暂停施工",
  "metadata": {
    "source": "admin"
  }
}
```

## Admin 表单调整

项目详情页：

- 不建议继续把 `status` 作为普通下拉字段直接保存。
- 状态区域展示当前状态、状态标签和可执行动作按钮。
- 需要原因的动作弹出确认框并要求填写原因。
- `sign_contract` 动作要求填写 `signed_amount`。
- `sign_contract` 如果项目有关联客户，会同步客户为 `contracted`。
- 关联客户必须处于 `following / arrived / ordered / contracted`，否则后端返回 400。

项目编辑页：

- 基础信息编辑仍使用 `PATCH /projects/:id`。
- 不要在普通保存里混入 `status`。
- 状态变化走 `POST /projects/:id/status-transition`。

## 当前动作

| Action | From | To | Admin UI 建议 |
| --- | --- | --- | --- |
| `start_measure` | `lead` | `measure` | 主按钮 |
| `start_negotiation` | `measure` | `negotiating` | 主按钮 |
| `sign_contract` | `negotiating` | `signed` | 主按钮，要求金额 |
| `start_design` | `signed` | `designing` | 主按钮 |
| `start_construction` | `signed/designing` | `constructing` | 主按钮 |
| `pause_project` | 多个进行中状态 | `on_hold` | 危险按钮，要求原因 |
| `resume_project` | `on_hold` | 暂停前状态 | 主按钮 |
| `start_acceptance` | `constructing` | `acceptance` | 主按钮 |
| `complete_project` | `constructing/acceptance` | `completed` | 主按钮，二次确认 |
| `start_after_sale` | `completed` | `after_sale` | 普通按钮 |
| `mark_invalid` | 非终态 | `invalid` | 危险按钮，要求原因 |

## 阶段 2 写操作限制

Admin 端需要处理以下 400 错误：

- `invalid / on_hold / completed` 项目不能新增施工日志。
- `invalid / completed` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目能发起验收。

建议：

- 在 UI 上提前禁用明显非法的新增按钮。
- 后端 400 仍作为最终准入规则，不要只依赖前端判断。
- 更新 / 删除已有摄像头暂时保留，用于运维纠错。

## 后续待接

- 状态流转日志列表接口。
- 项目详情展示状态流转时间线。
- 根据后端返回的“可执行动作列表”动态渲染按钮。
