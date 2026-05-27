# 小程序图片上传旧接口退场对接说明

日期：2026-05-27

## 背景

Admin 端已移除 `POST /uploads/images` 的 fallback 和直接调用。小程序端已确认移除旧接口 fallback，后端已经删除该接口。

已删除：

```http
POST /uploads/images
```

## 小程序端要求

小程序端上传图片统一使用 COS 直传：

```http
POST /uploads/cos/direct-init
PUT  direct-init 返回的 upload_url
POST /uploads/cos/direct-complete
```

以下场景不得再回退 `POST /uploads/images`，并已在后端 direct upload 白名单内：

- `project_log`
- `project_log_comment`
- `customer_follow_up_comment`
- `project_acceptance`
- `customer_avatar`
- `customer_douyin_screenshot`
- `customer_service`
- `expense_request`
- `referral_payment`
- `employee_avatar`

直传失败时，应在当前页面展示上传失败提示，允许用户重试，不要自动进入服务器中转上传。

## 退场验收口径

删除旧接口前已满足：

- 小程序端确认已移除 `/uploads/images` fallback。
- Admin 端保持 `rg "/uploads/images" apps/admin` 无运行时代码命中。
- 后端运行时代码保持 `rg "/uploads/images" apps/api/src apps/admin` 无命中。

## 删除后的预期

旧接口删除后，仍调用 `POST /uploads/images` 的客户端会收到 404 或路由不存在响应。
