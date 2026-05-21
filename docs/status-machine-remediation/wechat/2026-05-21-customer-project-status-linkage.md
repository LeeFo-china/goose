# 小程序客户项目状态联动对接文档

日期：2026-05-21

## 背景

阶段 4 开始，项目签约会联动客户签约状态。小程序员工端的签约入口应优先从项目详情触发 `sign_contract`，由后端统一完成项目状态和客户状态同步。

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

## 联动规则

- 项目有关联客户时，项目签约成功后客户会同步为 `contracted`。
- 客户已是 `contracted` 时，不会重复写客户状态日志。
- 项目没有关联客户时，当前阶段不阻断项目签约。
- 项目作废不会自动作废客户。
- 多项目客户只按具体项目状态处理，不因单个项目作废影响客户整体状态。

## 前置状态要求

项目签约时，关联客户必须处于以下状态之一：

- `designing`
- `contracted`

如果客户仍是 `potential / following / arrived / ordered / dormant / invalid`，后端返回 400：

```json
{
  "message": "项目签约前，关联客户状态必须为设计中"
}
```

小程序处理方式：

- 直接展示后端中文错误。
- 引导员工先在客户详情执行合法客户状态动作。
- 客户状态推进完成后，再回到项目详情执行签约。

## 客户签约入口

客户详情页的 `sign_contract` 动作当前仍可保留，但不负责创建项目。新的签约业务建议走项目详情签约入口，避免出现“客户已签约但没有项目”的数据断层。
