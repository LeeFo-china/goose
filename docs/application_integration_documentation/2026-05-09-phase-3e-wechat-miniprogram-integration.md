# 阶段 3E 微信小程序对接说明：短视频识别与脚本租户隔离

日期：2026-05-09

## 结论

小程序端无需新增 `tenant_id` 参数。后端会根据当前登录用户绑定的客户档案解析租户，并把短视频识别任务和脚本生成结果归属到该租户。

## 受影响接口

- `POST /social-video/transcriptions`
- `GET /social-video/transcriptions/:id`
- `POST /social-video/transcriptions/:id/script`
- `GET /social-video/transcriptions/:id/scripts`

## 行为变化

- 客户提交抖音链接时，后端从当前登录用户的 active `user_business_memberships` 客户身份解析客户租户。
- `AUTH_IDENTITY_SOURCE=membership` 后，旧的 `customers.user_id` 只作为兼容观察字段，不再作为小程序业务身份判断口径。
- 如果当前账号只绑定一个租户客户，任务直接创建成功。
- 如果当前账号绑定多个租户客户，后端返回：

```json
{
  "code": "SOCIAL_VIDEO_TENANT_AMBIGUOUS",
  "message": "当前账号绑定了多个客户档案，请先选择所属装修公司"
}
```

- 查询任务详情时，任务必须属于当前客户租户。
- 生成脚本时，脚本从转写任务继承租户。
- 同链接缓存只在同一租户内复用，不会跨装修公司复用。

## 小程序端建议

- 不要传 `tenant_id`。
- 用户切换登录身份后，清空短视频识别任务轮询状态和脚本历史缓存。
- 遇到 `SOCIAL_VIDEO_TENANT_AMBIGUOUS` 时，MVP 可提示“当前账号关联多家公司，请先切换或选择装修公司后再试”。
- 轮询 `GET /social-video/transcriptions/:id` 的逻辑不变。
- 任务失败时继续展示后端 `error_message`。

## 联调检查

- A 租户客户不能查询 B 租户客户创建的转写任务。
- A 租户客户不能基于 B 租户转写任务生成脚本。
- 同一个客户在同一租户内重复提交同一链接时，可以复用同租户缓存。
- 同一个链接在不同租户提交时，生成独立任务。
- 腾讯云 ASR 或 Apify 无法返回时长时，任务仍可完成，`audio_duration_seconds` 可为空。
