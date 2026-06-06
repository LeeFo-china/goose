# Admin 平台租户地址腾讯 LBS 选择能力分阶段方案

更新时间：2026-06-06

## 背景

平台超管在 admin 侧维护装修公司租户时，目前只能手动填写 `tenants.address`。该字段已经用于小程序 visitor “了解本地服务商”列表展示，但后续如果要支持：

- 按装修公司门店位置做附近服务商推荐。
- 在地图上展示本地装修公司。
- 计算用户位置到装修公司门店距离。
- 校验装修公司办公地址与服务区域是否一致。

就需要同时保存租户公司的标准化地址、行政区划和经纬度。

## 现状

已具备：

- `tenants.address` 字段。
- admin 平台租户新建/编辑可维护地址。
- 后端已配置腾讯位置服务：
  - `TENCENT_LBS_WEBSERVICE_KEY`
  - `TENCENT_LBS_WEBSERVICE_SK`
  - `TENCENT_LBS_MINIPROGRAM_KEY`
- 后端已有 `tencentLbsService.geocodeAddress()`，可用 WebService 做地址解析。

当前缺口：

- `tenants` 表还没有租户公司经纬度字段。
- admin 侧没有地址搜索/选点控件。
- 没有后端代理地点搜索接口。
- 没有区分“手动输入地址”和“腾讯 LBS 选中地址”的可信状态。

## 总体原则

1. WebService Key/SK 只放后端，admin 前端不直接调用腾讯 WebService。
2. admin 前端调用本系统 API，由后端代理腾讯地点搜索和地址解析。
3. 第一阶段先做“搜索地址选择”，第二阶段再做“地图可视化选点”。
4. 地址和经纬度必须来自用户选中候选或明确确认，不用服务区域字段伪造公司地址。
5. 经纬度字段必须允许为空，避免历史租户和手动输入地址被错误标记为已确认。

## 推荐数据模型

在 `tenants` 表补充以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `address` | `text` | 公司真实办公地址或门店地址，已存在 |
| `address_title` | `text` | 腾讯 POI 名称或用户确认的地址标题 |
| `address_poi_id` | `text` | 腾讯 POI ID，可为空 |
| `address_province` | `text` | 省 |
| `address_city` | `text` | 市 |
| `address_district` | `text` | 区县 |
| `address_adcode` | `text` | 行政区划代码 |
| `address_latitude` | `numeric(10, 7)` | 纬度 |
| `address_longitude` | `numeric(10, 7)` | 经度 |
| `address_source` | `text` | `manual` / `tencent_suggestion` / `tencent_geocoder` / `map_picker` |
| `address_confidence` | `numeric(5, 4)` | 可信度，0 到 1，可为空 |
| `address_confirmed_at` | `timestamptz` | 用户确认地址和坐标的时间 |

建议约束：

- `address_confidence IS NULL OR address_confidence BETWEEN 0 AND 1`
- `address_source` 限定枚举值。
- 经纬度不强制非空。

## 阶段 1：数据字段与后端契约

### 目标

为租户公司地址标准化和经纬度保存补齐数据库与 API 契约，不改 admin 交互。

### 后端改动

1. 新增 migration，给 `tenants` 增加推荐数据模型中的字段。
2. 更新 Supabase 类型。
3. 更新 `PlatformTenantRecord` 类型。
4. 更新平台租户 create/update schema。
5. 平台租户 list/detail 返回新增字段。
6. 租户更新时允许保存地址元数据。

### 验收标准

1. 开发库执行 migration 后，`tenants` 新字段存在。
2. `GET /platform/tenants` 返回地址元数据字段。
3. `GET /platform/tenants/:id` 返回地址元数据字段。
4. `PATCH /platform/tenants/:id` 可保存 `address_latitude/address_longitude/address_source/address_confirmed_at`。
5. `bun run api:check` 通过。
6. `pnpm --dir apps/admin check` 通过。

## 阶段 2：后端代理腾讯地点搜索

### 目标

提供 admin 可用的地址搜索候选接口，前端不暴露腾讯 WebService SK。

### 推荐接口

```http
GET /platform/location/address-suggestions?keyword=固始晴天装饰&region=信阳市
```

仅平台超管可用。

### 返回示例

```json
{
  "list": [
    {
      "id": "tencent-poi-id",
      "title": "固始晴天装饰工程有限公司",
      "address": "河南省信阳市固始县xxx路xxx号",
      "province": "河南省",
      "city": "信阳市",
      "district": "固始县",
      "adcode": "411525",
      "latitude": 32.1680000,
      "longitude": 115.6540000,
      "source": "tencent_suggestion",
      "confidence": 1
    }
  ]
}
```

### 实现口径

