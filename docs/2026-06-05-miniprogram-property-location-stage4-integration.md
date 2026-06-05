# 小程序阶段 4 对接：项目/房产位置标准化

日期：2026-06-05

## 背景

阶段 4 已把项目位置统一收口到房产模型：

- 项目通过 `property_id` 关联房产。
- 房产承载小区、楼栋、行政区、adcode、经纬度和位置状态。
- 后端在新建/编辑房产时会尝试调用腾讯位置服务地址解析。
- 经纬度不交给用户直接填写。

小程序侧本阶段只需要消费后端返回字段和调整展示/兜底逻辑，不需要自行写入经纬度。

## 相关接口

### 1. 客户首页/项目列表

接口以当前小程序已有项目列表/首页 bootstrap 为准。项目对象如包含 `property`，需要按本文字段处理。

小程序需要兼容：

```json
{
  "id": "project-id",
  "name": "项目名称",
  "address": "旧项目地址，可为空",
  "property_id": "property-id",
  "property": {
    "id": "property-id",
    "community": "固始县蓼都廉租房",
    "building_info": "4单元201",
    "province": "河南省",
    "city": "信阳市",
    "district": "固始县",
    "adcode": "411525",
    "latitude": 32.190278,
    "longitude": 115.697316,
    "location_status": "geocoded"
  }
}
```

### 2. 项目详情

项目详情聚合接口返回的 `property` 也包含同一批位置字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `property.id` | string | 房产 ID |
| `property.community` | string/null | 小区/社区 |
| `property.building_info` | string/null | 楼栋门牌 |
| `property.province` | string/null | 省 |
| `property.city` | string/null | 市 |
| `property.district` | string/null | 区县 |
| `property.adcode` | string/null | 腾讯行政区划代码 |
| `property.latitude` | number/null | 纬度 |
| `property.longitude` | number/null | 经度 |
| `property.location_status` | string/null | 位置标准化状态 |

旧字段 `project.address` 仍可能存在，但展示优先级应低于 `property`。

### 3. 客户房产创建/编辑

小程序如已有客户房产创建/编辑入口，请继续提交业务地址字段：

```json
{
  "community": "小区名称",
  "building_info": "楼栋门牌",
  "area": 120,
  "layout": "三室两厅"
}
```

不要提交：

- `latitude`
- `longitude`
- `adcode`
- `location_status`
- `location_source`
- `location_confidence`
- `location_confirmed_at`

这些字段由后端自动地理编码或后台人工确认维护。

## 展示规则

### 房产地址展示

优先展示：

```text
property.community + property.building_info
```

如果 `property` 为空，再展示：

```text
project.address
```

如果都为空，展示“地址待补全”。

### 行政区展示

当 `province/city/district` 任一存在时，可展示：

```text
河南省 / 信阳市 / 固始县
```

没有行政区时不展示空字段。

### 位置状态

| `location_status` | 展示文案 | 小程序处理 |
| --- | --- | --- |
| `confirmed` | 位置已确认 | 可正常展示地图入口 |
| `geocoded` | 位置已解析 | 可展示地图入口，必要时标注“自动解析” |
| `partial` | 位置待确认 | 不要强依赖经纬度，提示地址待确认 |
| `pending` / null | 位置待补全 | 不展示地图导航入口，提示补充地址 |

地图入口启用条件：

```ts
Boolean(property?.latitude && property?.longitude)
```

如果缺少经纬度，不调用地图导航。

## 交互要求

1. 用户不能直接填写经纬度。
2. 用户可以编辑小区、楼栋门牌、面积、户型。
3. 房产地址变更后，小程序提交业务字段即可，后端会尝试重新解析。
4. 如果后端返回 `location_status=confirmed`，小程序不要提示用户重新定位该房产。
5. 如果位置待补全，引导用户补充更准确的小区/楼栋门牌，不要要求用户输入坐标。

## 兼容策略

