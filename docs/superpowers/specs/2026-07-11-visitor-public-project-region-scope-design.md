# Visitor 公开项目公司服务区域过滤设计

**日期：** 2026-07-11

**状态：** 已确认，待实施计划

**范围：** gooes 后端公开项目接口与 orange 小程序对接契约

## 1. 背景与目标

visitor 首页当前通过 `GET /front/projects` 获取全平台公开项目。后端只判断项目的
公开状态，没有使用 visitor 定位上下文或身份租户，因此不同区域的访客可能看到
其他区域公司的项目。

本次目标是让公开项目的公司范围与请求者一致：

- `visitor_session` 按当前有效定位上下文所匹配的公司过滤。
- customer、employee 按身份绑定公司过滤，身份租户优先于 visitor 定位。
- 没有可用公司范围时返回空列表，不返回其他区域公司的项目。
- 只校验公司服务区域覆盖关系，不校验项目自身地址。

## 2. 已确认的业务规则

### 2.1 Visitor 公司范围

后端根据 visitor token 中的 `visitor_id` 读取当前有效的
`user_location_contexts` 记录，并使用 `matched_tenants[].tenant_id` 作为可见公司
集合。

- 多家公司覆盖当前区域时，返回这些公司的公开项目。
- `selected_tenant_id` 只用于排序，不缩小可见公司集合。
- `selection_status=pending` 时可以展示全部匹配公司的公开项目。
- `selection_status=skipped` 时仍使用已保存的 `matched_tenants`。
- 上下文不存在、已过期、要求重新定位或 `matched_tenants=[]` 时，返回空列表。
- 不使用平台默认公司或其他区域公司兜底。

### 2.2 Customer 和 Employee 公司范围

customer 或 employee token 访问公开展示入口时，使用身份绑定的 `tenant_id` 作为
唯一可见公司，不读取或应用 visitor 定位上下文。

身份 token 缺少有效租户时，返回空列表。不能退回全平台公开项目。

### 2.3 项目地址

项目是否可见只取决于项目所属公司是否在可见公司集合内，以及项目本身是否公开。
不要求 `property.adcode`、区县或城市与 visitor 定位相同。

例如一家公司服务固始县，其位于其他城市的历史公开案例仍可向固始县 visitor
展示；公司没有覆盖固始县时，其任何项目都不能展示。

## 3. 方案选择

保留现有 `/front/projects`、`/front/projects/:id` 和
`/front/projects/:id/logs` 路径，由后端从认证信息自动解析可见公司范围。

不采用以下方案：

- 不新增 `/visitor/public-projects`，避免复制公开项目查询和序列化链路。
- 不接受客户端传入 `tenant_ids` 作为授权依据，避免参数篡改和前后端规则分叉。
- 不按项目地址过滤，遵循已确认的公司服务区域口径。

## 4. 后端架构

### 4.1 可见范围解析

新增一个公开项目范围解析单元，输入为认证后的 `request.user`，输出稳定的范围对象：

```ts
interface PublicProjectAudienceScope {
  kind: 'visitor_location' | 'identity_tenant' | 'empty';
  tenantIds: string[];
  preferredTenantId: string | null;
}
```

解析规则：

1. `visitor_session`：读取有效 visitor 定位上下文，提取并去重
   `matched_tenants[].tenant_id`。
2. customer/employee：读取认证载荷中的身份 `tenant_id`。
3. 无法得到有效租户：返回 `kind='empty'` 和空集合。

Controller 只负责读取请求、校验分页或 ID 参数、调用 Service 和包装响应。
Service 负责解析范围、编排排序和可见性判断。Repository 只负责执行带租户范围、
公开状态和分页条件的 Supabase 查询。

### 4.2 列表接口

```http
GET /front/projects?page=1&pageSize=20
Authorization: Bearer <visitor/customer/employee token>
```

约束：

- `page` 默认 `1`。
- `pageSize` 默认 `20`，最大 `100`。
- Repository 查询必须包含公开状态条件、`tenant_id` 范围和 `.range()`。
- 查询继续限定现有公开展示字段，不引入内部租户字段。
- `preferredTenantId` 存在时，该公司项目优先；同一排序层级内按
  `created_at DESC`。
- 空范围不访问全量项目表，直接返回空分页。

