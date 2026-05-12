# 租户设备接入归属说明

日期：2026-05-12

## 结论

当前租户设备接入的归属不是靠第三方平台设备账号区分，而是靠本地业务绑定关系区分：

```text
tenant -> project -> project_cameras
```

设备绑定到项目后，`project_cameras.tenant_id` 从所属项目 `projects.tenant_id` 继承。后续列表、播放、更新、解绑、访问日志都按这个 `tenant_id` 过滤和记录。

## 当前归属规则

### 1. 项目是归属入口

员工在 admin 绑定摄像头时，请求路径包含项目 ID：

```http
POST /projects/:project_id/cameras
```

后端会先用当前登录员工的租户上下文查询项目：

```text
projects.id = project_id
projects.tenant_id = 当前员工 tenant_id
```

如果项目不属于当前租户，接口返回项目不存在或无权访问。

### 2. 摄像头绑定后继承项目租户

创建 `project_cameras` 时，后端不是信任前端传入租户，而是读取项目租户后写入：

```text
project_cameras.tenant_id = projects.tenant_id
```

这意味着设备归属由“绑定到哪个租户项目”决定。

### 3. 同一个物理通道全局只能绑定一次

系统会全局检查设备通道是否已经绑定：

- 萤石：`vendor + vendor_device_serial + channel_no`
- 腾讯云行业版：`vendor + vendor_device_serial + vendor_channel_id`

如果同一物理通道已经绑定到任意项目，不能再次绑定到其他项目，避免一个摄像头被多个租户重复占用。

### 4. 跨租户绑定状态只暴露占用，不暴露详情

设备通道列表会返回绑定状态：

```text
is_bound
can_bind
```

如果设备已经绑定到其他租户：

- `is_bound = true`
- `can_bind = false`
- 不返回其他租户的项目名、摄像头名、摄像头 ID

如果设备绑定在当前租户，才会返回当前租户内的绑定项目和摄像头信息。

### 5. 播放和管理继续按租户过滤

以下操作都会带 `tenant_id` 过滤：

- 项目摄像头列表
- 工地监控项目分组
- 摄像头播放地址获取
- 摄像头更新
- 摄像头解绑
- 绑定项目选择器

客户小程序访问项目摄像头时，后端会校验客户、项目和租户一致；员工访问时，后端会校验员工租户和项目权限。

### 6. 访问日志按租户记录

摄像头访问日志 `camera_access_logs.tenant_id` 从当前访问者所在租户写入，用于后续审计和统计。

## 第三方平台设备池边界

当前萤石和腾讯云配置是平台级配置：

- 腾讯云 SecretId、SecretKey、SIP 服务配置是平台共享。
- 萤石设备列表也是从平台配置读取。
- 第三方远端“已创建但未绑定项目”的设备，当前没有本地租户归属表。

因此，未绑定设备在当前实现里属于平台共享候选池；只有绑定到 `project_cameras` 后，才有明确租户归属。

## 腾讯云设备创建的现状

接口：

```http
POST /projects/:project_id/cameras/tencent-devices
```

当前会先校验当前员工可以更新该项目，但创建设备后只返回腾讯云设备接入信息，不会在本地立即落一条“设备归属租户”记录。

也就是说：

- 创建时通过项目权限限制谁能创建。
- 归属落库发生在后续绑定通道到项目时。
- 如果设备创建后一直未绑定项目，本地无法仅凭数据库判断它属于哪个租户。

## 建议的后续强化

如果业务需要严格回答“未绑定设备也属于哪个租户”，建议新增本地设备资产表：

```text
tenant_devices
```

核心字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 本地设备资产 ID |
| `tenant_id` | 设备所属租户 |
| `vendor` | 设备厂商 |
| `vendor_device_serial` | 第三方设备 ID |
| `vendor_device_code` | 第三方设备编码 |
| `vendor_channel_id` | 通道 ID，可为空 |
| `source_project_id` | 创建设备时使用的项目 ID |
| `status` | 设备状态 |
| `created_by` | 创建设备的员工 ID |

强化后规则：

1. 腾讯云创建设备成功后立即写入 `tenant_devices`。
2. 设备列表按 `tenant_devices.tenant_id` 过滤。
3. 绑定项目时要求 `tenant_devices.tenant_id = projects.tenant_id`。
4. 解绑项目后设备仍归属原租户，可重新绑定到同租户其他项目。
5. 平台超管可以查看全量设备资产和归属。

## 对接注意

Admin：

- 当前页面可以继续使用现有设备通道列表和绑定接口。
- 展示绑定状态时，跨租户设备只提示“已被占用”，不要展示对方租户项目详情。
- 如果后续新增 `tenant_devices`，设备列表应优先展示当前租户设备资产。

微信小程序：

- 客户端不直接接入第三方设备池。
- 小程序只请求项目下已绑定的摄像头。
- 播放前由后端校验客户、项目和租户一致。

后端：

- 不接受前端传入 `tenant_id` 作为设备归属依据。
- 归属必须从当前登录上下文和项目 `tenant_id` 推导。
- 未绑定设备严格归属需要新增 `tenant_devices`，不能只靠第三方设备 ID 推断。
