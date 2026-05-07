# 腾讯云物联网智能视频服务（行业版）小程序接入方案

## 结论

推荐第一版不要在小程序端直接接腾讯云 API，也不要把腾讯云密钥放到小程序。正确链路是：

```text
摄像头 / NVR / 网关
  -> GB28181 或 RTMP 接入腾讯云 IoT Video（行业版）
  -> gooes 后端调用腾讯云 API 获取动态播放地址
  -> 小程序请求 gooes 后端播放参数接口
  -> 小程序用 live-player 播放 FLV / RTMP
```

MVP 优先做实时预览，不先做云台控制、录像回放、X-P2P。当前项目已经有萤石摄像头链路，腾讯云行业版应按“第二个摄像头厂商”接入，而不是重写整个监控模块。

## 官方依据

- 腾讯云行业版支持 GB28181、RTMP 摄像头或边缘网关接入，并提供设备管理、实时观看、视频云存储、录像回看等能力。
- 行业版的 API 快速入门链路是：创建设备、查询设备、获取设备通道实时流地址。
- 实时流地址接口 `DescribeChannelLiveStreamURL` 会返回 `RtmpAddr`、`HlsAddr`、`FlvAddr`，地址是动态生成的，重新播放需要重新获取。
- 若未设置录制计划，正常推流在 180 秒无人观看后会被自动掐断。
- 行业版产品功能里明确提供微信小程序 SDK，并提供 X-P2P 用于多人观看同一路视频时降低带宽消耗。
- 小程序直播观看更适合 `live-player` 播放 FLV / RTMP；HLS 可以作为兼容兜底，但延迟明显更高。

参考：

- https://cloud.tencent.com/document/product/1361/67747
- https://cloud.tencent.com/document/product/1361/53762
- https://cloud.tencent.com/document/product/1361/53763
- https://cloud.tencent.com/document/product/1361/68272
- https://cloud.tencent.com/document/product/1361/50750
- https://cloud.tencent.com/document/product/454/12519

## 核心概念

腾讯云行业版里要区分 4 个字段：

| 概念 | 说明 | 我们系统建议保存 |
| --- | --- | --- |
| DeviceCode | 主设备编码，来自 GB28181 设备体系 | 可选，展示或排查用 |
| ChannelCode | 通道编码，通常由设备上报 | 可选，展示或排查用 |
| DeviceId | 腾讯云平台分配的主设备唯一 ID | 必须保存 |
| ChannelId | 腾讯云平台分配的通道唯一 ID | 必须保存 |

小程序播放实时画面时，真正需要的是后端用 `DeviceId + ChannelId` 调腾讯云获取播放地址。

## 后端落地方案

### 1. 配置项

新增系统配置或环境变量：

```text
TENCENTCLOUD_SECRET_ID
TENCENTCLOUD_SECRET_KEY
TENCENT_IOT_VIDEO_REGION
TENCENT_IOT_VIDEO_ENDPOINT=iotvideoindustry.tencentcloudapi.com
TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL=flv
```

密钥只允许后端使用，不进入 admin 前端和小程序端。

### 2. 数据模型

当前 `project_cameras` 已经服务萤石，建议扩展为多厂商：

```text
vendor:
  ezviz
  tencent_iotvideo_industry

vendor_device_serial:
  萤石：deviceSerial
  腾讯云：DeviceId

channel_no:
  萤石：channelNo
  腾讯云：可继续存数字通道序号，非核心

新增字段建议：
  vendor_channel_id text
  vendor_device_code text
  vendor_channel_code text
  play_protocol text default 'flv'
```

如果想少改表结构，也可以先把 `ChannelId` 存到 `vendor_extra.channel_id` JSON 字段，但长期不推荐。后续查询、唯一约束和排查都会更麻烦。

推荐唯一约束：

```sql
unique (vendor, vendor_device_serial, vendor_channel_id)
```

### 3. 腾讯云 Gateway

新增后端 gateway：

```text
apps/api/src/gateways/tencent-iot-video.ts
```

职责：

- 初始化腾讯云 SDK 客户端。
- 调用 `DescribeDeviceList` 同步设备。
- 调用 `DescribeChannels` 同步通道。
- 调用 `DescribeChannelLiveStreamURL` 获取实时播放地址。
- 统一转换腾讯云错误码为业务错误。

建议封装方法：

```ts
listDevices(): Promise<TencentIotVideoDevice[]>
listChannels(deviceId: string): Promise<TencentIotVideoChannel[]>
getLiveStreamUrl(input: {
  deviceId: string;
  channelId: string;
}): Promise<{
  rtmp_url: string | null;
  flv_url: string | null;
  hls_url: string | null;
  request_id: string;
}>
```

### 4. 后端接口

沿用当前项目摄像头接口，只扩展厂商能力。

#### admin 绑定设备

```http
GET /projects/:project_id/cameras/tencent-devices?only_unbound=true
```