- 老项目可能只有 `project.address`，没有 `property`。
- 新项目应优先读取 `property`。
- `property_id` 为空时，不要阻断页面渲染。
- `location_status` 为空时按 `pending` 处理。
- 经纬度为 `0` 或非数字时按无效处理。

## 复测清单

1. 项目详情有 `property` 且 `location_status=geocoded`：
   - 展示小区/楼栋。
   - 展示行政区。
   - 有经纬度时地图入口可用。
2. 项目详情有 `property` 但缺经纬度：
   - 展示“位置待补全/待确认”。
   - 不展示地图导航入口。
3. 项目详情没有 `property` 但有 `address`：
   - 回退展示 `project.address`。
   - 不调用地图导航。
4. 创建/编辑客户房产：
   - 只提交小区、楼栋、面积、户型。
   - 不提交经纬度和位置状态字段。
5. 后端自动解析失败：
   - 页面不报错。
   - 展示房产业务地址和待补全状态。

## 后端验收现状

开发库当前房产位置覆盖率：

| 指标 | 数量 |
| --- | ---: |
| 房产总数 | 5 |
| 房产有城市 | 4 |
| 房产有 adcode | 4 |
| 房产有经纬度 | 4 |

剩余 1 条为测试/异常地址：`状态机回归小区20169123`，保留后台人工处理。

## 小程序回写要求

小程序复测完成后，请在本文档追加：

- 复测日期。
- 复测接口。
- 页面路径。
- 通过项。
- 未通过项和截图/日志。
- 是否需要后端继续调整。

## 小程序对接回写（2026-06-05）

复测日期：2026-06-05

小程序仓库：`/Users/leefo/Public/work/orange`

复测接口：

- 客户首页/项目列表 bootstrap：消费项目对象 `property`。
- 项目详情聚合接口：消费项目对象 `property`。
- 创建/编辑房产接口：继续提交小区、楼栋门牌、面积、户型等业务字段，不提交经纬度和位置状态。

页面路径：

- 客户侧首页：`/packageCustomerPortal/pages/customer-home/index`
- 客户侧项目详情：`/packageCustomerPortal/pages/customer-project-detail/index`
- 员工侧项目详情：`/packageProjects/pages/detail/index`
- 项目创建内联主房产：`/packageProjects/pages/index/index`
- 项目创建新增房产：`/packageProjects/pages/propertyEdit/index`
- 客户房产新增/编辑：`/packageCustomers/pages/customerPropertyEdit/index`

已完成对接：

- 项目 `property` 类型补齐 `province`、`city`、`district`、`adcode`、`location_status`。
- 客户/员工项目 normalizer 已透传房产标准化位置字段。
- 房产地址展示改为优先 `property.community + property.building_info`，再回退 `project.address`，最后展示“地址待补全”。
- 行政区展示使用 `province / city / district`，没有行政区时不展示空字段。
- 位置状态展示兼容 `confirmed`、`geocoded`、`partial`、`pending/null`。
- 地图入口只在房产经纬度有效且非 0 时启用；缺少经纬度时不调用地图导航。
- 客户侧项目详情抽屉增加房产位置卡片，展示业务地址、行政区和位置状态。
- 员工侧项目详情抽屉补充行政区和位置状态。
- 项目创建内联主房产、项目新增房产、客户房产新增/编辑均已去掉 `latitude`、`longitude` 提交。
- 房产 schema 将标准化位置字段改为后端维护的可选返回字段，避免前端创建时被迫提交坐标。

验证命令：

