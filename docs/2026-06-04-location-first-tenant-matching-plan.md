# 小程序登录后定位与本地装修公司匹配分阶段方案

日期：2026-06-04

## 背景

当前业务希望用户登录后的第一件事是定位，从而判断用户所在城市/区县，
匹配当地装修公司、客服、设计师、项目资源和营销内容。

生产数据库现状：

- `employees` 表没有地理位置字段。
- `customers` 表本身没有地址/经纬度字段。
- `projects` 表有 `address` 字段，生产库 27 个项目都有地址。
- `properties` 表有 `latitude`、`longitude`、`community`、`building_info`，
  是当前最接近标准地理位置的数据源。
- 项目可通过 `projects.property_id -> properties.id` 获取房产经纬度。
- 客户可通过 `properties.customer_id -> customers.id` 间接关联部分房产位置。

因此，本方案不建议把 GPS 定位直接写死成用户归属，而是把定位作为
“区域上下文”和“默认匹配依据”，最终租户归属仍通过用户确认、已有身份、
客户档案、员工身份和项目关系共同确定。

## 腾讯 LBS 接入依据

腾讯位置服务微信小程序 JavaScript SDK 支持小程序调用 POI 检索、关键词输入提示、
地址解析、逆地址解析、行政区划和距离计算等能力。

接入前置条件：

1. 在腾讯位置服务控制台申请开发者密钥 key。
2. 给 key 开通 WebServiceAPI 服务。
3. 下载微信小程序 JavaScript SDK。
4. 在微信小程序管理后台配置 request 合法域名：
   `https://apis.map.qq.com`。
5. 小程序引入 `QQMapWX` 并用 key 初始化。

本方案核心使用能力：

- `wx.getLocation`：获取用户授权后的经纬度。
- `reverseGeocoder`：把经纬度转换为省/市/区县、地址和 POI 信息。
- `geocoder`：把用户手动输入的小区/地址转换为经纬度。
- `getCityList` / `getDistrictByCityId`：提供城市和区县选择兜底。
- `calculateDistance`：计算用户位置到装修公司服务网点、项目或资源点的距离。

## 设计原则

1. 定位只做推荐，不直接决定权限。
2. 数据隔离仍以 `tenant_id` 为准。
3. 用户拒绝定位时必须支持手动选择城市/区县。
4. 已有客户/员工身份优先于当前位置。
5. 同一城市多个装修公司命中时必须让用户选择或确认。
6. 经纬度属于敏感个人信息，保存前要明确用途，并尽量降低精度或设置过期时间。
7. 腾讯 LBS key 不能放在后端日志里；小程序 key 需要限制 AppID、域名和服务权限。

## 目标架构

### 数据模型

新增平台服务区域表：

```sql
tenant_service_areas
```

建议字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `tenant_id` | 装修公司租户 |
| `province` | 省 |
| `city` | 市 |
| `district` | 区县，可为空 |
| `adcode` | 腾讯逆地址解析返回的行政区划代码 |
| `center_latitude` | 服务中心纬度 |
| `center_longitude` | 服务中心经度 |
| `service_radius_km` | 服务半径 |
| `priority` | 同区域多个租户的排序权重 |
| `status` | `active` / `inactive` |
| `created_at` / `updated_at` | 时间戳 |

新增用户定位上下文表：

```sql
user_location_contexts
```

建议字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `auth_user_id` | 登录用户 |
| `tenant_id` | 用户确认后的租户，可为空 |
| `source` | `gps` / `manual_city` / `manual_address` |
| `province` / `city` / `district` | 行政区 |
| `adcode` | 行政区划代码 |
| `latitude` / `longitude` | 原始坐标，按隐私策略决定是否保存 |
| `accuracy` | 小程序定位精度 |
| `matched_tenant_ids` | 候选装修公司列表 |
| `selected_tenant_id` | 用户最终选择 |
| `expires_at` | 定位上下文过期时间 |

现有房产表增强：

- 保留 `properties.latitude` / `properties.longitude` 作为项目和客户的稳定地理位置。
- 新增或规范 `province` / `city` / `district` / `adcode` 可提升匹配效率。
- 后续创建房产或项目时，使用腾讯 `geocoder` 对地址补坐标。

### 后端接口

新增小程序定位启动接口：

```http
POST /customer/location-bootstrap
```

请求：

