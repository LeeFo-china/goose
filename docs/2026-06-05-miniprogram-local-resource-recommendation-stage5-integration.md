# 小程序阶段 5 对接：本地装修公司推荐 MVP

更新时间：2026-06-05

本阶段先收口“本地装修公司推荐”，后续再扩展到设计师、工程负责人、案例和营销活动。小程序端不要直接改本仓库代码，本文件作为对接契约。

## 阶段目标

- 一个服务区域可以有多家装修公司。
- 用户定位或手动选择区域后，后端返回本地候选装修公司列表。
- 多候选时必须让用户选择，选择结果通过 confirm 写入定位上下文。
- 已绑定客户/员工身份优先，不被 GPS 或手动区域切换租户。
- 无服务区域时展示明确兜底，不进入空白首页。

## 后端接口

继续使用阶段 2/3 已接入的接口：

| 接口 | 用途 |
| --- | --- |
| `GET /customer/location/options` | 获取定位开关、小程序 LBS Key 和已开通服务区域 |
| `POST /customer/location-bootstrap` | 提交定位/手动区域，返回候选装修公司 |
| `POST /customer/location-bootstrap/confirm` | 用户确认候选装修公司 |

本阶段不新增小程序接口。

## 匹配和排序规则

后端按以下顺序生成候选：

1. 已绑定身份：`match_reason=identity`，最高优先级。
2. 腾讯行政区划代码精确匹配：`match_reason=adcode`。
3. 区县匹配：`match_reason=district`。
4. 城市匹配：`match_reason=city`。
5. 省份兜底：`match_reason=province`。
6. 距离范围：`match_reason=distance`。

同一租户如果命中多个服务区域，只返回该租户排序最高的一条候选。最终排序字段为：

```text
match_rank DESC, priority DESC, distance_km ASC, tenant_name ASC
```

小程序端必须使用后端返回顺序展示，不要自行重排。

## 字段补充

`matched_tenants[]` 新增或明确以下字段：

| 字段 | 说明 |
| --- | --- |
| `tenant_id` | 装修公司租户 ID |
| `tenant_name` | 装修公司名称 |
| `tenant_slug` | 装修公司 slug |
| `service_area_id` | 命中的服务区域 ID，身份命中时为 `null` |
| `province` / `city` / `district` | 命中的服务区域 |
| `adcode` | 命中的服务区域行政区划代码 |
| `match_reason` | 匹配原因 |
| `match_rank` | 后端匹配强度排序值，仅用于展示调试或埋点 |
| `distance_km` | 距离，无法计算时为 `null` |
| `priority` | admin 配置的服务区域优先级 |

## 小程序处理规则

| 场景 | 后端返回 | 小程序处理 |
| --- | --- | --- |
| 单装修公司 | `matched_tenants.length=1` 且 `requires_user_confirmation=false` | 直接进入推荐租户上下文 |
| 多装修公司 | `matched_tenants.length>1` 且 `requires_user_confirmation=true` | 展示候选装修公司列表，用户选择后调用 confirm |
| 已绑定身份 | 首个候选 `match_reason=identity` | 直接使用身份绑定租户，不允许定位切换 |
| 无服务区域 | `matched_tenants=[]` 或 `fallback_reason=NO_SERVICE_AREA_MATCHED` | 展示暂无服务或联系客服兜底 |
| 定位开关关闭 | `location_match_enabled=false` | 跳过定位匹配，走现有兜底 |

候选列表建议展示：

- 装修公司名称。
- 服务区域：省/市/区县。
- 匹配原因：优先展示业务文案，不直接暴露技术字段。
- 距离：`distance_km` 非空时展示。

## Admin 配置规则

超管后台的租户详情页“服务区域”支持同一区域配置多家装修公司：

- 不限制同一个 `adcode` 只能属于一家租户。
- `priority` 用于控制同一匹配强度下的推荐顺序。
- `status=inactive` 的服务区域不会参与匹配。
- 省/市/区县通过行政区划下拉搜索选择，`adcode` 会随选择回填。

## 开发库验收记录

开发库已准备固始县同一区域 2 家 active 装修公司：

| 装修公司 | adcode | priority |
| --- | --- | ---: |
| 固始晴天装饰工程有限公司 | `411525` | 100 |
| 默认装修公司 | `411525` | 80 |

后端 smoke 结果：

| 用例 | 结果 |
| --- | --- |
| 未绑定新用户提交固始县 `adcode=411525` | 返回 2 个候选，均为 `match_reason=adcode`，`requires_user_confirmation=true` |
| 未绑定新用户只提交城市 `信阳市` | 返回 2 个候选，均为 `match_reason=city`，`requires_user_confirmation=true` |
| 未绑定新用户提交深圳市南山区 | 返回 `matched_tenants=[]` 和 `fallback_reason=NO_SERVICE_AREA_MATCHED` |
| 多候选 confirm 选择第二家装修公司 | 返回 `selected_tenant_id=5f9404fd-23a7-4686-a606-b2627a65611d`，`confirmed_at` 已写入 |
| 已绑定客户身份提交固始县 | 首个候选为 `match_reason=identity`，不要求用户确认 |

## 小程序回写要求

小程序团队完成后，请回写以下内容：

1. 多装修公司列表是否按后端顺序展示。
2. 选择第二家装修公司后 confirm 是否成功。
3. 城市兜底候选是否展示正常。
4. 无服务区域是否展示兜底页。
5. 已绑定身份用户是否不会被定位切换租户。
6. `match_rank` 是否只用于调试或埋点，没有参与前端重排。
