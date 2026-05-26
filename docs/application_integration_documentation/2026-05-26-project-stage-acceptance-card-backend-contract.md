# 员工端施工阶段卡片验收入口后端对接说明

## 对接状态

已对接。

小程序文档来源：

```text
/Users/leefo/Public/work/orange/docs/2026-05-26-project-stage-acceptance-card-backend-contract.md
```

## 涉及接口

```http
GET /projects/:projectId/construction-stages
```

## 后端返回增强

每个 `stages[]` item 继续稳定返回：

- `acceptance_id`
- `acceptance_status`
- `can_create_acceptance`
- `blocked_reason`

同时新增结构化字段，供小程序后续减少状态硬编码：

- `acceptance`
- `acceptance_action`

示例：

```json
{
  "stage_code": "demolition",
  "stage_label": "拆改",
  "status": "accepted",
  "can_create_acceptance": false,
  "acceptance_id": "acceptance-uuid",
  "acceptance_status": "customer_confirmed",
  "acceptance": {
    "id": "acceptance-uuid",
    "status": "customer_confirmed",
    "status_label": "已完成",
    "stage_code": "demolition",
    "stage_label": "拆改",
    "reviewed_at": "2026-05-26T10:20:00.000Z",
    "customer_confirmed_at": "2026-05-26T11:00:00.000Z",
    "updated_at": "2026-05-26T11:00:00.000Z"
  },
  "acceptance_action": {
    "type": "view",
    "label": "查看",
    "enabled": true,
    "reason": null
  },
  "blocked_reason": null
}
```

## 验收单选择规则

同一项目同一阶段存在多张验收单时，后端按状态优先级选择卡片入口：

1. `draft`、`rejected`
2. `submitted`、`leader_approved`
3. `customer_confirmed`

同优先级内按 `updated_at desc` 选择。

`cancelled` 不作为阶段卡片入口。

## 权限口径

- 项目可见性仍先校验 `project.read`。
- 有 `project_acceptance.read` 或 `project_acceptance.manage` 且项目在对应权限范围内时，才返回 `acceptance_id` / `acceptance`。
- 有 `project_acceptance.create` 且项目在对应权限范围内，阶段也允许创建时，才返回 `can_create_acceptance=true`。
- 无验收查看权限时，阶段 item 的 `acceptance_id` 和 `acceptance_status` 返回 `null`。

## 动作口径

`acceptance_action.type`：

- `edit`：已有 `draft` 或 `rejected` 验收单，显示“处理验收”。
- `view`：已有其他可查看验收单，显示“查看”。
- `create`：无验收单且当前员工可发起验收，显示“发起验收”。
- `none`：不展示阶段卡片动作。

## 小程序联调建议

1. 已客户确认阶段应显示“查看”。
2. 草稿或驳回阶段应显示“处理验收”。
3. 当前可发起阶段应显示“发起验收”。
4. 无验收权限员工不应看到验收动作。
