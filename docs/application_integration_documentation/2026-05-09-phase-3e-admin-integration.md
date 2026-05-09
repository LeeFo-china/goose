# 阶段 3E Admin 对接说明：自媒体短视频识别与脚本租户隔离

日期：2026-05-09

## 结论

Admin 端无需新增 `tenant_id` 请求参数。短视频识别任务和脚本生成结果会根据当前登录员工的租户上下文自动过滤。

## 受影响接口

- `POST /social-video/transcriptions`
- `GET /social-video/transcriptions/:id`
- `POST /social-video/transcriptions/:id/script`
- `GET /social-video/transcriptions/:id/scripts`
- `GET /admin/social-video/scripts`
- `POST /admin/social-video/transcriptions/test`

## 行为变化

- 创建转写任务时，后端会写入当前租户。
- 同链接识别缓存只在当前租户内复用。
- 单用户每日识别次数按当前租户统计。
- 脚本生成从转写任务继承租户。
- 脚本缓存只在当前租户内复用。
- Admin 脚本列表只返回当前租户脚本。
- worker 领取任务时保留任务 `tenant_id`，不会改变接口响应结构。

## Admin 端建议

- 不要传 `tenant_id`。
- 员工切换账号或切换租户后，清空短视频识别任务详情、脚本列表和 admin 脚本列表缓存。
- 如果接口返回 `SOCIAL_VIDEO_TENANT_AMBIGUOUS`，提示用户先选择所属装修公司或联系管理员处理账号绑定关系。
- `/admin/social-video/transcriptions/test` 是平台配置测试能力，只测试 Apify 链路，不创建租户业务任务。

## 联调检查

- A 租户员工不能查询 B 租户创建的转写任务。
- A 租户员工不能基于 B 租户转写任务生成脚本。
- A 租户 admin 脚本列表不出现 B 租户脚本。
- 同一个抖音链接在 A/B 两个租户分别提交时，不跨租户复用缓存任务。
- 生成脚本后，`social_video_scripts.tenant_id` 等于转写任务租户。
