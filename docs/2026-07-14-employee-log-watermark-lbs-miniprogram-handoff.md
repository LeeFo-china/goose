# 员工施工日志水印地址解析对接说明

日期：2026-07-14

## 背景

小程序“添加施工日志 > 水印相机”已经能通过 `Taro.getLocation`
获取 `gcj02` 经纬度，也已经接入腾讯地图小程序 SDK 和逆地址解析工具。
当前缺口是施工日志页请求 `employee-detail-bootstrap` 后拿不到腾讯 LBS
小程序 Key，导致水印只能展示经纬度。

## 后端变更

接口：

```http
GET /projects/:projectId/employee-detail-bootstrap
```

响应新增顶层字段：

```json
{
  "tencent_lbs": {
    "configured": true,
    "miniprogram_key": "腾讯位置服务小程序 Key"
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tencent_lbs.configured` | `boolean` | 后端是否配置了可供小程序端使用的腾讯 LBS Key |
| `tencent_lbs.miniprogram_key` | `string \| null` | 小程序端调用 `reverseGeocoder` 使用的 Key |

未配置或读取失败时返回：

```json
{
  "tencent_lbs": {
    "configured": false,
    "miniprogram_key": null
  }
}
```

后端读取系统配置项 `TENCENT_LBS_MINIPROGRAM_KEY`。该字段只进入接口响应，
不会写入日志。

## 小程序建议改动

建议在 orange 仓库做以下调整：

1. 在 `src/services/projects/types/status.ts` 的
   `ProjectEmployeeDetailBootstrapPayload` 增加：

   ```ts
   tencent_lbs?: {
     configured?: boolean | null;
     miniprogram_key?: string | null;
   } | null;
   ```

2. `src/services/projects/methods/employee.ts` 不需要新增请求参数，
   继续请求现有 `GET /projects/:projectId/employee-detail-bootstrap`，
   只需要保留并透传响应里的 `tencent_lbs`。

3. `src/packageProjects/pages/logEdit/hooks/useProjectLogPermissionContext.ts`
   在拿到 bootstrap 后保存 `bootstrap.tencent_lbs`。

4. 打开水印相机时先 `Taro.getLocation({ type: 'gcj02' })`。
   如果 `tencent_lbs.configured === true` 且 `miniprogram_key` 非空，
   调用现有腾讯 LBS `reverseGeocoder` 工具。

5. 水印展示建议：

   ```text
   经纬度 32.xxxxxx, 115.xxxxxx
   地址 河南省信阳市固始县 xxx 附近
   ```

6. 如果逆地址解析失败、定位失败或未配置 Key，只展示经纬度或现有兜底文案；
   不阻塞拍照，不把“地址解析失败”写入照片。

## 兼容和安全

- 不需要新增后端接口。
- 不需要后端保存本次拍照坐标。
- 不需要把腾讯 LBS Key 写死到小程序代码。
- 小程序端不要把 `miniprogram_key` 写入日志。
- 腾讯位置服务控制台应限制该 Key 到当前小程序 AppID 和对应能力。

## 验收清单

- `employee-detail-bootstrap` 返回 `tencent_lbs.configured=true` 时，小程序水印能展示经纬度和地址。
- `configured=false` 或 `miniprogram_key=null` 时，水印相机仍可正常拍照。
- 逆地址解析失败时，不阻塞拍照，不把失败提示写进水印。
- 旧版本小程序忽略新增字段不受影响。
