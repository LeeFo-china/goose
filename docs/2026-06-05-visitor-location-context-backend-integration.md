# Visitor 定位上下文后端对接文档

更新时间：2026-06-05

## 背景

装修服务天然依赖本地服务能力。visitor 首页在用户未绑定客户/员工身份前，也需要建立“用户所在区域”的上下文，用于公开项目、本地活动、报价入口和后续线索分配。

当前客户侧已有 `/customer/location-*` 定位匹配链路，但 visitor 入口还没有独立定位上下文。后端需要补充 visitor 口径能力，支持：

- 用户只确认区域，不选择装修公司。
- 用户从多家本地候选装修公司中选择一家。
- 已确认装修公司偏好可保留 30 天。
- 绑定客户/员工身份后，身份租户优先，不能被 visitor 定位覆盖。

## 核心原则

1. visitor 定位是平台入口基础能力，不等同于客户身份绑定。
2. 用户可以不选择任何装修公司，只看平台内容。
3. 30 天缓存只适用于用户已确认的装修公司偏好，不适用于原始候选列表。
4. 无服务区域结果不能长期缓存，建议 5-10 分钟。
5. 已绑定客户/员工身份永远高于 visitor 定位上下文。
6. 默认不保存原始经纬度，除非隐私策略明确开启。

## 数据模型建议

建议使用或扩展 `user_location_contexts`，增加 visitor 场景字段。

推荐字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 定位上下文 ID |
| `auth_user_id` | uuid/null | 登录用户 ID |
| `visitor_id` | uuid/null | visitor ID |
| `source` | text | `gps` / `manual_city` / `manual_address` |
| `province` | text/null | 省 |
| `city` | text/null | 市 |
| `district` | text/null | 区县 |
| `adcode` | text/null | 行政区划代码 |
| `matched_tenants` | jsonb | 后端排序后的候选装修公司快照 |
| `recommended_tenant_id` | uuid/null | 单候选或默认推荐租户 |
| `selected_tenant_id` | uuid/null | 用户主动选择的装修公司 |
| `selection_status` | text | `pending` / `selected` / `skipped` / `expired` |
| `fallback_reason` | text/null | 无服务或兜底原因 |
| `confirmed_at` | timestamptz/null | 用户选择或跳过确认时间 |
| `expires_at` | timestamptz | 上下文过期时间 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

`selection_status` 语义：

| 值 | 含义 |
| --- | --- |
| `pending` | 已定位并返回候选，用户未选择也未跳过 |
| `selected` | 用户已选择装修公司 |
| `skipped` | 用户确认区域，但暂不选择装修公司 |
| `expired` | 上下文已失效 |

## TTL 策略

| 场景 | 建议 TTL | 说明 |
| --- | ---: | --- |
| 已选择装修公司 `selected` | 30 天 | 用户偏好，可复用但每次需要校验租户仍有效 |
| 已跳过选择 `skipped` | 30 天 | 保留区域偏好，不绑定租户 |
| 多候选未处理 `pending` | 30 分钟 | 避免长期保留过期候选 |
| 单候选自动推荐 | 30 天 | 可视为系统推荐偏好，但仍需校验 |
| 无服务区域 | 5-10 分钟 | 防止用户被旧兜底长期卡住 |
| GPS 原始坐标 | 不保存 | 默认只保留行政区字段 |

30 天上下文返回前必须重新校验：

- 租户仍为 active。
- 服务区域仍 active。
- 关联服务区域仍覆盖当前 `adcode/city/district`。
- 如不再有效，返回 `requires_rebootstrap=true` 或清理旧选择。

## 推荐接口

### 1. 获取 visitor 定位配置和上下文

```http
GET /visitor/location/options
Authorization: Bearer <visitor_token>
```

返回：