返回：

```json
{
  "list": [
    {
      "device_id": "34020000001180000036_34020000001180000036",
      "device_code": "34020000001180000036",
      "device_name": "NVR-1",
      "channel_id": "34020000001180000036_34020000001320000092",
      "channel_code": "34020000001320000092",
      "channel_name": "客厅",
      "status": "online",
      "is_bound": false,
      "can_bind": true
    }
  ]
}
```

#### admin 创建绑定

复用：

```http
POST /projects/:project_id/cameras
```

请求：

```json
{
  "vendor": "tencent_iotvideo_industry",
  "vendor_device_serial": "DeviceId",
  "vendor_channel_id": "ChannelId",
  "vendor_device_code": "DeviceCode",
  "vendor_channel_code": "ChannelCode",
  "name": "工地入口",
  "position": "客厅",
  "can_view": true,
  "can_control": false,
  "video_encrypted": false
}
```

#### 小程序获取摄像头列表

继续复用：

```http
GET /projects/:project_id/cameras
```

后端仍要按当前逻辑做权限控制：

- 客户只能看自己项目下 `can_view = true` 的摄像头。
- 员工按 `project.read` 和项目访问范围判断。
- 完成 / 作废项目不允许客户继续访问。

#### 小程序获取播放参数

继续复用：

```http
POST /projects/:project_id/cameras/:camera_id/play-params
```

腾讯云厂商返回：

```json
{
  "camera": {
    "id": "camera-id",
    "name": "工地入口",
    "status": "online",
    "can_control": false,
    "capabilities": []
  },
  "player": {
    "provider": "tencent_iot_video_industry",
    "protocol": "flv",
    "src": "https://dev-pl.video.tencentcs.com/live/xxx.flv?txSecret=xxx&txTime=xxx",
    "flv_url": "https://dev-pl.video.tencentcs.com/live/xxx.flv?txSecret=xxx&txTime=xxx",
    "rtmp_url": "rtmp://dev-pl.video.tencentcs.com/live/xxx?txSecret=xxx&txTime=xxx",
    "hls_url": "https://dev-pl.video.tencentcs.com/live/xxx.m3u8?txSecret=xxx&txTime=xxx",
    "request_id": "腾讯云 RequestId",
    "expires_at": null
  }
}
```

`expires_at` 可以第一版先给 `null`。腾讯云返回地址里有 `txTime`，后端可以后续解析成过期时间，用于小程序提前刷新。

### 5. 播放地址缓存

第一版不建议长缓存播放地址，因为官方说明地址是动态生成的，重新播放要重新获取。建议：

- 后端每次小程序点“刷新播放”或切换摄像头时实时调用腾讯云。
- 可加 15 - 30 秒内存缓存，避免用户连续点击造成接口抖动。
- 不把播放地址持久化到数据库。

### 6. 错误映射

腾讯云错误码建议映射：

| 腾讯云错误 | 后端业务错误 |
| --- | --- |
| `InvalidParameterValue.DeviceOffline` | 摄像头当前离线 |
| `ResourceNotFound.DeviceNotExist` | 摄像头不存在或已解绑 |
| `ResourceUnavailable.StreamInfoException` | 视频流信息异常，请稍后重试 |
| `UnsupportedOperation.DeviceSipCommandFail` | 设备信令不通，请检查国标注册 |
| 其他腾讯云错误 | 获取播放地址失败 |

后端需要记录：

```text
camera_access_logs.action = play_params
result = success / failure
error_message = 腾讯云错误码 + RequestId
```

## 小程序端落地方案

### 1. 播放组件选择

第一版推荐：

```text
优先：LivePlayer 播放 FLV
备选：LivePlayer 播放 RTMP
兜底：Video 播放 HLS
```

原因：

- `DescribeChannelLiveStreamURL` 返回 FLV、RTMP、HLS 三种地址。
- 小程序实时监控更关注低延迟，FLV / RTMP 比 HLS 更适合。
- HLS 可以兜底兼容，但延迟更高，不作为默认。

Taro 示例：

```tsx
import { LivePlayer, Video } from '@tarojs/components';

function CameraPlayer({ player }) {
  if (!player?.src) return null;

  if (player.protocol === 'hls') {
    return (
      <Video
        src={player.hls_url}
        controls
        autoplay
        objectFit="contain"
      />
    );
  }

  return (
    <LivePlayer
      id="project-camera-live-player"
      src={player.src}
      mode="live"
      autoplay
      muted={false}
      orientation="vertical"
      objectFit="contain"
      minCache={1}
      maxCache={3}
      onStateChange={(event) => {
        console.log('live-player state', event.detail);
      }}
      onError={(event) => {
        console.log('live-player error', event.detail);
      }}
    />
  );
}
```

### 2. 当前页面改造点

当前小程序页面：

```text
src/packageCustomerPortal/pages/project-camera-monitor/index.tsx
```

