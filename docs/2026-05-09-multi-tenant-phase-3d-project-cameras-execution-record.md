# 多租户阶段 3D 执行记录：工地摄像头

日期：2026-05-09

## 范围

本阶段处理工地摄像头模块的租户隔离，覆盖项目摄像头绑定、绑定项目选择器、摄像头分组列表、播放地址获取、萤石/腾讯云通道绑定状态和摄像头访问日志。

## 已完成

### 数据库

- 新增 migration：`20260509170000_tenant_scope_project_cameras.sql`。
- 给 `project_cameras` 增加并回填 `tenant_id`。
- 给 `camera_access_logs` 增加并回填 `tenant_id`，便于后续审计和用量统计。
- `project_cameras.tenant_id` 从所属项目 `projects.tenant_id` 继承，缺失时回退默认租户。
- `camera_access_logs.tenant_id` 优先从摄像头继承，其次从项目继承，缺失时回退默认租户。
- 增加摄像头和访问日志的租户复合索引：
  - `idx_project_cameras_tenant_project`
  - `idx_project_cameras_tenant_vendor`
  - `idx_camera_access_logs_tenant_project_created_at`
  - `idx_camera_access_logs_tenant_camera_created_at`

### 后端

- 员工访问摄像头接口时，先解析当前员工租户，再校验项目归属当前租户。
- 客户访问项目摄像头时，校验客户、项目和租户一致。
- 项目摄像头列表按 `project_id + tenant_id` 查询。
- 摄像头播放地址获取按 `project_id + camera_id + tenant_id` 查询。
- 绑定摄像头时，后端按当前租户读取项目，并把项目租户写入 `project_cameras.tenant_id`。
- 更新和解绑摄像头时，按当前租户过滤。
- 绑定项目选择器按当前租户过滤；即使员工拥有 `all` 项目权限，也只返回当前租户项目。
- 工地监控项目分组按当前租户过滤；`/project-cameras/projects` 不再跨租户返回绑定了摄像头的项目。
- 萤石和腾讯云通道绑定状态仍会识别全局已绑定设备，避免同一个物理通道被重复绑定。
- 当设备已绑定到其他租户时，返回 `is_bound=true`、`can_bind=false`，但不会暴露其他租户的项目名、摄像头名和摄像头 ID。
- 摄像头访问日志写入当前租户。

## 平台级配置说明

- 腾讯云 IoT Video SIP 配置仍保持平台级配置。
- SIP 服务器 ID、IP、端口、腾讯云密钥等不写入租户业务表。
- 租户管理员通过平台共享的腾讯云配置创建设备和获取播放地址。
- 本阶段不新增租户级 SIP 配置。

## 暂未处理

- `/platform/cameras` 平台超管全量摄像头视图未实现，后续平台后台阶段处理。
- 腾讯云“已创建但尚未绑定到项目”的远端设备尚无本地租户归属表；MVP 仍以绑定到 `project_cameras` 后的租户为准。
- 摄像头访问日志统计报表未在本阶段实现。

## 验证

- `bun run api:build` 通过。
- `bun run api:typecheck` 通过。
