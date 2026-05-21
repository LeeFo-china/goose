# Admin 项目状态机对接文档

日期：2026-05-21

## 背景

项目状态变更已进入状态机整改阶段。Admin 端应从“直接编辑项目 `status` 字段”调整为“展示当前状态可执行动作，并调用动作接口”。

当前 Admin 影响文件：

- `apps/admin/components/projects/project-mutations.tsx`

当前 Admin 现状：

- `ProjectDialog` 的新增 / 编辑表单包含状态下拉。
- `submit()` 会把 `status` 放进 `POST /projects` 或 `PATCH /projects/:id` payload。
- `signed_amount` 当前在基础编辑表单中维护，尚未作为签约动作弹窗字段。
- `ProjectDetailDialog` 尚未展示状态动作区。
- `ProjectRowActions.deleteProject()` 调用 `DELETE /projects/:id` 作废项目，后端已兼容。

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

请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `action` | string | 是 | 项目状态动作，见下方动作表 |
| `reason` | string | 条件必填 | `pause_project` / `mark_invalid` 必填，最长 500 字 |
| `signed_amount` | number | 条件必填 | `sign_contract` 必填且必须大于 0 |
| `metadata` | object | 否 | 建议传 `{ "source": "admin" }` |

成功返回：

- 返回更新后的项目详情数据。
- Admin 应以返回值更新详情弹窗，或刷新当前详情和列表。

## Admin 表单调整

新增项目：

- 可以保留初始状态字段，默认 `lead`。
- 如果没有强业务需求，建议新增时不让用户选择后续状态，创建后再通过状态动作推进。

项目详情页：

- 不建议继续把 `status` 作为普通下拉字段直接保存。
- 状态区域展示当前状态、状态标签和可执行动作按钮。
- 需要原因的动作弹出确认框并要求填写原因。
- `sign_contract` 动作要求填写 `signed_amount`。
- `sign_contract` 如果项目有关联客户，会同步客户为 `contracted`。
- 关联客户必须处于 `following / arrived / ordered / contracted`，否则后端返回 400。

项目编辑页：

- 基础信息编辑仍使用 `PATCH /projects/:id`。
- 编辑模式不要在普通保存里混入 `status`。
- 状态变化走 `POST /projects/:id/status-transition`。
- `signed_amount` 建议从普通编辑表单移到“项目签约”弹窗；如果短期保留在编辑表单，也不能把状态切到 `signed` 当作签约入口。

建议拆分：

- `ProjectDialog mode="create"`：可以提交 `status`，默认 `lead`。
- `ProjectDialog mode="edit"`：表单不展示状态下拉，payload 不包含 `status`。
- `ProjectDetailDialog`：新增状态操作区，负责调用状态动作接口。
- `sign_contract`：独立弹窗填写签约金额和备注原因。

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

按钮渲染：

- 优先调用 `GET /projects/:id/status-actions` 渲染动作按钮。
- 响应里的 `actions[].requires_reason` 决定是否弹出原因输入。
- `resume_project` 需要后端根据最近一次暂停日志里的 `paused_from_status` 恢复；前端只展示后端返回的动作，避免自己处理暂停上下文。

动作按钮建议排序：

1. 主推进动作：`start_measure`、`start_negotiation`、`sign_contract`、`start_design`、`start_construction`、`start_acceptance`、`complete_project`、`start_after_sale`、`resume_project`。
2. 暂停动作：`pause_project`。
3. 危险动作：`mark_invalid`。

## 交互建议

### 普通推进动作

适用：

- `start_measure`
- `start_negotiation`
- `start_design`
- `start_construction`
- `start_acceptance`
- `start_after_sale`
- `resume_project`

示例：

```json
{
  "action": "start_construction",
  "metadata": {
    "source": "admin"
  }
}
```

### 项目签约动作

适用：

- `sign_contract`

交互：

- 弹窗要求填写 `signed_amount`。
- 前端校验 `signed_amount > 0`。
- 可选填写原因，建议默认文案为“合同已确认”。
- 如果项目有关联客户，弹窗中展示关联客户当前状态。
- 如果关联客户状态是 `potential / dormant / invalid`，前端禁用提交并提示先推进客户状态。