现在只识别萤石：

```tsx
<ezplayer accessToken={player.access_token} url={player.play_url} />
```

需要改成 provider 分发：

```tsx
if (player.provider === 'ezplayer') {
  return <ezplayer accessToken={player.access_token} url={player.play_url} />;
}

if (player.provider === 'tencent_iot_video_industry') {
  return <LivePlayer src={player.src} mode="live" autoplay />;
}
```

### 3. 小程序合法域名和权限

小程序端需要确认：

- 后端 API 域名已经在微信小程序后台配置为 request 合法域名。
- 腾讯云返回的播放域名需要按微信后台要求加入合法域名配置，实际域名以返回的 `FlvAddr` / `HlsAddr` / `RtmpAddr` 为准。
- `live-player` 组件不是所有类目默认开放，需要确认小程序类目和接口权限是否可用。
- 真机调试、体验版、线上版都要分别验证，开发者工具不能完全代表真实播放表现。

### 4. 小程序交互

建议保留当前交互：

- 进入页面加载摄像头列表。
- 默认拉第一个摄像头播放参数。
- 切换摄像头时重新请求播放参数。
- 播放失败显示错误态，并提供“刷新播放”。

新增处理：

- `player.provider` 不支持时提示“当前播放方式暂不支持”。
- `live-player` `onError` 后自动重新拉一次播放参数，最多重试 1 次。
- 小程序从后台回前台时重新获取播放参数。
- 用户离开页面时停止播放，避免继续占用观看链路。

## admin 后台落地方案

当前后台已经有“工地监控”配置页和萤石设备绑定能力。腾讯云接入后建议：

1. 摄像头绑定弹窗增加厂商切换：
   - 萤石
   - 腾讯云行业版
2. 选择腾讯云后，请求：

```http
GET /projects/:project_id/cameras/tencent-devices
```

3. 列表展示：
   - 设备名
   - 设备 ID
   - 通道名
   - 通道 ID
   - 在线状态
   - 是否已绑定
4. 绑定后写入 `project_cameras`。
5. 摄像头列表里增加厂商标识，方便排查。

## 分阶段实施

### 第一阶段：MVP

目标：小程序能播放腾讯云行业版实时监控。

后端：

- 扩展 `project_cameras.vendor` 支持 `tencent_iotvideo_industry`。
- 增加腾讯云配置项。
- 增加腾讯云 gateway。
- 增加腾讯云设备通道列表接口。
- 扩展 `/play-params`，按 vendor 返回不同 player。
- 记录播放参数获取日志。

admin：

- 工地监控配置页支持选择腾讯云设备通道。
- 摄像头列表展示厂商。

小程序：

- `ProjectCameraPlayerPayload` 增加腾讯云 player 字段。
- 监控页按 `player.provider` 渲染 `ezplayer` 或 `LivePlayer`。
- 增加播放失败刷新和回前台刷新。

### 第二阶段：稳定性

- 解析 `txTime` 生成 `expires_at`，小程序到期前刷新。
- 对播放地址接口加 15 - 30 秒短缓存。
- 增加 Tencent RequestId 到日志。
- 后台展示腾讯云设备同步时间和错误原因。
- 增加摄像头厂商维度过滤。

### 第三阶段：体验和成本优化

- 接入腾讯云小程序 SDK / X-P2P。
- 多人观看同一路工地视频时启用 P2P 降带宽。
- 做录像回放：
  - `DescribeRecordDatesByChannel`
  - `DescribeVideoListByChannel`
  - `DescribeChannelLocalRecordURL`
- 做 PTZ：
  - `ControlChannelPTZ`
  - 仅对 `can_control = true` 且员工有权限开放。

## 验收标准

MVP 完成后至少验证：

1. admin 能看到腾讯云设备通道列表。
2. admin 能把腾讯云通道绑定到项目。
3. 客户只能看到自己项目且 `can_view = true` 的摄像头。
4. 小程序真机可以播放 FLV 或 RTMP。
5. 摄像头离线时小程序显示明确错误。
6. 播放地址刷新后可以恢复播放。
7. 腾讯云 SecretId / SecretKey 不出现在前端包、接口响应和日志里。
8. 体验版二维码和真机调试都能走同一套播放链路。

## 风险点

- `live-player` 权限和类目限制需要提前在微信后台确认。
- 腾讯云返回的播放域名可能随资源或环境变化，需要以实际返回地址配置合法域名。
- RTMP 在部分网络环境下可能不如 HTTPS-FLV 稳定，默认建议 FLV。
- HLS 延迟较高，只作为兜底。
- 摄像头如果未设置录制计划且 180 秒无人观看，腾讯云可能自动断流，重新进入页面时要重新获取播放地址。
- 如果设备启用视频加密，需要确认腾讯云行业版对应的解密播放方案；MVP 默认不支持加密视频。