```json
{
  "location_match_enabled": true,
  "tencent_lbs": {
    "configured": true,
    "miniprogram_key": "lbs-key"
  },
  "open_service_areas": [
    {
      "province": "河南省",
      "city": "信阳市",
      "district": "固始县",
      "adcode": "411525",
      "tenant_count": 2
    }
  ],
  "context": {
    "context_id": "context-id",
    "province": "河南省",
    "city": "信阳市",
    "district": "固始县",
    "adcode": "411525",
    "selected_tenant_id": null,
    "selected_tenant": null,
    "selection_status": "skipped",
    "expires_at": "2026-07-05T00:00:00.000Z"
  }
}
```

### 2. 提交定位或手动区域

```http
POST /visitor/location-bootstrap
Authorization: Bearer <visitor_token>
Content-Type: application/json
```

请求：

```json
{
  "source": "gps",
  "province": "河南省",
  "city": "信阳市",
  "district": "固始县",
  "adcode": "411525",
  "latitude": 32.17,
  "longitude": 115.65,
  "accuracy": 80
}
```

后端默认不保存 `latitude`、`longitude`、`accuracy`，只用于当次匹配。

返回：

```json
{
  "context_id": "context-id",
  "location_match_enabled": true,
  "location": {
    "source": "gps",
    "province": "河南省",
    "city": "信阳市",
    "district": "固始县",
    "adcode": "411525"
  },
  "matched_tenants": [
    {
      "tenant_id": "tenant-a",
      "tenant_name": "固始晴天装饰工程有限公司",
      "tenant_slug": "tenant-sobmzdo5",
      "service_area_id": "area-id",
      "province": "河南省",
      "city": "信阳市",
      "district": "固始县",
      "adcode": "411525",
      "match_reason": "adcode",
      "match_rank": 100,
      "distance_km": null,
      "priority": 100
    }
  ],
  "recommended_tenant_id": "tenant-a",
  "requires_user_confirmation": false,
  "selection_status": "selected",
  "fallback_reason": null,
  "expires_at": "2026-07-05T00:00:00.000Z"
}
```

多候选时：

```json
{
  "context_id": "context-id",
  "matched_tenants": [
    { "tenant_id": "tenant-a", "tenant_name": "固始晴天装饰工程有限公司" },
    { "tenant_id": "tenant-b", "tenant_name": "默认装修公司" }
  ],
  "requires_user_confirmation": true,
  "selection_status": "pending",
  "expires_at": "2026-06-05T12:30:00.000Z"
}
```

无服务区域时：

```json
{
  "context_id": "context-id",
  "matched_tenants": [],
  "requires_user_confirmation": false,
  "selection_status": "skipped",
  "fallback_reason": "NO_SERVICE_AREA_MATCHED",
  "expires_at": "2026-06-05T12:10:00.000Z"
}
```

### 3. 用户选择装修公司

```http
POST /visitor/location-bootstrap/confirm
Authorization: Bearer <visitor_token>
Content-Type: application/json
```

请求：

```json
{
  "context_id": "context-id",
  "tenant_id": "tenant-b"
}
```

返回：

```json
{
  "context_id": "context-id",
  "selected_tenant_id": "tenant-b",
  "selected_tenant": {
    "tenant_id": "tenant-b",
    "tenant_name": "默认装修公司",
    "tenant_slug": "default"
  },
  "selection_status": "selected",
  "confirmed_at": "2026-06-05T12:00:00.000Z",
  "expires_at": "2026-07-05T12:00:00.000Z"
}
```

### 4. 用户跳过选择装修公司

```http
POST /visitor/location-bootstrap/skip
Authorization: Bearer <visitor_token>
Content-Type: application/json
```

请求：

```json
{
  "context_id": "context-id"
}
```

返回：

```json
{
  "context_id": "context-id",
  "selected_tenant_id": null,
  "selected_tenant": null,
  "selection_status": "skipped",
  "confirmed_at": "2026-06-05T12:00:00.000Z",
  "expires_at": "2026-07-05T12:00:00.000Z"
}
```

### 5. 读取当前 visitor 上下文

```http
GET /visitor/location-context
Authorization: Bearer <visitor_token>
```

返回当前有效上下文。没有有效上下文时返回 `context=null`。

