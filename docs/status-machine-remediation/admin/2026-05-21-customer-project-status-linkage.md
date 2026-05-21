# Admin 客户项目状态联动对接文档

日期：2026-05-21

## 背景

阶段 4 开始，项目签约会联动客户签约状态。Admin 端应把正式签约操作放在项目详情页，客户详情页只展示客户生命周期状态和必要的状态动作。

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

## 联动规则

- 项目有关联客户时，项目签约成功后客户会同步为 `contracted`。
- 客户状态同步会写入 `customer_status_transition_logs`，metadata 包含 `source=project_sign_contract` 和 `project_id`。
- 客户已是 `contracted` 时，不重复写客户状态日志。
- 项目没有关联客户时，当前阶段不阻断项目签约。
- 项目作废、暂停、完工不会反向自动修改客户状态。

## 前置状态要求

项目签约时，关联客户必须处于以下状态之一：

- `following`
- `arrived`
- `ordered`
- `contracted`

如果客户仍是 `potential / dormant / invalid`，后端返回 400：

```json
{
  "message": "项目签约前，关联客户状态必须为跟进中、已到店或已下定"
}
```

Admin 处理方式：

- 在项目详情签约按钮前检查关联客户状态，状态不满足时禁用或提示。
- 后端 400 仍作为最终准入规则。
- 签约成功后刷新项目详情、客户详情、项目列表和客户列表。

## 客户签约入口

客户详情页的 `sign_contract` 当前不强制选择项目。后续若要强制“客户签约必须选择或创建项目”，需要先补齐 Admin 的项目选择 / 创建交互，再收紧后端校验。
