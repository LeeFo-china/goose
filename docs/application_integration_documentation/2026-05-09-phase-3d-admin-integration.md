# 阶段 3D Admin 对接说明：工地摄像头租户隔离

日期：2026-05-09

## 结论

Admin 端无需新增 `tenant_id` 请求参数。工地监控和摄像头绑定接口会根据当前登录员工的租户上下文自动过滤。

## 受影响接口

- `GET /projects/camera-bind-options`
- `GET /project-cameras/projects`
- `GET /projects/:project_id/cameras`
- `GET /projects/:project_id/cameras/ezviz-devices`
- `GET /projects/:project_id/cameras/tencent-devices`
- `POST /projects/:project_id/cameras/tencent-devices`
- `GET /projects/:project_id/cameras/tencent-devices/:device_id/password`
- `POST /projects/:project_id/cameras/tencent-devices/:device_id/password`
- `POST /projects/:project_id/cameras`
- `PATCH /projects/:project_id/cameras/:camera_id`
- `DELETE /projects/:project_id/cameras/:camera_id`
- `POST /projects/:project_id/cameras/:camera_id/play-params`

## 行为变化

- 绑定项目选择器只返回当前租户可操作项目。
- 工地监控项目分组只返回当前租户已绑定摄像头的项目。
- 绑定摄像头时，后端会把项目租户写入 `project_cameras.tenant_id`。
- 更新、解绑、播放摄像头时，摄像头必须属于当前租户项目。
- 腾讯云 SIP 配置仍是平台级，Admin 不需要传租户参数。
- 如果通道已被其他租户绑定，接口会返回不可绑定，但不会返回其他租户项目名、摄像头名和摄像头 ID。

## Admin 端建议

- 不要传 `tenant_id`。
- 员工切换账号或切换租户后，清空工地监控列表、绑定项目选项、腾讯云通道列表缓存。
- 如果通道 `is_bound=true` 且 `bound_project_id=null`，表示该通道已被其他租户占用，前端只展示“已被其他项目绑定”即可，不展示项目详情。
- `/platform/cameras` 尚未实现，平台超管全量视图不要复用租户 Admin 页面接口。

## 联调检查

- A 租户员工不能在 `/project-cameras/projects` 看到 B 租户摄像头项目。
- A 租户员工不能给 B 租户项目绑定摄像头。
- A 租户员工不能更新、删除、播放 B 租户摄像头。
- A 租户绑定摄像头后，`project_cameras.tenant_id` 等于项目租户。
- 摄像头播放日志 `camera_access_logs.tenant_id` 等于当前项目租户。
