# Admin 客户项目状态联动对接文档

日期：2026-05-21

## 背景

客户状态只表达销售推进，项目状态只表达交付推进。两者强联动点是客户进入 `designing` 和项目签约成功。

联动方向：

1. 客户 `arrived` 点击“开始设计”。
2. Admin 弹出项目创建/确认 card，并在 card 内确认或补齐主房产信息。
3. 如果客户没有主房产，Admin 先调用 `POST /customers/:id/properties` 创建且设为主房产。
4. Admin 再调用 `POST /projects` 创建/确认一个 `designing` 项目。
5. 项目创建/确认成功后，Admin 再调用客户 `start_design`。
6. 后续方案确认、签约、施工、验收全部走项目状态机。
7. 项目 `sign_contract` 成功后，后端自动把关联客户销售状态从 `designing` 推进到 `signed`。

项目签约不再反向把客户改成 `contracted`，因为客户侧已下线 `contracted` 状态。

## 第一步：创建/确认设计项目

如果客户没有主房产，先在同一个开始设计 card 内补齐主房产：

```http
POST /customers/:id/properties
Authorization: Bearer <employee_token>
Content-Type: application/json
```

```json
{
  "community": "某小区",
  "building_info": "1栋1单元101",
  "area": 120,
  "layout": "三室两厅",
  "latitude": null,
  "longitude": null,
  "set_as_primary": true
}
```

主房产存在后，再创建/确认设计项目：

```http
POST /projects
Authorization: Bearer <employee_token>
Content-Type: application/json
```

请求体：

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

成功后：

- 系统已有同客户同房产有效项目时，返回已有项目。
- 没有有效项目时，创建 `designing` 项目。
- Admin 才能继续调用客户状态动作。

## 第二步：客户开始设计接口

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

成功后：

- 客户状态进入 `designing`。
- 关联项目已存在，项目状态为 `designing`。
- Admin 应刷新客户详情、客户列表、项目列表和项目详情入口。

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

签约前置要求：

- 项目当前状态必须是 `proposal_confirmed`。
- 必须填写 `signed_amount > 0`。
- 项目有关联客户时，关联客户销售状态应处于 `designing` 或 `signed`。
- 关联客户为 `designing` 时，签约成功后后端同步写入客户状态 `signed`，并追加客户状态流转日志 `mark_signed`。
- 签约成功后不写旧客户状态 `contracted`。

## Admin 交互建议

客户详情页：

- `arrived` 客户展示“开始设计”按钮。
- 点击后打开项目创建/确认 card，不直接提交客户状态动作。
- 如果没有主房产，应在该 card 内展示主房产表单并先保存为主房产。
- 项目创建/确认成功后自动提交客户 `start_design`。
- 任一步失败都保持客户原状态，并刷新动作列表。
- 执行成功后展示或刷新关联项目入口。

项目详情页：

- `designing` 项目展示“方案已确认”动作，不展示“项目签约”动作。
- `proposal_confirmed` 项目展示“项目签约”动作。
- 签约弹窗必须填写签约金额。
- 签约成功后刷新项目详情、项目列表和客户详情中的关联项目状态。

## 错误处理

| 后端 message | Admin 处理 |
| --- | --- |
| 客户开始设计前必须已有主房产信息 | 保持开始设计 card 打开，在 card 内补齐主房产 |
| 项目创建失败或项目必填信息不完整 | 保持项目创建 card 打开，提示修正后重试 |
| 项目签约时必须提供有效的 signed_amount | 保持签约弹窗打开，提示填写大于 0 的签约金额 |
| 项目签约前，关联客户销售状态必须为设计中或已签约 | 提示先从客户详情执行开始设计，或刷新客户详情确认签约状态 |
| 当前状态不允许执行该动作 | 刷新详情，重新计算动作按钮 |

## 验收清单

- `arrived` 客户点击“开始设计”时先弹出项目创建/确认 card。
- 缺少主房产的客户仍进入开始设计 card，并在 card 内先补齐主房产。
- 项目创建/确认失败时，不调用客户 `start_design`，客户仍保持 `arrived`。
- 项目创建/确认成功后，`start_design` 成功，客户进入 `designing`，并出现 `designing` 项目。
- `designing` 项目不能直接签约，必须先 `confirm_proposal`。
- `proposal_confirmed` 项目签约成功后进入 `signed`。
- 签约成功后客户进入 `signed`，不出现 `contracted`。