1. 在 `tencentLbsService` 中新增 `suggestAddress()`。
2. 使用腾讯 WebService `place/v1/suggestion` 或地点搜索能力。
3. 请求参数至少包含：
   - `keyword`
   - `region`
   - `region_fix=0/1`，按业务决定是否允许扩展区域。
   - `page_size`，建议限制 10。
4. 后端统一做签名、超时、错误转换和返回字段归一化。
5. 接口限流或至少要求 keyword 长度大于等于 2。

### 验收标准

1. 未配置 WebService Key 时返回清晰错误。
2. 已配置 Key/SK 时，输入关键词能返回候选。
3. 返回候选包含地址、行政区划和经纬度。
4. 接口不返回腾讯 Key/SK。
5. 非平台超管访问返回 403。
6. `bun run api:check` 通过。

## 阶段 3：admin 地址搜索选择控件

### 目标

把平台租户编辑弹窗中的公司地址输入升级为“搜索选择 + 自动回填地址元数据”。

### 交互设计

1. 地址输入框支持输入关键词。
2. 输入 300ms debounce 后请求 `/platform/location/address-suggestions`。
3. 下拉展示：
   - POI 标题
   - 详细地址
   - 省/市/区县
4. 用户选中候选后自动填入：
   - `address`
   - `address_title`
   - `address_poi_id`
   - `address_province`
   - `address_city`
   - `address_district`
   - `address_adcode`
   - `address_latitude`
   - `address_longitude`
   - `address_source=tencent_suggestion`
   - `address_confidence=1`
   - `address_confirmed_at=当前时间`
5. 用户手动修改地址文本后：
   - 保留地址文本。
   - 清空或降级坐标确认状态。
   - `address_source=manual`
   - `address_confirmed_at=null`

### UI 约束

- 不在弹窗里放复杂大地图。
- 使用现有 shadcn/Radix/Tailwind 组件风格。
- 地址候选为空时显示“未找到匹配地址”。
- 腾讯 LBS 未配置时，地址输入仍可手动填写。
- 保存按钮不因地址无经纬度而禁用。

### 验收标准

1. 新建租户时可搜索并选中地址。
2. 编辑租户时可搜索并替换地址。
3. 选中候选后，保存请求包含地址元数据。
4. 手动输入地址时，不保存旧坐标为已确认状态。
5. 地址为空时仍可保存租户。
6. `pnpm --dir apps/admin check` 通过。

## 阶段 4：地图预览与拖拽微调

### 目标

在搜索选择基础上，给平台超管提供地图位置确认能力，解决搜索候选坐标不够精确的问题。

### 推荐交互

1. 地址已选中且有经纬度后，在输入框下方显示小地图预览。
2. 点击“调整位置”打开地图选点弹窗。
3. 地图弹窗显示 marker。
4. 支持拖拽 marker 或点击地图更新坐标。
5. 点击确认后：
   - 更新经纬度。
   - `address_source=map_picker`
   - `address_confirmed_at=当前时间`

### 技术选择

推荐新增专门的 admin Web 地图 Key：

```text
TENCENT_LBS_WEB_JS_KEY
```

要求：

- 只用于浏览器端腾讯 JavaScript API GL 或地图选点组件。
- 配置 Referer 白名单。
- 不使用 WebService SK。
- 不复用小程序 Key，避免权限边界混乱。

### 验收标准

1. 有经纬度的租户详情/编辑弹窗能显示地图预览。
2. 超管可以调整 marker 后保存新坐标。
3. 保存后租户详情展示新的经纬度。
4. 浏览器端不出现 WebService SK。
5. 未配置 Web JS Key 时，搜索选择功能不受影响，只隐藏地图预览。

## 阶段 5：数据治理与批量补全

### 目标

对历史租户地址进行标准化治理，提升本地服务商推荐质量。

### 任务

1. 增加租户地址完整度统计：
   - 已填地址数量。
   - 已确认坐标数量。
   - 地址有文本但无坐标数量。
2. 增加只读检查脚本：
   - 列出 active 租户地址缺失情况。
   - 列出地址有文本但无经纬度的租户。
3. 增加可选 backfill 脚本：
   - 对 `address` 有值但无坐标的租户调用腾讯 geocoder。
   - 置信度不足时只写 `partial` 状态，不自动确认。
4. admin 平台租户列表增加地址状态筛选。

### 验收标准

1. 可以统计 active 租户地址/坐标覆盖率。
2. backfill 支持 dry-run。
3. backfill 不覆盖人工已确认坐标。
4. 地址低置信度结果不会被标记为 confirmed。
5. 生产执行前有 dry-run 报告。

## 分阶段排期建议

| 阶段 | 优先级 | 预估复杂度 | 是否阻塞小程序展示地址 |
| --- | --- | --- | --- |
| 阶段 1：字段与契约 | P0 | 中 | 不阻塞，但为后续经纬度必需 |
| 阶段 2：后端搜索代理 | P0 | 中 | 不阻塞 |
| 阶段 3：admin 搜索选择 | P0 | 中 | 不阻塞，但提升地址数据质量 |
| 阶段 4：地图预览微调 | P1 | 中高 | 不阻塞 |
| 阶段 5：数据治理 | P1 | 中 | 不阻塞 |