- `pnpm run check:file-size src/schema/properties.ts src/types/api/customer_detail.d.ts src/types/tables/project.ts src/utils/project.ts src/utils/project_location.ts src/services/projects/normalizers/customer.ts src/services/projects/normalizers/core.ts src/services/projects/types/status.ts src/packageProjects/pages/index/actions.ts src/packageProjects/pages/propertyEdit/index.tsx src/packageCustomers/pages/customerPropertyEdit/index.tsx src/packageProjects/pages/detail/hooks/useProjectNavigationActions.ts src/packageProjects/pages/detail/sections/ProjectDrawer.tsx src/packageProjects/pages/detail/styles/_drawer.scss src/packageCustomerPortal/pages/customer-project-detail/components/CustomerProjectMenuDrawer.tsx src/packageCustomerPortal/pages/customer-project-detail/components/CustomerProjectDetailContent.tsx src/packageCustomerPortal/pages/customer-project-detail/_index-part1.scss`：通过。
- `pnpm run typecheck`：通过。
- `pnpm run build:weapp:dev`：通过，Webpack 编译耗时约 14.79s，开发 API 为 `http://192.168.1.5:3000`。

复测清单结果：

| # | 用例 | 结果 | 说明 |
| --- | --- | --- | --- |
| 1 | 项目详情有 `property` 且 `location_status=geocoded` | 通过（代码核验） | 项目详情已消费 `property`，展示小区/楼栋、行政区和位置状态；有效经纬度时可打开地图。 |
| 2 | 项目详情有 `property` 但缺经纬度 | 通过（代码核验） | 经纬度缺失、为 0 或非数字时不调用地图导航；展示业务地址和待补全/待确认状态。 |
| 3 | 项目详情没有 `property` 但有 `address` | 通过（代码核验） | 地址展示回退到 `project.address`；没有房产经纬度时不调用地图导航。 |
| 4 | 创建/编辑客户房产 | 通过（代码核验） | 客户房产新增/编辑和项目创建相关入口均只提交业务字段，不提交经纬度和位置状态字段。 |
| 5 | 后端自动解析失败 | 待真实接口复测 | 前端已兼容 `partial`、`pending/null` 和缺经纬度场景；仍需用后端解析失败样例在模拟器确认接口响应和页面文案。 |

未通过项和截图/日志：

- 暂无代码核验未通过项。
- 用例 5 需要后端提供或保留解析失败样例后做模拟器复测。

是否需要后端继续调整：

- 暂不需要后端调整字段契约。
- 如果模拟器复测发现 `property` 未随项目详情/列表返回，或 `location_status` 枚举不一致，再由后端补充接口返回。

## 后端对接补充（2026-06-05）

小程序回写后，后端补充核验了客户侧真实接口：

- `GET /customer/projects?page=1&pageSize=5`
- `GET /customer/bootstrap?page=1&pageSize=20&include=home_summary&projects_mode=inline`
- `GET /customer/projects/:id/detail-bootstrap`

发现并修复：

- 客户项目列表/详情已返回 `property`，但顶层 `property_id` 需要显式返回。
- 首页 inline 使用的 `list_customer_home_projects` RPC 需要同步返回完整房产位置字段。

后端处理：

- 新增 migration：
  `20260605043000_refresh_customer_home_projects_property_location.sql`
- 更新 `list_customer_home_projects` 返回：
  - 顶层 `property_id`
  - `property.province`
  - `property.city`
  - `property.district`
  - `property.adcode`
  - `property.latitude`
  - `property.longitude`
  - `property.location_status`
  - `property.location_source`
  - `property.location_confidence`
  - `property.location_confirmed_at`
- 客户项目列表和详情序列化补充顶层 `property_id`。

开发库 smoke 结果：

| 接口 | 结果 |
| --- | --- |
| `GET /customer/projects?page=1&pageSize=5` | 通过，返回顶层 `property_id` 和 `property` 位置字段 |
| `GET /customer/bootstrap?...projects_mode=inline` | 通过，返回顶层 `property_id` 和 `property` 位置字段 |
| `GET /customer/projects/:id/detail-bootstrap` | 通过，返回顶层 `property_id` 和 `property` 位置字段 |

可用于小程序用例 5 的失败样例：

- 房产：`状态机回归小区20169123`
- 当前状态：缺少城市、adcode、经纬度
- 预期小程序表现：
  - 展示业务地址。
  - 展示“位置待补全/待确认”。
  - 不展示地图导航入口。
  - 不调用地图导航。
