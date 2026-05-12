# Admin 租户设备资产对接说明

日期：2026-05-12

## 范围

工地监控页对接 `tenant_devices`，让租户先管理自己的设备资产，再把未绑定资产绑定到项目摄像头。

平台超管增加只读设备资产视图，用于排查设备通道的租户归属和绑定状态。

## 页面行为

### 设备资产区

接口：

```http
GET /tenant-devices?page=1&pageSize=100
```

用途：

- 展示当前租户设备资产。
- 支持编辑本地设备名称、通道名称、设备类型。
- 支持删除未绑定资产。
- 已绑定资产不能删除，需要先解绑项目摄像头。

编辑接口：

```http
PATCH /tenant-devices/:id
```

删除接口：

```http
DELETE /tenant-devices/:id
```

同步接口：

```http
POST /tenant-devices/sync
```

“同步资产”用于补齐当前租户已有设备对应的第三方通道。它不会自动导入陌生第三方设备，避免误归属。

### 第三方通道纳入资产

腾讯云/萤石第三方通道列表保留，但不再作为绑定弹窗的直接候选。

第三方通道的操作状态：

- 已经绑定项目摄像头：显示绑定项目。
- 已纳入当前租户资产池但未绑定：显示“已纳入资产”。
- 已纳入其他租户资产池：显示“其他租户资产”，不允许操作。
- 未绑定且未纳入任何租户资产池：显示“纳入资产”。

“纳入资产”调用：

```http
POST /tenant-devices
```

萤石示例：

```json
{
  "vendor": "ezviz",
  "vendor_device_serial": "EZVIZ_SERIAL",
  "vendor_device_name": "设备名",
  "vendor_channel_name": "通道名",
  "source_project_id": "项目ID",
  "status": "online",
  "metadata": {
    "channel_no": 1,
    "raw_status": 1,
    "video_encrypted": false
  }
}
```

腾讯云示例：

```json
{
  "vendor": "tencent_iotvideo_industry",
  "vendor_device_serial": "DeviceId",
  "vendor_device_code": "DeviceCode",
  "vendor_device_name": "设备名",
  "vendor_channel_id": "ChannelId",
  "vendor_channel_code": "ChannelCode",
  "vendor_channel_name": "通道名",
  "source_project_id": "项目ID",
  "status": "online"
}
```

### 绑定摄像头弹窗

绑定弹窗不再直接请求：

```http
GET /projects/:project_id/cameras/ezviz-devices?only_unbound=true
GET /projects/:project_id/cameras/tencent-devices?only_unbound=true
```

而是请求：

```http
GET /tenant-devices?only_unbound=true&page=1&pageSize=100
```

只展示当前租户资产池中未绑定的设备通道。

## 交互顺序

1. 用户进入工地监控页。
2. 查看“租户设备资产”。
3. 如果腾讯云设备刚创建但通道尚未补齐，点击“同步资产”。
4. 如果第三方通道还没有资产，先在腾讯云/萤石通道列表点击“纳入资产”。
5. 点击“绑定摄像头”。
6. 选择项目。
7. 从未绑定资产中选择设备通道。
8. 提交绑定。

## 注意事项

- Admin 不允许前端传 `tenant_id`。
- 删除设备资产是软删除，不删除第三方远端设备。
- 已绑定资产必须先解绑项目摄像头后才能删除。
- 腾讯云设备级资产如果没有 `vendor_channel_id`，不会进入绑定候选；需要通道上报后纳入通道资产。
- 同步资产只处理当前租户已有设备，不会把平台共享设备池自动导入租户。

## 平台超管设备资产

页面：

```text
/platform/devices
```

接口：

```http
GET /platform/tenant-devices?page=1&pageSize=20
```

支持筛选：

- `vendor`：厂商。
- `status`：在线状态。
- `only_unbound=true`：仅未绑定。
- `keyword`：设备名、设备 ID、通道 ID。

平台页面只读展示：

- 归属租户。
- 设备和通道标识。
- 在线状态。
- 当前绑定项目和摄像头。
- 更新时间。

平台页面不做编辑、删除、绑定，操作仍回到对应租户的工地监控页完成。