## 匹配排序规则

沿用客户侧阶段 5 排序：

```text
match_rank DESC, priority DESC, distance_km ASC, tenant_name ASC
```

小程序端会按后端返回顺序展示，不自行重排。

匹配原因：

| `match_reason` | 说明 |
| --- | --- |
| `adcode` | 行政区划代码精确匹配 |
| `district` | 区县匹配 |
| `city` | 城市匹配 |
| `province` | 省份兜底 |
| `distance` | 距离范围匹配 |

visitor 场景不应返回 `identity` 作为普通定位匹配结果。用户升级为客户/员工后，走身份优先逻辑。

## 与客户/员工身份升级

visitor 选择的 `selected_tenant_id` 只能作为偏好，不是客户绑定。

当 visitor 通过手机号验证成为客户时：

1. 后端按客户身份解析真实租户。
2. 如果客户已有绑定租户，以客户绑定租户为准。
3. 如果是 visitor 自助新建客户，可把 visitor `selected_tenant_id` 作为推荐负责人/归属租户候选，但必须重新校验租户 active。
4. 不能让 visitor 定位上下文切换已有客户或员工租户。

## 后续内容接口联动

后续公开内容接口可按 visitor 上下文过滤或排序：

- `/front/projects`：优先返回本地区公开项目；未选租户时返回区域级内容；已选租户时可优先该租户公开项目。
- `/public/marketing-pages?scene=home`：可支持区域或租户推荐，但没有上下文时仍返回平台活动。
- `/platform/leads`：提交线索时携带当前 `context_id` 或由后端按 visitor token 自动关联。

接口不应因为没有 `selected_tenant_id` 返回空白。

## 报价线索归属约束

报价业务保持平台派单为主。visitor 定位上下文中的 `selected_tenant_id` 只代表用户关注或偏好的本地服务商，不代表报价线索直接归属该装修公司。

后端处理建议：

- 报价或线索提交时，继续创建平台线索，由平台派单规则分配装修公司。
- 派单区域应使用用户确认的服务区域，不应直接使用手机当前 GPS 所在地。
- 可把 visitor `selected_tenant_id` 作为 `preferred_tenant_id` 或派单参考因子保存到线索扩展字段。
- 不应仅因为 visitor 选择过服务商，就把线索 `tenant_id` 直接写成该服务商。
- 如果后续支持“指定服务商报价”，需要新增显式业务字段和用户确认文案，不能复用 visitor 定位偏好语义。

## 隐私和风控

- 默认 `LOCATION_STORE_RAW_COORDINATE=false`。
- visitor 定位上下文默认不保存原始经纬度。
- 日志和埋点不要输出腾讯 LBS Key、token、原始坐标。
- 记录省/市/区县、adcode、候选数量、`fallback_reason`、`match_reason` 即可。
- 清理任务应删除过期且未确认的 `pending` 上下文。
- 已确认的 `selected/skipped` 上下文按 30 天 TTL 过期。

## 后端验收用例

| # | 用例 | 预期 |
| --- | --- | --- |
| 1 | 新 visitor 获取 options | 返回 LBS 配置、服务区域、`context=null` |
| 2 | GPS 提交固始县且单候选 | 返回单候选，`selection_status=selected` 或无需确认 |
| 3 | GPS 提交固始县且多候选 | 返回多候选，`requires_user_confirmation=true`，`selection_status=pending` |
| 4 | 多候选选择第二家公司 | confirm 后 `selected_tenant_id` 为第二家公司，TTL 30 天 |
| 5 | 多候选跳过选择 | skip 后 `selected_tenant_id=null`，`selection_status=skipped`，TTL 30 天 |
| 6 | 无服务区域 | 返回 `fallback_reason=NO_SERVICE_AREA_MATCHED`，短 TTL |
| 7 | 30 天内再次读取上下文 | 返回有效区域和已选/跳过状态 |
| 8 | 已选租户被停用 | 返回需要重新 bootstrap，不返回无效租户 |
| 9 | visitor 升级为已绑定客户 | 客户身份租户优先，不使用 visitor 租户覆盖 |
| 10 | visitor 升级为员工 | 员工身份租户优先，不使用 visitor 租户覆盖 |

