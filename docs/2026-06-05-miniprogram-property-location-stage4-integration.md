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
