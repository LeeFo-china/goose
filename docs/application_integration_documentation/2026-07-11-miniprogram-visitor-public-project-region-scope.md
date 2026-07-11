# 小程序访客公开项目区域过滤交接

日期：2026-07-11

## 后端契约

```http
GET /front/projects?page=1&pageSize=20
Authorization: Bearer <visitor/customer/employee token>
```

请求参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | number | `1` | 必须为大于 0 的整数 |
| `pageSize` | number | `20` | 必须为 1 到 100 的整数 |

响应：

```json
{
  "data": {
    "list": [
      {
        "id": "project-id",
        "tenant_id": "tenant-id"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

范围规则：

- 小程序不要传 `tenant_ids`、`adcode`、城市、区县或项目地址过滤参数。
- 后端根据 token 和服务端保存的定位上下文计算范围。
- `visitor_session` 使用当前有效定位上下文里的 `matched_tenants[].tenant_id`。
- 多个匹配公司都可展示；`selected_tenant_id` 只影响排序，不能缩小集合。
- customer/employee 身份使用 JWT `tenant_id`，不读取 visitor 定位。
- 无有效范围时返回空分页：`list: []`，`pagination.total: 0`。
- 详情和日志越界统一返回 `404 项目不存在`。

详情与日志：

```http
GET /front/projects/:id
GET /front/projects/:id/logs?page=1&pageSize=10
Authorization: Bearer <visitor/customer/employee token>
```

后端会用同一范围校验项目 `tenant_id`。不在范围内时不返回项目、日志、成员、咨询状态或关注状态。

## orange 当前影响点

只读检查到以下文件需要小程序侧修改：

| 文件 | 当前情况 | 建议 |
| --- | --- | --- |
| `src/services/projects/frontCache.ts` | `api.get<Project[]>('/front/projects')`，只接受数组 | 改为接收 `{ list, pagination }`，缓存 key 至少包含 page/pageSize 或取消单例缓存 |
| `src/services/projects/methods/frontCustomer.ts` | 已有部分分页归一逻辑，但首页入口仍需适配新响应 | `getFrontProject` 传 `page/pageSize`，统一返回 `{ list, pagination }` |
| `src/pages/visitor/index.tsx` | `ProjectService.getFrontProject` 后按 `Array.isArray(res.data)` 读项目 | 改为读取 `res.data.list`，保存分页状态，加载更多读 `pagination` |
| `src/pages/visitor/model.ts` | `VISITOR_PROJECTS_CACHE_KEY = 'visitor:front-projects:v1'`，只缓存项目数组 | 定位上下文变化、confirm、skip、重新定位、身份变化时清理缓存；缓存结构增加 pagination |

推荐调用时序：

```text
ensureSessionReady
  -> visitor location context ready / skipped
  -> GET /front/projects?page=1&pageSize=20
```

定位未完成时如果先请求，后端可能返回空分页。小程序应在定位上下文 ready、用户跳过定位、或切换到 customer/employee 身份后再拉首页项目。

## 缓存失效建议

小程序侧需要在这些事件清理访客项目缓存：

- visitor 定位 bootstrap 返回新的 context；
- 用户确认公司；
- 用户跳过定位；
- 用户重新定位；
- auth mode 从 visitor 切换到 customer/employee；
- token 或 login epoch 变化；
- 用户退出或 session inflight clearer 触发。

## Smoke 清单

1. A 区 visitor 定位后，首页只出现 A 区服务范围覆盖的公司公开项目。
2. B 区 visitor 定位后，首页只出现 B 区服务范围覆盖的公司公开项目。
3. A/B 两个服务区域不重叠时，A visitor 访问 B 项目详情返回 404。
4. A visitor 访问 B 项目日志返回 404。
5. 无匹配公司时，首页返回 `list: []` 和合法 pagination。
6. 多匹配公司时，所有匹配公司的公开项目可见，selected 公司项目排在前面。
7. customer token 进入访客首页时，只展示该 customer 身份 tenant 的公开项目。
8. employee token 进入访客首页时，只展示该 employee 身份 tenant 的公开项目。
9. `pageSize=101` 返回参数校验错误。
10. 定位切换后，小程序本地项目缓存被清理并重新请求。

## 所有权

- gooes 已实现后端范围过滤、分页响应、详情和日志越界 404、以及 visitor 登录预热去全局项目列表。
- orange 需要按本文修改小程序服务层、visitor 首页读取逻辑和本地缓存失效。
- 本次没有修改 `/Users/leefo/Public/work/orange`。
