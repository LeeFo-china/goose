# 小程序端腾讯云物联网智能视频服务（行业版）对接文档

## 后端播放参数接口

小程序继续复用现有接口：

```http
POST /projects/:project_id/cameras/:camera_id/play-params
Authorization: Bearer <token>
Content-Type: application/json
```

请求体：

```json
{
  "stream": "live"
}
```

## 萤石返回保持兼容

```json
{
  "camera": {
    "id": "camera-id",
    "vendor": "ezviz",
    "name": "工地入口",
    "status": "online",
    "can_control": false,
    "capabilities": ["live"]
  },
  "player": {
    "provider": "ezplayer",
    "plugin_version": "1.5.2",
    "access_token": "xxx",
    "play_url": "rtmp://open.ys7.com/xxx/1/live",
    "expires_at": "2026-05-07T12:00:00.000Z"
  }
}
```

## 腾讯云返回

```json
{
  "camera": {
    "id": "camera-id",
    "vendor": "tencent_iotvideo_industry",
    "name": "工地入口",
    "status": "online",
    "can_control": false,
    "capabilities": ["live"]
  },
  "player": {
    "provider": "tencent_iot_video_industry",
    "protocol": "flv",
    "src": "https://dev-pl.video.tencentcs.com/live/xxx.flv?txSecret=xxx&txTime=xxx",
    "flv_url": "https://dev-pl.video.tencentcs.com/live/xxx.flv?txSecret=xxx&txTime=xxx",
    "rtmp_url": "rtmp://dev-pl.video.tencentcs.com/live/xxx?txSecret=xxx&txTime=xxx",
    "hls_url": "https://dev-pl.video.tencentcs.com/live/xxx.m3u8?txSecret=xxx&txTime=xxx",
    "rtsp_url": null,
    "request_id": "腾讯云 RequestId",
    "expires_at": null
  }
}
```

小程序端应以：

```text
player.provider
```

作为播放器分发依据。

## Taro 页面改造

当前页面：

```text
src/packageCustomerPortal/pages/project-camera-monitor/index.tsx
```

需要从只渲染 `ezplayer` 改成 provider 分发。

示例：

```tsx
import { LivePlayer, Video } from '@tarojs/components';

function renderPlayer(player) {
  if (player?.provider === 'ezplayer') {
    return (
      <ezplayer
        id="ezplayer"
        accessToken={player.access_token}
        url={player.play_url}
        plugins={{}}
        themeData={{}}
      />
    );
  }

  if (player?.provider === 'tencent_iot_video_industry') {
    if (player.protocol === 'hls') {
      return (
        <Video
          src={player.src}
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
        objectFit="contain"
        minCache={1}
        maxCache={3}
      />
    );
  }

  return null;
}
```

## 推荐交互

1. 进入页面获取摄像头列表。
2. 默认请求第一个摄像头播放参数。
3. 切换摄像头时重新请求播放参数。
4. 点击“刷新播放”时重新请求播放参数。
5. 小程序从后台回前台时重新请求播放参数。
6. `live-player` 触发错误时最多自动重试 1 次。

## 合法域名和权限

小程序端需要确认：

- 后端 API 域名在 request 合法域名内。
- 腾讯云播放地址域名在小程序后台配置为合法域名，实际以 `player.src` 返回域名为准。
- `live-player` 组件权限和类目可用。
- 体验版二维码和真机调试都要验证，不能只看开发者工具。

## 错误处理

后端错误建议这样映射：

| 后端 message | 小程序提示 |
| --- | --- |
| 摄像头当前离线 | 摄像头当前离线，请稍后再试 |
| 摄像头不存在或已解绑 | 摄像头已解绑，请联系项目负责人 |
| 腾讯云播放地址为空 | 播放地址获取失败，请刷新重试 |
| 设备信令不通，请检查国标注册 | 设备连接异常，请联系项目负责人 |
| 腾讯云监控服务暂未配置 | 监控服务暂不可用 |

## 注意事项

- 小程序不要保存腾讯云 `SecretId` / `SecretKey`。
- 小程序不要直接调腾讯云 OpenAPI。
- 播放地址是动态地址，切换摄像头、刷新播放、回前台都应重新请求后端。
- `expires_at` 第一版可能是 `null`，不要依赖该字段做定时刷新。

## 2026-05-07 联调补充

后端已按小程序联调交接文档补齐两处兼容：

1. `GET /projects/:project_id/cameras`
   - 腾讯云摄像头列表会尝试实时合并腾讯云通道状态。
   - 返回的 `status` 统一为 `online` / `offline` / `unknown`。
   - 如果腾讯云配置异常或接口不可用，列表不会失败，会保留库内状态。

2. `POST /projects/:project_id/cameras/:camera_id/play-params`
   - 腾讯云播放地址获取成功时，返回的 `camera.status` 会明确置为 `online`。
   - `player.provider` 固定为 `tencent_iot_video_industry`。
   - `player.protocol` 固定为小写协议。
   - `player.src` 必须与最终选择的协议地址一致。
   - 腾讯云播放失败时，后端会回写 `offline/unknown` 状态用于后续列表展示。

小程序端仍建议以 `play-params` 返回的 `camera.status` 覆盖当前选中摄像头状态，因为播放参数接口是用户真正发起播放时的最新结果。
