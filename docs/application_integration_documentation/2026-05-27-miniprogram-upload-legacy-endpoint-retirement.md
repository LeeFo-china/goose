# 小程序图片上传旧接口退场对接说明

日期：2026-05-27

## 背景

Admin 端已移除 `POST /uploads/images` 的 fallback 和直接调用。后端仍暂时保留该接口，只用于小程序旧版本或异常 fallback 观察。

后续将删除：

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

以下场景不得再回退 `POST /uploads/images`：

- `project_log`
- `project_log_comment`
- `customer_follow_up_comment`
- `project_acceptance`

直传失败时，应在当前页面展示上传失败提示，允许用户重试，不要自动进入服务器中转上传。

## 退场验收口径

后端会对 `POST /uploads/images` 输出兼容层使用日志：

```text
[compat] legacy uploads/images endpoint used
```

删除旧接口前必须满足：

- 小程序端确认已移除 `/uploads/images` fallback。
- 后端访问日志连续一个观察窗口没有新的 `[compat] legacy uploads/images endpoint used`。
- Admin 端保持 `rg "/uploads/images" apps/admin` 无运行时代码命中。

## 删除后的预期

旧接口删除后，仍调用 `POST /uploads/images` 的客户端会收到 404 或路由不存在响应。小程序端必须在删除前完成切换。