建议先执行阶段 1 到阶段 3。完成后即可让平台超管用搜索方式维护租户真实地址和经纬度。阶段 4 和阶段 5 作为质量增强继续推进。

## 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| WebService SK 暴露到浏览器 | 所有 WebService 请求由后端代理 |
| 腾讯接口超限 | debounce、keyword 最小长度、page_size 限制、必要时加缓存 |
| 搜索候选不准确 | 允许人工选择和后续地图微调 |
| 手动修改地址后旧坐标残留 | 手动修改时降级 `address_source=manual` 并清空确认时间 |
| 历史地址没有坐标 | 阶段 5 通过 dry-run backfill 逐步补齐 |
| 坐标体系混乱 | 统一记录腾讯返回坐标，并在距离计算/地图展示中保持同一口径 |

## 参考资料

- 腾讯位置服务 WebService 地点搜索：`https://lbs.qq.com/service/webService/webServiceGuide/search/webServiceSearch`
- 腾讯位置服务关键词输入提示：`https://lbs.qq.com/service/webService/webServiceGuide/webServiceSuggestion`
- 腾讯位置服务地址解析：`https://lbs.qq.com/service/webService/webServiceGuide/webServiceGeocoder`
- 腾讯位置服务 JavaScript API GL：`https://lbs.qq.com/webApi/javascriptGL/glGuide/glOverview`

## 执行记录 2026-06-06

已按阶段落地到当前开发分支。

### 阶段 1：字段与契约

已完成：

- 新增 migration：`20260606113000_add_tenant_address_location_metadata.sql`。
- `tenants` 已补充地址标题、POI、行政区划、经纬度、来源、置信度和确认时间字段。
- 平台租户 create/update schema 已支持地址元数据。
- 平台租户 list/detail 继续返回 `select("*")`，包含新增字段。
- admin 租户详情基础信息展示地址标题、行政区划、adcode、坐标、来源和确认时间。

开发库状态：

- `20260606113000` 已推送到当前开发 Supabase。
- 只读 select smoke 通过，确认新字段可查询。

### 阶段 2：后端代理腾讯地点搜索

已完成：

- 新增 `GET /platform/location/address-suggestions`。
- 仅平台超管可访问。
- 后端通过腾讯 WebService Key/SK 代理 `place/v1/suggestion`。
- 返回候选已归一化为 `title/address/province/city/district/adcode/latitude/longitude/source/confidence`。
- 未向浏览器暴露 WebService SK。

开发库 smoke：

- 腾讯 WebService 配置测试通过：`status=0`。
- 使用 `固始晴天装饰` + `信阳市` 搜索返回 1 条候选。

### 阶段 3：admin 地址搜索选择

已完成：

- 平台租户新建/编辑弹窗地址输入升级为搜索选择控件。
- 输入 300ms debounce 后请求后端地址候选接口。
- 选中候选后自动写入地址、POI、行政区划、经纬度、来源和确认时间。
- 手动修改地址时清空旧坐标/POI 元数据，标记为 `manual`。
- 清空地址时同步清空地址元数据。

### 阶段 4：地图预览与微调

已完成轻量版：

- 新增系统配置项：`TENCENT_LBS_WEB_JS_KEY`。
- 新增 `GET /platform/location/map-config`，仅平台超管可访问。
- 地址已有经纬度时，admin 地址控件显示坐标状态。
- 配置 Web JS Key 后，可打开地图弹窗，点击地图更新坐标并保存为 `address_source=map_picker`。
- 未配置 Web JS Key 时隐藏地图能力，不影响地址搜索选择。

注意：

- 当前实现采用“点击地图更新 marker”作为第一版微调方式。
- 拖拽 marker 可在确认腾讯 JavaScript API GL marker drag API 后继续增强。

### 阶段 5：数据治理

已完成最小治理能力：

- 新增只读脚本：`apps/api/src/scripts/tenant-address-coverage-check.ts`。
- 新增命令：`bun run api:tenant-address-coverage -- --limit 20`。
- 输出 active 租户地址覆盖率、坐标覆盖率、确认率和问题明细。

开发库结果：

```json
{
  "tenant_total": 2,
  "active_tenant_total": 2,
  "active_with_address": 0,
  "active_with_coordinate": 0,
  "active_confirmed": 0,
  "active_manual_address": 0
}
```

当前开发库 2 个 active 租户都缺少公司地址，需要通过 admin 新地址搜索控件维护真实地址。

### 验证命令

已通过：

```text
bun run api:check
pnpm --dir apps/admin check
bun run api:tenant-address-coverage -- --limit 20
git diff --check
```
