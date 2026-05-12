# 微信小程序项目摄像头与设备资产对接说明

日期：2026-05-12

## 结论

小程序端不直接接入 `tenant_devices`。

`tenant_devices` 是租户 admin 的设备资产池，用于设备纳入、改名、删除和绑定项目。小程序端只消费项目下已经绑定好的摄像头。

## 小程序继续使用的接口

项目摄像头列表：

```http
GET /projects/:project_id/cameras
Authorization: Bearer <customer-token>
```

播放参数：

```http
POST /projects/:project_id/cameras/:camera_id/play-params
Authorization: Bearer <customer-token>
```

## 权限与归属

后端会校验：

- 当前客户属于项目客户。
- 客户租户和项目租户一致。
- 摄像头属于该项目和租户。
- 摄像头 `can_view = true`。
- 视频未被后台标记为加密不可播放。

因此小程序不需要传 `tenant_id`，也不需要知道 `tenant_devices.id`。

## 小程序展示建议

摄像头列表展示字段仍来自项目摄像头：

- `name`
- `position`
- `status`
- `vendor`
- `cover_url`
- `can_control`
- `capabilities`

不要展示设备资产池字段：

- `tenant_devices.id`
- `vendor_device_serial`
- `vendor_channel_id`
- 第三方 SIP 配置

## 影响

本次 admin 切到租户设备资产池，不影响小程序。

小程序只有在 admin 完成“纳入资产 -> 绑定摄像头”后，才能看到项目下新增的摄像头。

Admin 的“同步资产”接口：

```http
POST /tenant-devices/sync
```

仍然只面向 admin，不需要小程序调用。小程序等待项目摄像头绑定完成后，通过原项目摄像头接口获取结果即可。