## 小程序回写要求

后端完成后，小程序团队需要回写：

1. visitor 首页是否能读取已有 30 天上下文。
2. 自动定位成功后是否展示当前区域。
3. 拒绝定位后是否进入手动区域选择。
4. 多候选是否按后端顺序展示。
5. 选择第二家公司 confirm 是否成功。
6. 跳过选择后是否保留区域且不绑定租户。
7. 无服务区域是否展示平台内容和兜底文案。
8. 已绑定客户/员工是否不被 visitor 定位切换租户。

## 后端对接完成记录（2026-06-05）

已完成后端能力：

- 扩展 `user_location_contexts` 支持 visitor 场景：
  - `auth_user_id` 允许为空。
  - 新增 `visitor_id`，使用 visitor token 中的 `visitor_id` 字符串。
  - 新增 `selection_status`：`pending` / `selected` / `skipped` / `expired`。
- 新增 migration：
  `20260605090000_add_visitor_location_context.sql`
- 新增 visitor 接口：
  - `GET /visitor/location/options`
  - `GET /visitor/location-context`
  - `POST /visitor/location-bootstrap`
  - `POST /visitor/location-bootstrap/confirm`
  - `POST /visitor/location-bootstrap/skip`
- visitor session 路由白名单已放行上述接口。
- 默认不保存 visitor 原始经纬度，继续受 `LOCATION_STORE_RAW_COORDINATE` 控制。

TTL 实现：

| 场景 | TTL |
| --- | ---: |
| 多候选待处理 `pending` | 30 分钟 |
| 选择装修公司 `selected` | 30 天 |
| 用户跳过选择 `skipped` | 30 天 |
| 无服务区域 `NO_SERVICE_AREA_MATCHED` | 10 分钟 |
| 单候选自动选择 `selected` | 30 天 |

开发库 smoke 结果：

| 用例 | 结果 |
| --- | --- |
| 新 visitor 获取 options | 通过，返回 LBS 配置、已开通服务区域、`context=null` |
| 固始县多候选 bootstrap | 通过，返回 2 家装修公司，`selection_status=pending`，`requires_user_confirmation=true` |
| 多候选选择第二家公司 | 通过，`selected_tenant_id=5f9404fd-23a7-4686-a606-b2627a65611d`，TTL 约 30 天 |
| 读取当前 visitor 上下文 | 通过，返回已选装修公司和 `selection_status=selected` |
| 多候选跳过选择 | 通过，`selected_tenant_id=null`，`selection_status=skipped`，TTL 约 30 天 |
| 无服务区域 | 通过，`fallback_reason=NO_SERVICE_AREA_MATCHED`，TTL 约 10 分钟 |

待小程序回写后继续确认：

- 小程序是否按 `selection_status=pending` 展示多候选选择页。
- 小程序是否在 `skipped` 状态下保留区域，但不写入租户上下文。
- 已绑定客户/员工登录后是否继续走身份租户优先，不被 visitor 定位上下文覆盖。

## 小程序对接回写（2026-06-05）

orange 小程序已按后端回写契约完成 visitor 首页定位上下文接入。

前端实现位置：

- `src/services/visitor_location_context.ts`
- `src/utils/location_context.ts`
- `src/pages/visitor/hooks/useVisitorLocationContext.ts`
- `src/pages/visitor/components/VisitorLocationPanel.tsx`
- `src/pages/visitor/index.tsx`
- `src/pages/visitor/VisitorView.tsx`
- `src/pages/visitor/_index-part4.scss`

接口契约对齐：

- `GET /visitor/location/options`
  - 已读取 `location_match_enabled`、`tencent_lbs`、`open_service_areas`、`context`。
  - 已兼容 `requires_rebootstrap`；当后端要求重新 bootstrap 时，小程序不会复用旧上下文。