```json
{
  "source": "gps",
  "latitude": 31.2304,
  "longitude": 121.4737,
  "accuracy": 65,
  "province": "上海市",
  "city": "上海市",
  "district": "浦东新区",
  "adcode": "310115"
}
```

响应：

```json
{
  "location": {
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "adcode": "310115"
  },
  "identity": {
    "has_customer_profile": true,
    "has_employee_profile": false,
    "bound_tenant_id": "..."
  },
  "matched_tenants": [
    {
      "tenant_id": "...",
      "tenant_name": "某某装饰",
      "match_reason": "district",
      "distance_km": 3.2,
      "priority": 100
    }
  ],
  "recommended_tenant_id": "...",
  "requires_user_confirmation": false
}
```

新增用户确认接口：

```http
POST /customer/location-bootstrap/confirm
```

用途：

- 用户从候选装修公司中确认归属。
- 后端写入 `selected_tenant_id`。
- 如果用户没有客户档案，可创建待认领客户档案或引导填写需求。

## 分阶段实施

### 阶段 0：接入准备和安全边界

目标：

- 完成腾讯 LBS 小程序 SDK 使用准备。
- 明确定位授权文案、隐私边界和 key 管控策略。

实现内容：

- 在腾讯位置服务控制台创建小程序专用 key。
- 开通 WebServiceAPI。
- 限制 key 可用服务和小程序 AppID。
- 微信小程序后台添加 request 合法域名 `https://apis.map.qq.com`。
- 在小程序仓库引入 `qqmap-wx-jssdk.js`。
- 后端新增系统配置项：
  - `TENCENT_LBS_KEY`
  - `LOCATION_MATCH_ENABLED`
  - `LOCATION_CONTEXT_TTL_HOURS`
- 确认隐私协议中包含定位用途：
  - 匹配本地装修公司。
  - 推荐本地服务资源。
  - 填写装修地址时辅助补全。

验收标准：

- 小程序开发版能初始化 `QQMapWX`。
- 腾讯 LBS key 不出现在后端日志和代码仓库密钥文件。
- 小程序后台已配置 `https://apis.map.qq.com`。
- 用户拒绝定位时，小程序不会阻塞登录流程。
- 隐私协议/授权弹窗文案通过产品确认。

### 阶段 1：服务区域基础数据

目标：

- 平台具备“哪个装修公司服务哪些城市/区县”的基础能力。

实现内容：

- 新增 `tenant_service_areas` migration。
- admin 超管后台增加服务区域配置入口。
- 支持按租户配置省/市/区县、服务中心坐标、服务半径和优先级。
- 初始化当前生产租户的默认服务区域。
- 给 `properties` 补充可选行政区字段：
  - `province`
  - `city`
  - `district`
  - `adcode`

匹配规则第一版：

1. `adcode` 精确匹配区县。
2. 区县未命中时按城市匹配。
3. 城市多个租户命中时按 `priority` 排序。
4. 有中心坐标时计算距离，超出服务半径的候选降级或剔除。

验收标准：

- 超管可为租户配置至少一个服务区域。
- 后端能按 `city/district/adcode` 返回候选租户。
- 多租户同城时排序稳定。
- 无服务区域配置时返回明确降级状态，不抛 500。
- migration 可在开发库和生产库重复执行且幂等。

### 阶段 2：小程序登录后定位采集

目标：

- 用户登录后第一屏获取定位上下文，定位失败时可手动选择城市。

实现内容：

- 小程序登录成功后调用 `wx.getLocation`。
- 成功后调用腾讯 `reverseGeocoder` 获取省/市/区县/adcode。
- 调用后端 `POST /customer/location-bootstrap`。
- 定位失败或拒绝授权时进入手动城市选择：
  - 可用腾讯 `getCityList` / `getDistrictByCityId`。
  - 或使用后端返回的已开通服务城市列表。
- 小程序本地缓存最近一次城市上下文，设置短 TTL。

前端状态：

| 状态 | 处理 |
| --- | --- |
| 定位成功且单租户命中 | 直接进入首页，顶部显示当前城市/公司 |
| 定位成功但多租户命中 | 展示装修公司选择页 |
| 定位失败/拒绝 | 展示手动城市选择页 |
| 无服务区域命中 | 展示留资/联系客服入口 |

验收标准：

- 新用户登录后会触发定位授权。
- 授权成功时后端收到经纬度和行政区信息。
- 拒绝授权时可手动选择城市，不影响继续使用。
- 小程序不会把腾讯 LBS key 传给后端保存。
- 前端埋点能区分 `gps_success`、`gps_denied`、`manual_city`、`match_empty`。

