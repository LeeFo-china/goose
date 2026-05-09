# Phase 4E 微信小程序对接文档：平台访客提交装修需求

日期：2026-05-09

## 背景

客户手机号没有命中任何装修公司时，登录接口会返回平台访客态：

```json
{
  "mode": "platform_visitor",
  "verified_phone": "18638374738"
}
```

小程序应进入平台访客页，引导用户提交装修需求。提交后，后端创建平台公海线索，由平台超管后续分配给装修公司。

## 接口

```http
POST /platform/leads
Authorization: Bearer <platform_visitor_token>
Content-Type: application/json
```

Body：

```json
{
  "phone": "18638374738",
  "name": "李先生",
  "city": "郑州",
  "community": "某小区",
  "area": 120,
  "budget": "20-30万",
  "description": "准备做全屋装修，希望尽快安排顾问联系",
  "source": "platform_visitor"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `phone` | 是 | 必须等于登录态里的 `verified_phone` |
| `name` | 否 | 用户称呼 |
| `city` | 否 | 城市 |
| `community` | 否 | 小区 |
| `area` | 否 | 面积 |
| `budget` | 否 | 预算 |
| `description` | 否 | 装修需求 |
| `source` | 否 | 默认 `platform_visitor` |

成功返回：

```json
{
  "id": "platform-lead-id",
  "phone": "18638374738",
  "name": "李先生",
  "status": "new",
  "message": "需求已提交，平台会尽快为你分配装修公司",
  "created_at": "2026-05-09T12:00:00.000Z"
}
```

## 交互建议

平台访客页 MVP：

1. 展示装修需求表单。
2. 手机号默认使用登录态 `verified_phone`，不建议让用户改。
3. 用户提交后按钮进入 loading。
4. 成功后切换为提交成功态：
   - 标题：需求已提交
   - 副文案：平台会尽快为你匹配合适的装修公司，请保持电话畅通
   - 显示手机号后四位：已提交手机号：`****4738`
5. 禁止本次页面重复提交。

## 错误处理

| 场景 | 前端处理 |
| --- | --- |
| `401` | 登录态失效，重新走手机号登录 |
| `提交手机号必须与当前登录手机号一致` | 使用登录态手机号重填表单 |
| 参数校验失败 | 按后端 message toast |

## 注意事项

- 平台访客态不能访问项目、施工日志、验收、摄像头。
- 本接口只创建平台线索，不会立即创建租户客户。
- 用户后续被平台分配到装修公司后，再通过客户登录流程进入对应公司客户态。