响应调整为：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "totalPages": 0
    }
  },
  "message": "success"
}
```

### 4.3 详情与日志接口

以下接口必须应用与列表相同的公司范围：

```http
GET /front/projects/:id
GET /front/projects/:id/logs?page=1&pageSize=10
```

处理顺序：

1. 解析请求者可见公司范围。
2. 查询项目公开状态和所属 `tenant_id`。
3. 确认项目租户属于当前范围。
4. 通过后再读取详情、日志、成员和关注状态。

项目公开但不在当前公司范围时返回经过 `error-factory.ts` 包装的 `404`，不暴露
项目是否存在或属于哪个区域。日志接口不得只依赖“项目公开”检查。

### 4.4 缓存与预热

当前全局 `publicProjectsCache` 不能继续作为带区域范围列表的结果缓存。

实施时采用以下口径：

- 列表缓存键至少包含范围类型、排序后的 tenant IDs、preferred tenant、page 和
  pageSize。
- 空范围直接返回，不写全局项目缓存。
- 项目详情数据可以继续按项目 ID 缓存，但每次返回缓存前都必须先完成当前请求的
  公司范围校验。
- visitor 登录阶段不再预热全平台项目；只有已能解析有效公司范围时才允许按范围
  预热，否则跳过项目预热。
- 项目公开状态或归属公司变化时，继续统一失效相关列表和详情缓存。

## 5. Orange 小程序对接影响

orange 仓库由小程序团队维护，本次 gooes 工作不得修改该仓库。

小程序需要调整：

- `src/services/projects/frontCache.ts`：读取分页结构，不再假定 `data` 是数组。
- `src/services/projects/methods/frontCustomer.ts`：为首页列表传递
  `page=1&pageSize=20`。
- `src/pages/visitor/index.tsx`：读取 `data.list`，定位 bootstrap、confirm、skip
  或身份变化完成后重新请求项目列表。
- `src/pages/visitor/model.ts`：缓存必须关联当前 visitor 定位上下文或身份租户；切换
  区域、公司或身份时清除旧项目缓存，避免短暂显示上一区域数据。
- 后续如增加“加载更多”，使用后端返回的 `pagination`，不得一次拉取全量项目。

小程序不传 `tenant_ids`，也不在本地重新实现服务区域匹配。

## 6. 异常与空状态

| 场景 | 列表行为 | 详情/日志行为 |
| --- | --- | --- |
| visitor 有有效匹配公司 | 返回匹配公司公开项目 | 仅允许范围内项目 |
| visitor 多个匹配公司、未选择 | 返回所有匹配公司项目 | 仅允许这些公司项目 |
| visitor 跳过公司选择 | 返回所有匹配公司项目 | 仅允许这些公司项目 |
| visitor 无匹配服务区域 | 空分页 | `404` |
| visitor 上下文过期或需重新定位 | 空分页 | `404` |
| customer/employee 有身份租户 | 仅返回身份租户项目 | 仅允许身份租户项目 |
| customer/employee 无有效租户 | 空分页 | `404` |
| 项目隐藏或状态不可公开 | 不返回 | `404` |

“平台活动、AI 问答等首页平台内容”可以继续独立兜底；公开项目不能使用跨区域项目
兜底。

## 7. 性能与数据库边界

- 列表查询只选择当前公开卡片需要的字段。
- 使用 `.range()` 分页，`pageSize` 不超过 `100`。
- 不允许先加载全平台公开项目再在内存中过滤。
- 实施前核对 `projects` 现有索引；若缺少支持 `tenant_id`、公开状态和
  `created_at` 排序的索引，必须通过 `supabase/migrations/` 新增。
- 新增索引前后使用代表性条件执行 `EXPLAIN ANALYZE`，记录扫描方式和耗时。
- 如产生 migration，应用前确认文件，应用后使用 `supabase migration list` 验证
  Local/Remote 对齐。

## 8. 验收标准

至少准备公司 A、公司 B 和两个不重叠服务区域，覆盖以下场景：

1. A 区 visitor 只能看到公司 A 的公开项目。
2. B 区 visitor 只能看到公司 B 的公开项目。
3. 无服务区域匹配的 visitor 得到空分页。
4. 多家公司覆盖同一区域时，能看到所有匹配公司的公开项目。
5. 选择其中一家公司后，该公司项目排在前面，其他匹配公司项目仍可见。
6. 公司 A 的项目地址位于 B 区，只要公司 A 覆盖 visitor 当前区域，该项目仍可见。
7. A 区 visitor 直接请求公司 B 的项目详情或日志时得到 `404`。
8. customer/employee 只看到身份绑定公司的公开项目，不受 visitor 定位影响。
9. `pageSize=101` 返回参数校验错误，错误由 `error-factory.ts` 包装。
10. 区域或身份切换后，小程序不展示旧范围缓存项目。

后端最小验证包括 API 类型检查或构建、列表分页 smoke、详情越界 smoke、定位无匹配
smoke；小程序团队完成分页响应适配后，再使用微信开发者工具或真机执行端到端验收。

## 9. 范围外事项

- 不修改项目自身地址数据或地址匹配规则。
- 不修改租户服务区域匹配算法和排序权重。
- 不新增缓存、队列、Redis 或第三方依赖。
- 不改变客户或员工的身份租户归属。
- 不在 gooes 任务中修改 orange 仓库。
