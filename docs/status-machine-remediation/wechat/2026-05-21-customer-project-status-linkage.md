# 小程序客户项目状态联动对接文档

日期：2026-05-21

## 背景

客户状态只表达销售推进，项目状态只表达交付推进。小程序端需要把“开始设计”作为销售到项目的衔接入口。

联动方向：

1. 客户 `arrived` 点击“开始设计”。
2. 小程序端展示项目创建/确认表单，并在表单内确认或补齐主房产信息。
3. 如果客户没有主房产，小程序端先调用 `POST /customers/:id/properties` 创建且设为主房产。
4. 小程序端再调用 `POST /projects` 创建/确认一个 `designing` 项目。
5. 项目创建/确认成功后，小程序端再调用客户 `start_design`。
6. 后续方案确认、签约、施工、验收全部走项目状态机。

## 第一步：创建/确认设计项目

如果客户没有主房产，先在同一个项目创建/确认表单内补齐主房产：

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
- 小程序端才能继续调用客户状态动作。

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
    "source": "miniprogram",
    "project_created_before_start_design": true
  }
}
```

成功后：

- 客户状态进入 `designing`。
- 关联项目已存在，项目状态为 `designing`。
- 小程序端应刷新客户详情、客户列表、项目列表和关联项目入口。

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
  "reason": "客户已签施工合同",
  "metadata": {
    "source": "miniprogram"
  }
}
```

签约前置要求：

- 项目当前状态必须是 `proposal_confirmed`。
- 必须填写 `signed_amount > 0`。
- 项目有关联客户时，关联客户应处于 `designing`。
- 签约成功后只更新项目为 `signed`，不写客户 `contracted`。

## 小程序处理方式

- 客户详情页仅在 `arrived` 状态展示“开始设计”。
- 点击“开始设计”后先进入项目创建/确认表单，不直接提交客户状态动作。
- 如果缺少主房产，应在项目创建/确认表单内展示主房产表单并先保存为主房产。
- 项目创建/确认失败时，不调用客户 `start_design`，客户仍保持 `arrived`。
- 项目创建/确认成功后，再自动提交客户 `start_design`。
- 项目详情页在 `designing` 状态展示“方案已确认”，不展示“项目签约”。
- 项目详情页在 `proposal_confirmed` 状态展示“项目签约”，并要求填写签约金额。
- 项目详情页在 `design_finalized` 状态展示“排期开工”，并要求先确认开工日期。
- 服务端返回 400 / 403 时直接展示后端中文错误。

## 下线说明

客户 `ordered / contracted` 已下线。小程序端不要再从客户详情发起“下定”或“客户签约”；正式签约属于项目交付阶段，必须走项目 `sign_contract`。