### 阶段 3：定位匹配租户和身份决策

目标：

- 后端根据定位结果、用户身份和服务区域，返回稳定的租户推荐结果。

实现内容：

- 新增 `location-matching` service：
  - 输入经纬度、城市、区县、adcode。
  - 查询 `tenant_service_areas`。
  - 结合已有客户/员工身份。
  - 返回候选租户、推荐租户和是否需要用户确认。
- 身份优先级：
  1. 员工身份已有租户：直接使用员工租户。
  2. 客户已有进行中项目：使用项目租户。
  3. 客户已有档案且绑定租户：使用客户租户。
  4. 无身份：使用定位匹配推荐租户。
  5. 多租户命中：用户手动确认。
- 写入 `user_location_contexts`，保留匹配过程用于审计和排查。

验收标准：

- 已绑定员工登录不会被当前位置错误切租户。
- 已有客户项目不会因出差定位切到其他装修公司。
- 新用户在服务区域内能得到推荐装修公司。
- 多租户命中时响应 `requires_user_confirmation=true`。
- 无匹配时响应可被前端识别，不返回空白首页。

### 阶段 4：项目/房产位置标准化

目标：

- 把项目、客户和房产的地理位置统一落到房产位置模型上。

实现内容：

- 新建/编辑房产时调用腾讯 `geocoder` 或后端地理编码接口。
- 保存：
  - 小区名 `community`
  - 楼栋房号 `building_info`
  - 经纬度 `latitude/longitude`
  - 行政区 `province/city/district/adcode`
- 项目创建时优先选择或创建 `property`，项目通过 `property_id` 关联位置。
- 老数据补齐：
  - 对 `projects.address` 有值但缺 `property_id` 的记录生成待确认房产。
  - 对 `properties` 缺坐标的数据进行批量地理编码，低置信度进入人工确认。

验收标准：

- 新建项目必须能关联房产位置或明确标记“位置待补全”。
- 项目列表/详情能返回房产经纬度和行政区。
- 生产库中项目经纬度覆盖率有统计报表。
- 批量地理编码不会覆盖人工确认过的位置。

### 阶段 5：本地资源推荐

目标：

- 基于定位和房产位置推荐本地资源，而不仅仅是分配租户。

实现内容：

- 设计师、工程负责人、客服可以配置服务区域或默认租户区域。
- 项目创建/需求提交时，按区域推荐：
  - 本地装修公司。
  - 本地设计师。
  - 本地工程负责人。
  - 本地案例/样板项目。
  - 本地营销活动。
- 对资源推荐增加可解释字段：
  - `match_reason`
  - `distance_km`
  - `service_area`
  - `priority`

验收标准：

- 用户提交需求后能看到本地装修公司/资源推荐。
- 后台能解释为什么推荐某个租户或员工。
- 无本地资源时能降级到城市级或客服兜底。
- 推荐结果不突破员工和客户的 `tenant_id` 权限边界。

### 阶段 6：运营、风控和隐私治理

目标：

- 定位能力可监控、可回滚、可审计。

实现内容：

- 增加定位匹配统计：
  - 授权成功率。
  - 拒绝授权率。
  - 手动城市选择率。
  - 单租户命中率。
  - 多租户命中率。
  - 无服务区域命中率。
- 增加配置开关：
  - `LOCATION_MATCH_ENABLED`
  - `LOCATION_MATCH_REQUIRE_CONFIRMATION`
  - `LOCATION_STORE_RAW_COORDINATE`
- 默认不长期保存用户原始 GPS。
- 如果业务需要保存，设置过期时间和用途说明。
- 对异常定位做风控：
  - 频繁跨城。
  - 坐标为空或精度过低。
  - 坐标与手动城市冲突。

验收标准：

- 超管可关闭定位匹配，前端自动降级为手动城市选择。
- 关键指标可在后台或日志中查看。
- 用户可重新选择城市/装修公司。
- 定位数据过期清理任务可执行。
- 隐私合规检查通过。

## 推荐接口清单

