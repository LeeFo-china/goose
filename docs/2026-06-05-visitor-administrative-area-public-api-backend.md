# Visitor 手动服务区域行政区接口后端对接

更新时间：2026-06-05

来源文档：

```text
/Users/leefo/Public/work/orange/docs/2026-06-05-visitor-administrative-area-public-api-backend.md
```

## 背景

visitor 首页“本地服务”需要允许用户手动选择装修服务区域。用户当前 GPS 所在地不一定等于房屋所在地，所以小程序不能只依赖 GPS，也不能用 `GET /visitor/location/options` 返回的 `open_service_areas` 伪装完整省/市/区县数据。

## 后端实现

新增 public 只读接口：

```http
GET /public/administrative-areas
```

支持查询：

| 参数 | 说明 |
| --- | --- |
| `tree=true` | 返回省/市/区县树 |
| `level=province|city|district` | 按层级查询 |
| `parent_adcode=410000` | 查询指定父级下级行政区 |
| `keyword=固始` | 按名称、完整名称或 adcode 搜索 |

鉴权策略：

- 匿名可读。
- visitor token 可读。
- customer/employee token 可读。
- 不复用 `/platform/administrative-areas` 的平台管理权限语义。

响应结构：

```json
{
  "list": [
    {
      "adcode": "410000",
      "name": "河南省",
      "full_name": "河南省",
      "level": "province",
      "parent_adcode": null,
      "children": []
    }
  ],
  "version": "2026-06-05",
  "expires_in": 86400
}
```

只返回小程序展示和提交需要的字段：

- `adcode`
- `name`
- `level`
- `parent_adcode`
- `full_name`
- `children`

不返回平台管理字段：

- `source`
- `source_version`
- `synced_at`
- `created_at`
- `updated_at`

缓存策略：

- 响应体返回 `expires_in=86400`。
- 响应头返回 `Cache-Control: public, max-age=86400`。
- 小程序可按 `version + expires_in` 做本地缓存。

## 与 visitor bootstrap 的关系

小程序从行政区接口选择房屋所在地后，继续调用：

```http
POST /visitor/location-bootstrap
```

请求示例：

```json
{
  "source": "manual_city",
  "province": "河南省",
  "city": "信阳市",
  "district": "固始县",
  "adcode": "411525"
}
```

后端继续由 visitor bootstrap 负责：

- 写入 visitor 定位上下文。
- 按服务区域匹配装修公司。
- 多候选返回 `requires_user_confirmation=true`。
- 无服务区域返回 `fallback_reason=NO_SERVICE_AREA_MATCHED`，但仍允许 visitor 首页继续展示平台内容。

报价线索派单应使用用户确认的服务区域，不应直接使用手机当前 GPS 所在地。

## 验收清单

| # | 用例 | 预期 |
| --- | --- | --- |
| 1 | 匿名访问完整树 | 返回省/市/区县三级结构 |
| 2 | visitor token 访问 | 可读取行政区数据 |
| 3 | customer/employee token 访问 | 可读取行政区数据，不受身份租户影响 |
| 4 | 查询河南省数据 | 包含河南省、信阳市、固始县 |
| 5 | 查询北京市数据 | 可选择北京市和区县 |
| 6 | 响应字段检查 | 不返回平台管理字段和同步字段 |
| 7 | 手动选择固始县后 bootstrap | 返回固始县服务区域和匹配装修公司 |
| 8 | 手动选择未开通区域后 bootstrap | 返回无服务区域兜底，并保留用户确认区域上下文 |

## 小程序回写要求

小程序对接后请回写：

1. 是否使用 `GET /public/administrative-areas?tree=true` 获取三级行政区树。
2. 是否已从单列 `open_service_areas` 改为省/市/区县三级 Picker。
3. 是否提交 `province`、`city`、`district`、`adcode` 到 visitor bootstrap。
4. 行政区接口失败时是否展示异常提示，而不是伪装完整地理数据。
5. 固始县和未开通区域两个手动选择场景是否通过。

## 后端完成记录（2026-06-05）

已完成：

- 新增 `GET /public/administrative-areas`。
- 复用 `AdministrativeAreaListQuerySchema` 查询参数。
- 平台管理接口 `/platform/administrative-areas` 保持原权限和原字段。
- public 接口只返回小程序需要的安全字段。
- public 接口支持匿名访问。
- visitor token 带 Authorization 访问已放行。
- 响应头已返回 `Cache-Control: public, max-age=86400`。
- 响应体已返回 `version` 和 `expires_in=86400`。
- repository 已改为分批读取，避免完整树受 Supabase REST 默认返回上限影响。

开发库 smoke：

| 用例 | 结果 |
| --- | --- |
| 匿名访问 `GET /public/administrative-areas?tree=true` | 通过，返回 34 个省级根节点 |
| 完整树包含河南省/信阳市/固始县 | 通过 |
| 懒加载 `parent_adcode=410000` | 通过，返回河南省下 18 个城市，包含信阳市 |
| 搜索朝阳区 | 通过，能查到北京市朝阳区 |
| 字段泄漏检查 | 通过，不返回 `source`、`source_version`、`synced_at`、`created_at`、`updated_at` |
| 缓存头检查 | 通过，`Cache-Control: public, max-age=86400` |
| visitor token 访问懒加载接口 | 通过 |
| 手动选择固始县后 visitor bootstrap | 通过，返回 2 家装修公司，`selection_status=pending` |
