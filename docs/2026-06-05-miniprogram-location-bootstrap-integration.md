# 小程序定位匹配对接文档

更新时间：2026-06-05

后端完成提交：`93cd31c feat(location): 完成定位确认后端闭环`

本文档用于小程序团队对接“登录后先定位，再匹配本地装修公司”的流程。
小程序仓库不在本次改动范围内，所有对接信息以本文档为准。

## 目标

- 用户登录后优先获取定位。
- 后端根据省、市、区县、adcode 和服务区域匹配装修公司。
- 一个地区允许匹配多家装修公司，小程序需要支持用户选择。
- 用户拒绝定位或定位失败时，使用后端返回的已开通服务区域做手动选择。
- 已绑定客户或员工身份时，不能被 GPS 定位错误切换租户。

## 前置条件

- 请求必须携带用户登录后的 Bearer Token。
- 生产环境上线前必须先执行数据库 migration：
  `supabase/migrations/20260605001649_create_user_location_contexts.sql`
- 后端 API 镜像必须包含提交 `93cd31c` 之后的代码。
- 腾讯位置服务 WebService Key/SK 和小程序 Key 已在 admin 后台配置。
- 小程序端只使用后端返回的 `tencent_lbs.miniprogram_key`，不要把
  WebService Key 或 SK 放到小程序端。

## 通用响应格式

成功响应使用当前后端统一包装：

```json
{
  "data": {},
  "message": "success"
}
```

失败响应示例：

```json
{
  "success": false,
  "message": "参数错误",
  "code": "BAD_REQUEST",
  "details": {},
  "requestId": "..."
}
```

小程序端应优先展示 `message`，并在日志中记录 `requestId` 方便排查。

## 对接流程

1. 用户登录成功后，立即调用 `GET /customer/location/options`。
2. 如果 `location_match_enabled=false`，跳过定位匹配，按原有首页流程进入。
3. 如果 `location_match_enabled=true`，调用微信定位能力获取经纬度。
4. 定位成功后，用腾讯位置服务小程序 SDK 做逆地址解析，得到省、市、区县、
   adcode。
5. 调用 `POST /customer/location-bootstrap` 提交定位结果。
6. 如果返回 `requires_user_confirmation=false` 且有
   `recommended_tenant_id`，可直接进入推荐租户上下文。
7. 如果返回 `requires_user_confirmation=true`，展示
   `matched_tenants` 列表给用户选择。
8. 用户选择装修公司后，调用
   `POST /customer/location-bootstrap/confirm`。
9. 如果用户拒绝定位、定位失败或逆地址解析失败，使用
   `open_service_areas` 做手动省、市、区县选择，再以
   `source=manual_city` 调用 `POST /customer/location-bootstrap`。

## 接口 1：获取定位配置

`GET /customer/location/options`

请求头：

```http
Authorization: Bearer <customer_token>
```

响应示例：