示例：

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

### 暂停项目

适用：

- `pause_project`

交互：

- 弹窗必填原因。
- 后端会记录暂停前状态，恢复时使用最近一次暂停日志。

示例：

```json
{
  "action": "pause_project",
  "reason": "客户暂缓施工",
  "metadata": {
    "source": "admin"
  }
}
```

### 作废项目

适用：

- `mark_invalid`

交互：

- 使用危险样式。
- 弹窗必填原因。
- 如果沿用 `DELETE /projects/:id`，要确认后端返回错误时展示 message。
- 新代码建议统一改为状态动作接口。

## 阶段 2 写操作限制

Admin 端需要处理以下 400 错误：

- `invalid / on_hold / completed` 项目不能新增施工日志。
- `invalid / completed` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目能发起验收。

建议：

- 在 UI 上提前禁用明显非法的新增按钮。
- 后端 400 仍作为最终准入规则，不要只依赖前端判断。
- 更新 / 删除已有摄像头暂时保留，用于运维纠错。

Admin 页面影响：

| 页面 / 操作 | 前端限制 |
| --- | --- |
| 项目施工日志新增 | `invalid / on_hold / completed` 禁用 |
| 项目摄像头新增 | `invalid / completed` 禁用 |
| 工序验收发起 | 仅 `constructing / acceptance` 可用 |
| 公开项目展示 | 以后端过滤结果为准，前端不本地拼状态 |

## 错误处理

Admin 端需要处理以下 400 错误：

- 当前项目状态不允许执行该动作。
- 该状态动作必须填写原因。
- 项目签约时必须提供有效的 `signed_amount`。
- 项目签约前，关联客户状态必须为跟进中、已到店或已下定。
- 当前项目状态不允许直接变更为目标状态。

常见处理：

| 场景 | 前端处理 |
| --- | --- |
| 当前状态不允许执行动作 | 提示后端 message，刷新项目详情 |
| 缺少原因 | 保持弹窗打开并提示填写原因 |
| 缺少签约金额 | 保持签约弹窗打开并提示金额 |
| 关联客户状态不满足 | 提示先推进客户状态，并提供跳转 / 查看客户入口 |
| 项目已作废 | 隐藏动作按钮，仅展示状态 |

## 数据刷新

状态动作成功后建议刷新：

- 当前项目详情弹窗。
- 项目列表。
- 项目施工日志 / 验收面板的新增按钮可用状态。
- 关联客户详情 / 客户列表，尤其是项目签约动作成功后。
- Dashboard / 首页统计，如果当前页面依赖项目状态聚合。

如果使用 `router.refresh()`：

- 列表页可以直接刷新服务端数据。
- 详情弹窗若保持打开，建议用接口返回的项目详情更新本地 `currentProject`，避免弹窗内容滞后。

## 后端兼容边界

- 短期 `PATCH /projects/:id` 传 `status` 仍会被后端推断为状态动作并校验。
- 新 Admin 代码不要依赖这个兼容路径。
- `DELETE /projects/:id` 当前保留作废语义；后续若统一入口，可改为显式调用 `POST /projects/:id/status-transition`。
- 动作列表 / 流转日志接口已暴露，Admin 应优先接口驱动。

## 后续待接

- 项目详情展示状态流转时间线。
- 状态动作成功后自动刷新动作列表和状态时间线。

## Admin 验收清单

- 编辑已有项目保存时，请求 payload 不包含 `status`。
- 项目详情页能看到当前状态标签和动作按钮。
- `lead` 项目能执行 `start_measure`。
- `negotiating` 项目签约时必须填写 `signed_amount > 0`。
- 项目签约成功后，项目状态变为 `signed`。
- 项目有关联客户且客户状态满足要求时，签约成功后客户状态变为 `contracted`。
- `pause_project` 未填写原因不能提交。
- `mark_invalid` 未填写原因不能提交。
- `on_hold` 项目能执行 `resume_project`。
- 状态动作成功后，详情和列表状态一致。
