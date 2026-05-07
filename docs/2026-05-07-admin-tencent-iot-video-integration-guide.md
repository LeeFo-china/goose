# Admin 端腾讯云物联网智能视频服务（行业版）对接文档

## 后端已提供的能力

后端已扩展 `project_cameras` 支持第二个厂商：

```text
vendor = tencent_iotvideo_industry
```

并新增腾讯云设备通道列表接口：

```http
GET /projects/:project_id/cameras/tencent-devices?only_unbound=true&keyword=关键词
Authorization: Bearer <admin-token>
```

权限要求：

```text
project.update
```

## 系统配置

后台系统配置页会出现新分组：

```text
腾讯云监控
```

需要配置：

```text
TENCENTCLOUD_SECRET_ID
TENCENTCLOUD_SECRET_KEY
TENCENT_IOT_VIDEO_REGION
TENCENT_IOT_VIDEO_ENDPOINT
TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL
TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION
```

推荐值：

```text
TENCENT_IOT_VIDEO_REGION=ap-guangzhou
TENCENT_IOT_VIDEO_ENDPOINT=iotvideoindustry.tencentcloudapi.com
TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL=flv
TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION=DescribeChannelLiveStreamURL
```

`SecretId` 和 `SecretKey` 是敏感配置，只能保存在后端系统配置或服务器环境变量，不允许传到前端。

## 腾讯云设备列表接口响应

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "device_id": "34020000001180000036_34020000001180000036",
        "device_code": "34020000001180000036",
        "device_name": "NVR-1",
        "device_type": 3,
        "channel_id": "34020000001180000036_34020000001320000092",
        "channel_code": "34020000001320000092",
        "channel_name": "工地入口",
        "channel_type": 1,
        "status": "online",
        "raw_status": 3,
        "protocol": "GB28181",
        "group_id": "group_root",
        "group_name": "全部",
        "is_bound": false,
        "is_bound_to_current_project": false,
        "bound_project_id": null,
        "bound_project_name": null,
        "bound_camera_id": null,
        "bound_camera_name": null,
        "can_bind": true
      }
    ]
  }
}
```

## Admin 页面改造建议

现有工地监控页已经支持萤石设备通道选择。建议在绑定弹窗里增加厂商切换：

```text
萤石云
腾讯云行业版
```

选择“腾讯云行业版”后：

1. 请求 `/projects/:project_id/cameras/tencent-devices?only_unbound=true`。
2. 展示设备名、设备 ID、通道名、通道 ID、状态。
3. 点选通道后自动填充绑定表单。
4. 提交时复用现有创建接口。

## 创建绑定

```http
POST /projects/:project_id/cameras
Authorization: Bearer <admin-token>
Content-Type: application/json
```

请求体：

```json
{
  "vendor": "tencent_iotvideo_industry",
  "vendor_device_serial": "34020000001180000036_34020000001180000036",
  "vendor_channel_id": "34020000001180000036_34020000001320000092",
  "vendor_device_code": "34020000001180000036",
  "vendor_channel_code": "34020000001320000092",
  "channel_no": 1,
  "name": "工地入口",
  "position": "客厅",
  "can_view": true,
  "can_control": false,
  "capabilities": ["live"],
  "video_encrypted": false,
  "play_protocol": "flv"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `vendor_device_serial` | 腾讯云 `DeviceId` |
| `vendor_channel_id` | 腾讯云 `ChannelId`，必填 |
| `vendor_device_code` | 腾讯云 `DeviceCode`，用于排查和展示 |
| `vendor_channel_code` | 腾讯云 `ChannelCode`，用于排查和展示 |
| `play_protocol` | 默认播放协议，建议 `flv` |

## 摄像头列表展示

建议在摄像头列表 item 上展示厂商：

```text
萤石云 / 腾讯云行业版
```

腾讯云摄像头可展示：

```text
DeviceId
ChannelId
ChannelCode
播放协议
```

这样播放失败时能快速对照腾讯云控制台排查。

## 错误处理

常见错误：

| 后端提示 | Admin 处理 |
| --- | --- |
| 腾讯云监控服务暂未配置 | 引导到系统配置页补 SecretId / SecretKey |
| 摄像头当前离线 | 标记设备离线，提示检查设备注册状态 |
| 摄像头不存在或已解绑 | 重新同步腾讯云设备通道 |
| 设备信令不通，请检查国标注册 | 提示检查 GB28181 注册、网络和 SIP 配置 |
| 该摄像头已绑定到其他项目 | 展示已绑定项目名，不允许重复绑定 |