```json
{
  "data": {
    "location_match_enabled": true,
    "tencent_lbs": {
      "miniprogram_key": "腾讯位置服务小程序 Key",
      "configured": true
    },
    "open_service_areas": [
      {
        "province": "河南省",
        "city": "信阳市",
        "district": "固始县",
        "adcode": "411525",
        "tenant_count": 1
      }
    ],
    "default_location": {
      "province": "河南省",
      "city": "信阳市",
      "district": "固始县",
      "adcode": "411525"
    },
    "fallback": {
      "manual_city_enabled": true
    }
  },
  "message": "success"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `location_match_enabled` | 后端定位匹配总开关 |
| `tencent_lbs.miniprogram_key` | 小程序端可用的腾讯位置服务 Key |
| `tencent_lbs.configured` | 后端是否已配置小程序 Key |
| `open_service_areas` | 已开通服务区域，用于手动选择兜底 |
| `default_location` | 默认区域，可用于首次 UI 默认值 |
| `fallback.manual_city_enabled` | 是否允许手动城市/区县选择 |

## 接口 2：提交定位匹配

`POST /customer/location-bootstrap`

请求头：

```http
Authorization: Bearer <customer_token>
Content-Type: application/json
```

GPS 定位请求示例：

```json
{
  "source": "gps",
  "latitude": 32.168,
  "longitude": 115.654,
  "accuracy": 65,
  "province": "河南省",
  "city": "信阳市",
  "district": "固始县",
  "adcode": "411525"
}
```

手动城市请求示例：

```json
{
  "source": "manual_city",
  "province": "河南省",
  "city": "信阳市",
  "district": "固始县",
  "adcode": "411525"
}
```

响应示例：

```json
{
  "data": {
    "context_id": "20e19a39-14dc-4a4d-848e-83c0ba268b19",
    "expires_at": "2026-06-06T00:24:19.239+00:00",
    "location_match_enabled": true,
    "location": {
      "source": "manual_city",
      "province": "河南省",
      "city": "信阳市",
      "district": "固始县",
      "adcode": "411525"
    },
    "identity": {
      "match_kind": null,
      "bound_tenant_id": null,
      "reference_id": null
    },
    "matched_tenants": [
      {
        "tenant_id": "3eebca47-961f-4899-b976-a3d3208d326b",
        "tenant_name": "固始晴天装饰工程有限公司",
        "tenant_slug": "tenant-sobmzdo5",
        "service_area_id": "...",
        "province": "河南省",
        "city": "信阳市",
        "district": "固始县",
        "adcode": "411525",
        "match_reason": "adcode",
        "distance_km": null,
        "priority": 100
      }
    ],
    "recommended_tenant_id": "3eebca47-961f-4899-b976-a3d3208d326b",
    "requires_user_confirmation": false,
    "fallback_reason": null
  },
  "message": "success"
}
```

关键字段说明：

| 字段 | 说明 |
| --- | --- |
| `context_id` | 本次定位匹配上下文 ID，确认接口必须传 |
| `expires_at` | 上下文过期时间，小程序本地缓存不能超过该时间 |
| `matched_tenants` | 候选装修公司列表，可能有 0、1 或多条 |
| `recommended_tenant_id` | 后端推荐的装修公司 |
| `requires_user_confirmation` | 是否必须展示选择页 |
| `fallback_reason` | 无法正常匹配时的原因 |

## 接口 3：确认装修公司

`POST /customer/location-bootstrap/confirm`

请求头：

```http
Authorization: Bearer <customer_token>
Content-Type: application/json
```

请求示例：

```json
{
  "context_id": "20e19a39-14dc-4a4d-848e-83c0ba268b19",
  "tenant_id": "3eebca47-961f-4899-b976-a3d3208d326b"
}
```

响应示例：

```json
{
  "data": {
    "context_id": "20e19a39-14dc-4a4d-848e-83c0ba268b19",
    "selected_tenant_id": "3eebca47-961f-4899-b976-a3d3208d326b",
    "selected_tenant": {
      "tenant_id": "3eebca47-961f-4899-b976-a3d3208d326b",
      "tenant_name": "固始晴天装饰工程有限公司",
      "tenant_slug": "tenant-sobmzdo5"
    },
    "confirmed_at": "2026-06-05T00:25:10.000+00:00",
    "expires_at": "2026-06-06T00:24:19.239+00:00"
  },
  "message": "success"
}
```

确认失败常见原因：

| 场景 | 小程序处理 |
| --- | --- |
| `context_id` 过期 | 提示重新定位或重新选择城市 |
| `tenant_id` 不在候选列表 | 回到候选列表重新选择 |
| 登录态失效 | 重新登录后再走定位流程 |

## 小程序页面和交互建议

### 登录后定位页

- 登录成功后立即进入定位处理。
- 定位授权弹窗由微信系统触发。
- 业务 UI 只展示必要的定位中状态和失败兜底入口。
- 不要在页面文案中暴露腾讯 Key、经纬度或内部错误详情。

### 手动区域选择

- 数据源使用 `GET /customer/location/options` 返回的
  `open_service_areas`。
- 只允许用户选择已开通服务的省、市、区县。
- 选择后调用 `POST /customer/location-bootstrap`，`source` 使用
  `manual_city`。

### 装修公司选择页

当 `requires_user_confirmation=true` 时展示。

建议卡片字段：

| 字段 | UI 展示 |
| --- | --- |
| `tenant_name` | 装修公司名称 |
| `city` / `district` | 服务区域 |
| `match_reason` | 匹配原因 |
| `distance_km` | 非空时展示距离 |

`match_reason` 展示建议：

| 值 | 文案 |
| --- | --- |
| `identity` | 已绑定身份 |
| `adcode` | 区县精确匹配 |
| `district` | 区县匹配 |
| `city` | 城市匹配 |
| `distance` | 距离范围匹配 |

## 分支场景

| 场景 | 后端返回 | 小程序处理 |
| --- | --- | --- |
| 定位开关关闭 | `location_match_enabled=false` | 跳过定位，走原首页 |
| 单装修公司命中 | `matched_tenants.length=1` 且 `requires_user_confirmation=false` | 直接进入推荐租户 |
| 多装修公司命中 | `matched_tenants.length>1` 且 `requires_user_confirmation=true` | 展示选择页，用户确认后调用 confirm |
| 用户拒绝定位 | 无 GPS 结果 | 展示手动区域选择 |
| 无服务区域命中 | `matched_tenants=[]` 或 `fallback_reason=NO_SERVICE_AREA_MATCHED` | 展示暂无服务或联系客服 |
| 已绑定客户/员工身份 | `match_reason=identity` | 优先使用身份绑定租户，不被 GPS 覆盖 |

## 隐私和安全

- 后端默认配置 `LOCATION_STORE_RAW_COORDINATE=false`。
- 默认不保存原始 `latitude`、`longitude`、`accuracy`。
- 小程序端不要打印原始经纬度、腾讯 Key、用户 token。
- 小程序本地缓存定位上下文时，过期时间不得超过 `expires_at`。
- WebService Key 和 SK 只能保存在服务端或数据库，不允许进入小程序端。
- 小程序 Key 需要在腾讯位置服务控制台限制可用小程序 AppID。

## 验收标准

小程序团队完成后，请按以下用例复测并把结果回写到本仓库对接记录：

| 用例 | 预期 |
| --- | --- |
| 获取定位配置 | `GET /customer/location/options` 返回 `configured=true` 和服务区域 |
| 用户拒绝定位 | 能进入手动区域选择，且只展示已开通区域 |
| 手动选择固始县 | bootstrap 返回 `context_id` 和候选装修公司 |
| 单装修公司区域 | 不强制展示选择页，可直接进入推荐租户 |
| 多装修公司区域 | 展示装修公司选择页，confirm 成功 |
| 无服务区域 | 展示暂无服务或联系客服兜底 |
| 过期上下文 confirm | 提示重新定位或重新选择城市 |
| 已绑定身份用户 | 不会被 GPS 匹配切换到其他租户 |

## 后端本地验收记录

开发环境后端已完成本地 smoke：

- `GET /customer/location/options` 通过。
- `POST /customer/location-bootstrap` 使用 `manual_city=固始县` 通过。
- `POST /customer/location-bootstrap/confirm` 通过。
- `user_location_contexts` 已写入上下文和确认结果。
- 默认未保存原始经纬度。

小程序端复测状态：待小程序团队根据本文档对接后回写。

## 生产发布注意事项

1. 先在生产数据库执行 migration：
   `20260605001649_create_user_location_contexts.sql`。
2. 确认生产 admin 已配置：
   - 腾讯位置服务 WebService Key
   - 腾讯位置服务 WebService SK
   - 腾讯位置服务小程序 Key
3. 确认生产库已有行政区划数据和装修公司服务区域。
4. 发布包含提交 `93cd31c` 之后代码的 API 镜像。
5. 小程序端按本文档验收标准在生产或预发环境复测。

## 参考

- 腾讯位置服务微信小程序 JavaScript SDK：
  https://lbs.qq.com/miniProgram/jsSdk/jsSdkGuide/jsSdkOverview
- 阶段计划文档：
  `docs/2026-06-04-location-first-tenant-matching-plan.md`
