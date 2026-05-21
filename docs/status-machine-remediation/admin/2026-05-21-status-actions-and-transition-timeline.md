# Admin 状态动作和时间线对接文档

日期：2026-05-21

## 背景

Admin 端项目详情和客户详情需要从“状态下拉保存”调整为“后端动作列表 + 动作按钮 + 状态时间线”。后端已经提供可执行动作和流转日志接口。

## 可执行动作接口

项目：

```http
GET /projects/:id/status-actions
Authorization: Bearer <employee_token>
```

客户：

```http
GET /customers/:id/status-actions
Authorization: Bearer <employee_token>
```

响应字段：

| 字段 | 说明 |
| --- | --- |
| `current_status` | 当前状态 |
| `paused_from_status` | 仅项目暂停态可能返回，缺少暂停上下文时为 `null` |
| `actions[].action` | 状态动作编码 |
| `actions[].label` | 按钮文案 |
| `actions[].from_status` | 动作起始状态 |
| `actions[].to_status` | 动作目标状态 |
| `actions[].requires_reason` | 是否必须填写原因 |

## 流转日志接口

项目：

```http
GET /projects/:id/status-transitions?page=1&pageSize=20
Authorization: Bearer <employee_token>
```

客户：

```http
GET /customers/:id/status-transitions?page=1&pageSize=20
Authorization: Bearer <employee_token>
```

日志按 `created_at desc` 返回，结构：

| 字段 | 说明 |
| --- | --- |
| `from_status` | 变更前状态 |
| `to_status` | 变更后状态 |
| `action` | 动作编码 |
| `operator_employee_id` | 操作员工 ID |
| `operator_auth_user_id` | 操作认证用户 ID |
| `reason` | 操作原因 |
| `metadata` | 动作上下文 |
| `created_at` | 操作时间 |

## Admin 改造要求

- 项目编辑页和客户编辑页不要再把 `status` 放在普通表单保存里。
- 项目详情和客户详情顶部状态区域调用 `status-actions` 渲染按钮。
- `requires_reason=true` 的动作必须弹窗填写原因。
- 状态动作成功后刷新详情、列表、动作列表和时间线。
- 时间线默认展示最近 20 条，支持分页加载。
- 后端 400 / 403 是最终准入结果，Admin 端提前禁用只能作为体验优化。