- `POST /visitor/location-bootstrap`
  - GPS 自动定位和手动区域选择都会提交行政区信息。
  - 小程序只把经纬度用于当次 bootstrap，不在前端做长期坐标缓存。
- `POST /visitor/location-bootstrap/confirm`
  - 多候选场景支持按后端返回顺序关注本地服务商，该选择只作为偏好参考。
- `POST /visitor/location-bootstrap/skip`
  - 支持用户只确认区域，不选择装修公司。
- `GET /visitor/location-context`
  - 类型已兼容 `context` 和 `requires_rebootstrap`，当前首页入口优先通过 options 获取上下文。

小程序回写要求状态：

| # | 回写项 | 小程序对接状态 |
| --- | --- | --- |
| 1 | visitor 首页读取已有 30 天上下文 | 已对接。`options.context && !requires_rebootstrap` 时直接展示当前区域和已选/跳过状态 |
| 2 | 自动定位成功后展示当前区域 | 已对接。`Taro.getLocation` + 腾讯位置 SDK 逆地址解析后提交 bootstrap，并展示后端返回区域 |
| 3 | 拒绝定位后进入手动区域选择 | 已对接。GPS 失败或未授权时展示手动服务区域选择 |
| 4 | 多候选按后端顺序展示 | 已对接。`selection_status=pending` / `requires_user_confirmation=true` 时展示候选公司列表，不在前端重排 |
| 5 | 选择第二家公司 confirm | 已对接。点击候选公司调用 confirm，成功后写入 `selected_tenant` 并回到当前区域展示 |
| 6 | 跳过选择后保留区域且不绑定租户 | 已对接。skip 成功后保留区域，`selected_tenant_id=null`，`selection_status=skipped` |
| 7 | 无服务区域展示平台内容和兜底文案 | 已对接。无候选或 `NO_SERVICE_AREA_MATCHED` 时保留 visitor 首页内容，并显示兜底提示 |
| 8 | 已绑定客户/员工不被 visitor 定位切换租户 | 已对接。visitor 定位 hook 仅在 visitor/platform visitor 状态启用，客户/员工身份仍走现有身份租户优先链路 |

本轮验证：

| 命令 | 结果 |
| --- | --- |
| `pnpm run check:file-size src/services/visitor_location_context.ts src/pages/visitor/hooks/useVisitorLocationContext.ts src/pages/visitor/components/VisitorLocationPanel.tsx src/utils/location_context.ts src/pages/visitor/index.tsx src/pages/visitor/VisitorView.tsx src/pages/visitor/index.scss src/pages/visitor/_index-part4.scss` | 通过 |
| `pnpm run typecheck` | 通过 |
| `pnpm run build:weapp:dev` | 通过，`TARO_APP_BASEURL=http://192.168.1.5:3000`，webpack compiled successfully in 14.44s |

待人工补充：

- 以上 8 项为代码对接和开发构建核验结果。
- 仍建议小程序团队在微信开发者工具或真机用 visitor token 做一次端到端验收，并把实际请求响应、定位授权结果和 confirm/skip 行为补充到本节。

## 后端收口确认（2026-06-05）

后端已基于小程序回写重新做 visitor 核心接口 smoke，本轮暂无新增接口或字段阻塞项。

复测结果：

| 用例 | 结果 |
| --- | --- |
| 固始县 visitor bootstrap | 通过，返回 2 家装修公司，`selection_status=pending`，`requires_user_confirmation=true` |
| confirm 第二家公司 | 通过，`selected_tenant_id=5f9404fd-23a7-4686-a606-b2627a65611d`，`selection_status=selected` |
| 读取当前 visitor context | 通过，返回已选装修公司，`requires_rebootstrap=false` |

当前结论：

- 小程序代码对接和构建验证已完成。
- 后端真实接口 smoke 已完成。
- 剩余工作是小程序团队用微信开发者工具或真机补一次端到端人工复测，并把实际请求响应补充到本文。
