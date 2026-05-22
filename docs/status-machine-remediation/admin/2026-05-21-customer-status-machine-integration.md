# Admin 客户状态机对接文档

日期：2026-05-21

## 背景

客户状态只表达销售阶段，不承载施工交付进度。Admin 客户详情页应展示当前状态和可执行动作，状态变更统一调用动作接口。

当前有效主路径：

`potential` 线索 -> `following` 跟进中 -> `arrived` 已到店 -> `designing` 设计中 -> `signed` 已签约

`designing` 是销售到项目的衔接节点。客户点击 `start_design` 时，Admin 必须先完成项目创建/确认；项目存在后才调用客户状态动作。后端要求客户已有主房产信息，并会复用同客户同房产的有效项目作为兜底。

`signed` 是销售终态，由项目 `sign_contract` 成功后后端自动写入；Admin 客户详情不需要额外展示手动“客户签约”按钮。

## 开始设计两步接入

`start_design` 不能直接提交状态动作。Admin 应按下面顺序执行：

1. 用户在 `arrived` 客户详情点击“开始设计”。
2. 弹出“开始设计前创建项目” card，要求确认客户、主房产和项目基础信息。
3. 如果客户没有主房产，在同一个 card 内填写主房产，并先调用 `POST /customers/:id/properties` 创建且设为主房产。
4. 再调用 `POST /projects` 创建/确认项目，项目状态传 `designing`。
5. 项目创建/确认成功后，再调用 `POST /customers/:id/status-transition` + `start_design`。
6. 任一步失败都不更新前端本地状态，刷新客户详情和动作列表。

项目创建请求体示例：

```json
{
  "name": "张三 - 某小区 1-101 设计项目",
  "customer_id": "customer_uuid",
  "property_id": "property_uuid",
  "status": "designing",
  "designer_id": null,
  "supervisor_id": null,
  "budget": null,
  "start_date": null,
  "address": "某小区 1-101",
  "visibility_status": "inherit",
  "style_tags": []
}
```

## 状态变更接口

```http
POST /customers/:id/status-transition
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

```json
{
  "action": "start_design",
  "metadata": {
    "source": "admin",
    "project_created_before_start_design": true
  }
}
```

请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `action` | string | 是 | 客户状态动作，见下方动作表 |
| `reason` | string | 条件必填 | `mark_dormant` / `mark_invalid` 必填，最长 500 字 |
| `metadata` | object | 否 | 建议传 `{ "source": "admin" }` |

成功返回更新后的客户详情数据。

## Admin 表单调整

- 新增客户默认 `potential`，不建议让用户直接选择后续状态。
- 编辑客户基础信息时，`PATCH /customers/:id` payload 不包含 `status`。
- 客户详情页新增状态区域，展示当前状态、动作按钮和状态时间线。
- 作废客户建议显式调用 `POST /customers/:id/status-transition` + `mark_invalid`。

## 当前动作

| Action | From | To | Admin UI 建议 |
| --- | --- | --- | --- |
| `start_following` | `potential` | `following` | 主按钮 |
| `mark_arrived` | `following` | `arrived` | 主按钮 |
| `start_design` | `arrived` | `designing` | 主按钮，先打开项目创建/确认 card，成功后再提交状态动作 |
| `mark_dormant` | `potential/following/arrived/designing` | `dormant` | 普通按钮，要求原因 |
| `reactivate` | `dormant` | `following` | 主按钮 |
| `mark_invalid` | `potential/following/arrived/designing/dormant` | `invalid` | 危险按钮，要求原因 |

内部动作：

| Action | From | To | 说明 |
| --- | --- | --- | --- |
| `mark_signed` | `designing` | `signed` | 项目 `sign_contract` 成功后由后端自动写入客户状态和流转日志，不通过客户详情按钮触发 |

按钮渲染：

- 优先调用 `GET /customers/:id/status-actions` 渲染动作按钮。
- 响应里的 `actions[].requires_reason` 决定是否弹出原因输入。
- 前端只负责展示动作，不复制复杂规则。

动作按钮建议排序：

1. 主推进动作：`start_following`、`mark_arrived`、`start_design`、`reactivate`。
2. 普通非主线动作：`mark_dormant`。
3. 危险动作：`mark_invalid`。

## 交互建议

普通推进动作可以直接提交，也可以弹二次确认。`start_design` 是例外，必须先完成项目创建/确认。其他动作 payload 固定带 `metadata.source=admin`：

```json
{
  "action": "mark_arrived",
  "metadata": {
    "source": "admin"
  }
}
```

需要原因的动作必须弹窗填写原因：

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
- 客户开始设计前必须已有主房产信息：保持开始设计 card 打开，在 card 内补齐主房产后重试。
- 开始设计前项目创建失败或项目必填信息不完整。
- 当前客户状态不允许直接变更为目标状态。

状态变更成功后，刷新客户详情、客户列表、动作列表、状态时间线和首页统计。

## 后端兼容边界

- 短期 `PATCH /customers/:id` 传 `status` 仍可能被后端推断为状态动作并校验。
- 新 Admin 代码不要依赖这个兼容路径。
- 客户 `ordered / contracted` 和动作 `place_order / sign_contract` 已下线，不要再展示入口。

## Admin 验收清单

- 编辑已有客户保存时，请求 payload 不包含 `status`。
- 客户详情页能看到当前状态标签和动作按钮。
- `potential` 客户能执行 `start_following`。
- `following` 客户能执行 `mark_arrived`、`mark_dormant`、`mark_invalid`。
- `arrived` 客户点击 `start_design` 时，先弹出项目创建/确认 card。
- 项目创建/确认失败时，不调用客户 `start_design`，客户仍保持 `arrived`。
- 项目创建/确认成功后，`start_design` 成功，客户进入 `designing`。
- 缺少主房产时仍进入开始设计 card，并在 card 内先补齐主房产。
- `designing` 客户不能再执行下定或客户签约动作。
- `mark_dormant` / `mark_invalid` 未填写原因不能提交。