| 接口 | 阶段 | 说明 |
| --- | --- | --- |
| `GET /customer/location/options` | 2 | 返回已开通城市、默认城市和开关 |
| `POST /customer/location-bootstrap` | 2/3 | 定位匹配启动接口 |
| `POST /customer/location-bootstrap/confirm` | 3 | 用户确认装修公司 |
| `GET /admin/tenant-service-areas` | 1 | 超管查看服务区域 |
| `POST /admin/tenant-service-areas` | 1 | 超管新增服务区域 |
| `PATCH /admin/tenant-service-areas/:id` | 1 | 超管编辑服务区域 |
| `POST /admin/properties/geocode` | 4 | 房产地址地理编码 |
| `POST /admin/properties/geocode-batch` | 4 | 老数据批量补坐标 |

## 匹配算法第一版

输入：

- 用户 `auth_user_id`
- 经纬度和精度
- 腾讯逆地址解析结果：`province/city/district/adcode`

输出：

- `recommended_tenant_id`
- `matched_tenants`
- `requires_user_confirmation`
- `fallback_reason`

规则：

1. 查询用户是否有员工身份。
   - 有且只有一个有效员工租户：直接返回员工租户。
2. 查询用户是否有关联客户档案和项目。
   - 有进行中项目：返回项目租户。
   - 有客户档案且只绑定一个租户：返回客户租户。
3. 查询服务区域。
   - 优先 `adcode` 精确匹配。
   - 再按 `district`、`city` 匹配。
   - 如果候选有中心坐标，用距离和服务半径过滤。
4. 候选数量为 1：
   - 返回推荐租户，默认不要求确认。
5. 候选数量大于 1：
   - 按 `priority + 距离` 排序，要求用户确认。
6. 候选为空：
   - 返回无服务区域命中，引导用户留资或联系客服。

## 关键风险

| 风险 | 应对 |
| --- | --- |
| 用户拒绝定位 | 手动选择城市/区县 |
| GPS 漂移或用户出差 | 已有身份优先，定位只做推荐 |
| 多租户同城竞争 | 服务区域优先级 + 用户确认 |
| 腾讯 LBS 配额耗尽 | 缓存逆地址结果，后台监控调用失败率 |
| key 泄露 | 限制 AppID、服务权限和域名，不在日志打印 key |
| 经纬度隐私 | 默认短期保存或只保存行政区，原始坐标可关闭 |
| 老数据地址不规范 | 地理编码结果进入人工确认，不直接覆盖 |

## 建议排期

| 周期 | 交付 |
| --- | --- |
| 第 1 周 | 阶段 0 + 阶段 1，完成 key、服务区域表和后台配置 |
| 第 2 周 | 阶段 2，小程序完成定位、逆地址解析和手动城市兜底 |
| 第 3 周 | 阶段 3，后端完成租户匹配和身份决策 |
| 第 4 周 | 阶段 4，项目/房产位置标准化和老数据补齐 |
| 第 5 周 | 阶段 5，本地资源推荐 |
| 第 6 周 | 阶段 6，运营指标、隐私治理和回滚开关 |

## 第一版 MVP 范围

建议第一版只做：

1. 腾讯 LBS key 和小程序 SDK 接入。
2. 登录后定位 + 逆地址解析。
3. `tenant_service_areas`。
4. `POST /customer/location-bootstrap`。
5. 单租户命中自动进入，多租户命中用户选择。
6. 拒绝定位时手动城市选择。

暂不做：

- 精细到设计师/工程负责人推荐。
- 全量历史地址地理编码。
- 长期保存用户原始 GPS。
- 复杂空间多边形服务范围。

MVP 验收标准：

- 新用户首次登录能完成定位或手动城市选择。
- 后端能返回推荐装修公司。
- 用户确认后进入对应租户上下文。
- 已有客户/员工不会被定位错误切换租户。
- 无服务区域时有明确兜底页。
- 关键链路日志能排查：定位来源、城市、候选租户、最终选择。

## 实施进度

更新时间：2026-06-05

当前进度：

- 阶段 0：后端配置项已补齐，生产腾讯 LBS Key/SK/小程序 Key 已配置。
- 阶段 1：服务区域表、admin 配置入口、行政区划表和行政区划数据同步已完成。
- 阶段 2：已完成。后端定位选项/定位启动接口已完成，小程序定位采集、拒绝定位兜底、手动区域和无服务区域兜底已通过代码核验。
- 阶段 3：已完成。定位上下文落库、用户确认、多装修公司选择、过期上下文处理和已绑定身份保护已通过验收。
- 阶段 4：进行中。已补房产位置治理字段、后端返回字段和覆盖率检查脚本。
- 阶段 5-6：未开始。

