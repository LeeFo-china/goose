# 小程序项目状态机对接文档

日期：2026-05-21

## 背景

项目状态只表达交付推进。小程序员工端涉及项目状态变更时，应调用专用状态动作接口，不要直接提交目标 `status`。

当前有效主路径：

`designing` 设计中 -> `proposal_confirmed` 方案已确认 -> `signed` 已签约 -> `design_finalized` 设计定稿 -> `pending_start` 待开工 -> `started` 已开工 -> `constructing` 施工中 -> `acceptance` 竣工验收

## 共享包要求

小程序端如果依赖 `@gooes/domain`，需要升级到 `@gooes/domain@1.11.0` 或更高版本。不要继续使用包含 `lead / measure / negotiating / completed / after_sale` 项目状态和旧工程动作的版本。

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
    "source": "miniprogram"
  }
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

排期开工动作需要开工日期和工程负责人：

```json
{
  "action": "schedule_construction",
  "start_date": "2026-06-01",
  "construction_manager_employee_id": "employee-id",
  "metadata": {
    "source": "miniprogram"
  }
}
```

## 当前支持动作

| Action | 说明 |
| --- | --- |
| `confirm_proposal` | 方案已确认 |
| `sign_contract` | 项目签约 |
| `finalize_design` | 设计定稿 |
| `schedule_construction` | 排期开工 |
| `start_project` | 确认开工 |
| `start_construction` | 正式进场 |
| `start_acceptance` | 竣工验收 |
| `pause_project` | 暂停项目 |
| `resume_project` | 恢复项目 |
| `mark_invalid` | 作废项目 |

## 必填规则

- `sign_contract` 必须传 `signed_amount > 0`。
- `sign_contract` 仅允许项目处于 `proposal_confirmed` 时执行，不能从 `designing` 跳过方案确认直接签约。
- 项目签约成功后，后端自动把关联客户销售状态从 `designing` 推进到 `signed`；关联客户已是 `signed` 时保持不变。
- 项目签约不再写旧客户状态 `contracted`。
- `schedule_construction` 必须传 `start_date` 和 `construction_manager_employee_id`，没有开工日期或工程负责人不能进入 `pending_start`。
- `start_date` 必须为 `YYYY-MM-DD`。
- 工程负责人必须来自 `GET /projects/:id/member-candidates?role_code=construction_manager` 返回的候选范围；小程序端不要写死部门或岗位编码。
- 排期开工成功后，后端会把该员工写入项目成员 `role_code=construction_manager`，并作为该角色主负责人。
- `schedule_construction` 仅允许项目处于 `design_finalized` 时执行。
- `pause_project` 必须传 `reason`。
- `mark_invalid` 必须传 `reason`。
- 非法状态动作会返回 400；状态已被其他端推进时返回 409 和 `PROJECT_STATUS_CONFLICT`。
- 无权限会返回 403。

## 工程负责人候选接口

```http
GET /projects/:id/member-candidates?page=1&pageSize=10&role_code=construction_manager&keyword=张
Authorization: Bearer <employee_token>
```

返回结构：

```json
{
  "data": {
    "list": [
      {
        "id": "employee-id",
        "name": "张三",
        "phone": "18800000000",
        "department_name": "工程部",
        "post_name": "项目经理",
        "department": {
          "id": "department-id",
          "name": "工程部"
        },
        "post": {
          "id": "post-id",
          "name": "项目经理",
          "code": "PROJECT_MANAGER"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

错误码：

| HTTP | code | message | 处理建议 |
| --- | --- | --- | --- |
| 400 | `CONSTRUCTION_MANAGER_REQUIRED` | `请选择工程负责人` | 保持弹窗，提示选择负责人 |
| 400 | `INVALID_CONSTRUCTION_MANAGER` | `所选员工不能作为工程负责人` | 重新拉候选人并要求重选 |
| 409 | `PROJECT_STATUS_CONFLICT` | `项目状态已变化，请刷新后重试` | 关闭弹窗并刷新项目详情、动作列表 |

## 阶段写操作限制

小程序端需要根据接口返回处理错误提示：

- `invalid / on_hold / acceptance` 项目不能新增施工日志。
- `invalid / acceptance` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目能发起或查看验收相关流程。
- 历史施工日志、历史摄像头、历史验收单仍可读取。

## 对接要求

- 员工端不要再直接通过 `PATCH /projects/:id` 提交 `status`。
- 状态按钮按 `GET /projects/:id/status-actions` 返回值展示。
- `designing` 项目的下一步按钮是 `confirm_proposal`，视觉上应紧挨当前“开始设计”状态右侧。
- `design_finalized` 项目点击“排期开工”时，应弹出开工日期 + 工程负责人选择组件；员工未选择任一必填项时，不调用状态变更接口。
- 暂无可执行动作时，不展示状态操作按钮。
- 服务端返回 400 时，直接展示后端中文错误信息。
- 状态变更成功后，重新拉取项目详情、项目列表、动作列表、时间线和首页统计。

## 下线说明

项目 `lead / measure / negotiating / completed / after_sale` 状态，以及 `start_measure / start_negotiation / start_design / complete_project / start_after_sale` 动作已下线。小程序端不要再展示量房、谈单、完工、售后等旧工程流入口。
