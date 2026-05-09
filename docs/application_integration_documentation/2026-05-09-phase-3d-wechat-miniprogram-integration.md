# 阶段 3D 微信小程序对接说明：工地摄像头租户隔离

日期：2026-05-09

## 结论

小程序端无需新增 `tenant_id` 参数。项目摄像头列表和播放地址接口会根据员工登录态、客户登录态、项目归属和摄像头归属自动隔离。

## 受影响入口

- 员工端项目详情里的工地监控入口
- 员工端摄像头播放页
- 客户端项目详情里的工地监控入口
- 客户端摄像头播放页

## 受影响接口

- `GET /projects/:project_id/cameras`
- `POST /projects/:project_id/cameras/:camera_id/play-params`

如果小程序员工端也承担摄像头绑定能力，还会受以下接口影响：

- `GET /projects/:project_id/cameras/ezviz-devices`
- `GET /projects/:project_id/cameras/tencent-devices`
- `POST /projects/:project_id/cameras`
- `PATCH /projects/:project_id/cameras/:camera_id`
- `DELETE /projects/:project_id/cameras/:camera_id`

## 行为变化

### 员工端

- 员工只能读取当前租户且自己有项目权限的摄像头。
- 播放地址获取时，摄像头必须属于当前租户项目。
- 如果项目或摄像头不属于当前租户，后端返回无权限或不存在。

### 客户端

- 客户只能读取自己所属租户项目的摄像头。
- 客户、项目、租户必须一致。
- 客户端仍只展示 `can_view=true` 的摄像头。

## 小程序端建议

- 不要传 `tenant_id`。
- 员工或客户切换账号后，清空项目摄像头列表和播放参数缓存。
- 播放地址不要长期缓存，继续按点击播放时实时请求。
- 遇到 `CAMERA_ACCESS_DENIED` 或 `CAMERA_NOT_FOUND`，按“暂无权限查看该摄像头”或“摄像头已解绑”展示。
- 遇到腾讯云播放地址异常，继续复用现有离线/加载失败提示。

## 联调检查

- A 租户客户不能打开 B 租户项目摄像头。
- A 租户员工不能播放 B 租户摄像头。
- 客户端摄像头列表不返回 `can_view=false` 的摄像头。
- 播放成功后，后端访问日志 `tenant_id` 等于项目租户。