已完成后端接口：

| 接口 | 状态 | 说明 |
| --- | --- | --- |
| `GET /customer/location/options` | 已完成 | 返回定位开关、腾讯小程序 Key、已开通服务区域和手动城市兜底能力 |
| `POST /customer/location-bootstrap` | 已完成 | 返回候选装修公司、推荐租户、是否需要用户确认，并写入定位上下文 |
| `POST /customer/location-bootstrap/confirm` | 已完成 | 用户确认候选装修公司后写入 `selected_tenant_id` 和 `confirmed_at` |
| `GET /platform/administrative-areas` | 已完成 | admin 省/市/区县下拉数据源 |
| `GET /platform/tenant-service-areas` | 已完成 | 超管查看服务区域 |
| `POST /platform/tenant-service-areas` | 已完成 | 超管新增服务区域 |
| `PATCH /platform/tenant-service-areas/:id` | 已完成 | 超管编辑服务区域 |

新增数据表：

```sql
user_location_contexts
```

用途：

- 记录本次定位来源、省/市/区县/adcode。
- 记录候选租户快照 `matched_tenants`。
- 记录后端推荐租户 `recommended_tenant_id`。
- 记录用户最终确认租户 `selected_tenant_id`。
- 通过 `expires_at` 控制定位上下文有效期。

隐私策略：

- 默认 `LOCATION_STORE_RAW_COORDINATE=false`。
- 默认不保存用户原始 `latitude` / `longitude` / `accuracy`。
- 如后续业务确实需要保存原始坐标，必须先打开配置并完成隐私说明。

新增系统配置：

| Key | 默认值 | 说明 |
| --- | --- | --- |
| `LOCATION_MATCH_ENABLED` | `true` | 是否启用定位匹配 |
| `LOCATION_CONTEXT_TTL_HOURS` | `24` | 定位上下文有效期 |
| `LOCATION_STORE_RAW_COORDINATE` | `false` | 是否保存原始经纬度 |

后端开发验收结果：

- 开发库 migration 已执行。
- `user_location_contexts` 表已存在。
- 定位配置项已写入开发库。
- `GET /customer/location/options` 本地 smoke 通过。
- `POST /customer/location-bootstrap` 本地 smoke 通过。
- `POST /customer/location-bootstrap/confirm` 本地 smoke 通过。
- bootstrap 后开发库已生成定位上下文，confirm 后已写入 `selected_tenant_id`。
- 默认未保存原始经纬度。
- 小程序侧阶段 2/3 对接已完成代码核验。
- 过期上下文 confirm 后端真实复测通过，返回 `定位上下文不存在或已过期`。
- 已绑定客户身份 token 提交外地 GPS 时，后端仍以 `match_reason=identity` 的身份租户作为推荐租户。

阶段 4 下一步：

已完成：

1. 新增房产位置治理字段：
   - `location_status`
   - `location_source`
   - `location_confidence`
   - `location_confirmed_at`
2. 后端房产 schema、repository、客户房产摘要、项目关联房产返回字段已补齐：
   - `province`
   - `city`
   - `district`
   - `adcode`
   - `latitude`
   - `longitude`
   - `location_status`
3. 新增只读覆盖率脚本：
   `bun run api:property-location-coverage -- --limit 20`
4. 开发库 migration 已执行：
   `20260605033000_add_property_location_governance.sql`

开发库覆盖率基线（2026-06-05）：

| 指标 | 数量 |
| --- | ---: |
| 房产总数 | 5 |
| 房产有城市 | 0 |
| 房产有 adcode | 0 |
| 房产有经纬度 | 0 |
| 房产已确认 | 0 |
| 项目总数 | 7 |
| 项目已关联房产 | 5 |
| 项目有地址但未关联房产 | 0 |

后续步骤：

1. 新建/编辑房产时接入腾讯地理编码，补齐标准位置字段。
2. 设计老数据补齐脚本，按 `community/building_info/address` 地理编码。
3. 低置信度记录进入人工确认，禁止覆盖 `location_status=confirmed` 的记录。
4. admin 项目创建页优先选择或创建 `property_id`，缺位置时明确展示“位置待补全”。

## 参考资料

- 腾讯位置服务微信小程序 JavaScript SDK：
  https://lbs.qq.com/miniProgram/jsSdk/jsSdkGuide/jsSdkOverview
