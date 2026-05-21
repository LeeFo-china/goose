# Admin 客户状态机对接文档

日期：2026-05-21

## 背景

客户状态变更已进入状态机整改阶段。Admin 端应从“直接编辑客户 `status` 字段”调整为“展示当前状态可执行动作，并调用动作接口”。

当前 Admin 影响文件：

- `apps/admin/components/customers/customer-mutations.tsx`

当前 Admin 现状：

- `CustomerDialog` 的新增 / 编辑表单包含状态下拉。
- `submit()` 会把 `status` 放进 `POST /customers` 或 `PATCH /customers/:id` payload。
- `CustomerDetailDialog` 尚未展示状态动作区。
- `CustomerRowActions.deleteCustomer()` 调用 `DELETE /customers/:id` 作废客户，后端已兼容为状态机 `mark_invalid`。

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

请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `action` | string | 是 | 客户状态动作，见下方动作表 |
| `reason` | string | 条件必填 | `mark_dormant` / `mark_invalid` 必填，最长 500 字 |
| `metadata` | object | 否 | 建议传 `{ "source": "admin" }` |

成功返回：

- 返回更新后的客户详情数据。
- Admin 应以返回值更新详情弹窗，或直接刷新当前详情和列表。

## Admin 表单调整

新增客户：

- 可以保留初始状态字段，默认 `potential`。
- 如果没有强业务需求，建议新增时不让用户选择后续状态，创建后再通过状态动作推进。

客户详情页：

- 不建议继续把 `status` 作为普通下拉字段直接保存。
- 状态区域展示当前状态、状态标签和可执行动作按钮。
- 需要原因的动作弹出确认框并要求填写原因。
- `contracted` 和 `invalid` 当前暂无后续动作。

客户编辑页：

- 基础信息编辑仍使用 `PATCH /customers/:id`。
- 编辑模式不要在普通保存里混入 `status`。
- 状态变化走 `POST /customers/:id/status-transition`。
- `CustomerFormSchema` 可以继续保留新增场景的 `status` 校验，但编辑提交 payload 应删除 `status`。

建议拆分：

- `CustomerDialog mode="create"`：可以提交 `status`，默认 `potential`。
- `CustomerDialog mode="edit"`：表单不展示状态下拉，payload 不包含 `status`。
- `CustomerDetailDialog`：新增状态操作区，负责调用状态动作接口。

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

按钮渲染：

- 优先调用 `GET /customers/:id/status-actions` 渲染动作按钮。
- 响应里的 `actions[].requires_reason` 决定是否弹出原因输入。
- 前端只负责展示动作，不复制复杂规则。

动作按钮建议排序：

1. 主推进动作：`start_following`、`mark_arrived`、`place_order`、`sign_contract`、`reactivate`。
2. 普通非主线动作：`mark_dormant`。
3. 危险动作：`mark_invalid`。

## 交互建议

### 普通推进动作

适用：

- `start_following`
- `mark_arrived`
- `place_order`
- `reactivate`

交互：

- 按钮点击后可以直接弹二次确认，也可以直接提交。
- payload 固定带 `metadata.source=admin`。

示例：

```json
{
  "action": "mark_arrived",
  "metadata": {
    "source": "admin"
  }
}
```

### 客户签约动作

适用：

- `sign_contract`

交互：

- 客户详情页可以保留“客户签约”动作，但推荐 Admin 正式签约入口放在项目详情页。
- 如果从客户详情页触发，当前后端暂不强制选择项目。
- 文案需要提示：项目签约会自动联动客户状态，优先从项目签约。

### 需要原因的动作

适用：

- `mark_dormant`
- `mark_invalid`

交互：

- 弹窗必填原因。
- 原因为空时前端阻止提交。
- 作废使用危险样式和二次确认。

示例：

```json
{
  "action": "mark_invalid",
  "reason": "号码无效，无法联系",
  "metadata": {
    "source": "admin"
  }
}
```

## 错误处理

Admin 端需要处理以下 400 错误：

- 当前客户状态不允许执行该动作。
- 该状态动作必须填写原因。
- 当前客户状态不允许直接变更为目标状态。

建议：

- 在 UI 上提前禁用明显非法的状态按钮。
- 后端 400 仍作为最终准入规则，不要只依赖前端判断。
- 状态变更成功后，刷新客户详情、客户列表和首页统计。

常见处理：

| 场景 | 前端处理 |
| --- | --- |
| 当前状态不允许执行动作 | 提示后端 message，刷新客户详情 |
| 缺少原因 | 保持弹窗打开并提示填写原因 |
| 客户已作废 | 隐藏动作按钮，仅展示状态 |
| 网络失败 | 保持按钮可重试，不本地乐观改状态 |

## 数据刷新

状态动作成功后建议刷新：

- 当前客户详情弹窗。
- 客户列表。
- Dashboard / 首页统计，如果当前页面依赖客户状态聚合。

如果使用 `router.refresh()`：

- 列表页可以直接刷新服务端数据。
- 详情弹窗若保持打开，建议用接口返回的客户详情更新本地 `detail` 状态，避免弹窗内容滞后。

## 后端兼容边界

- 短期 `PATCH /customers/:id` 传 `status` 仍会被后端推断为状态动作并校验。
- 新 Admin 代码不要依赖这个兼容路径。
- `DELETE /customers/:id` 当前保留作废语义，内部走 `mark_invalid` 并写日志；后续若统一入口，可改为显式调用 `POST /customers/:id/status-transition`。

## 后续待接

- 客户详情展示状态流转时间线。
- 状态动作成功后自动刷新动作列表和状态时间线。

## Admin 验收清单

- 编辑已有客户保存时，请求 payload 不包含 `status`。
- 客户详情页能看到当前状态标签和动作按钮。
- `potential` 客户能执行 `start_following`。
- `following` 客户能执行 `mark_arrived`、`place_order`、`sign_contract`、`mark_dormant`、`mark_invalid`。
- `mark_dormant` 未填写原因不能提交。
- `mark_invalid` 未填写原因不能提交。
- 状态动作成功后，详情和列表状态一致。
