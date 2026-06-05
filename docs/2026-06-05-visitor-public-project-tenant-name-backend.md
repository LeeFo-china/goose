# Visitor 公开项目装修公司名称后端对接

更新时间：2026-06-05

来源文档：

```text
/Users/leefo/Public/work/orange/docs/2026-06-05-visitor-public-project-tenant-name-backend.md
```

## 背景

visitor 首页公开项目列表需要展示项目所属装修公司名称。小程序侧读取顺序为：

1. `project.tenant.name`
2. `project.company.name`
3. `project.tenant_name`
4. `project.company_name`

如果上述字段都为空，小程序只能展示“装修公司待确认”。

## 后端实现

已调整接口：

```http
GET /front/projects
GET /front/projects/:id
```

公开项目列表和详情均返回安全的装修公司展示字段：

```json
{
  "tenant": {
    "id": "tenant-id",
    "name": "固始晴天装饰工程有限公司",
    "slug": "tenant-sobmzdo5"
  },
  "tenant_name": "固始晴天装饰工程有限公司"
}
```

实现口径：

- `PUBLIC_PROJECT_LIST_SELECT` 关联 `tenants!projects_tenant_id_fkey(id,name,slug)`。
- `PUBLIC_PROJECT_DETAIL_SELECT` 关联 `tenants!projects_tenant_id_fkey(id,name,slug)`。
- 列表 serializer 规范化 `tenant` 关系，并补充 `tenant_name`。
- 详情 serializer 返回与列表一致的 `tenant` 和 `tenant_name`。

安全约束：

- 仅返回租户公开展示字段 `id`、`name`、`slug`。
- 不返回租户联系方式、后台配置、结算信息、管理员账号、员工列表等内部信息。

## 开发库 smoke

测试场景：使用 visitor_session token 调用公开项目接口。

| 用例 | 结果 |
| --- | --- |
| `GET /front/projects` | 200，返回 5 条公开项目 |
| 列表每条 item 都带 `tenant.name` 或 `tenant_name` | 通过，缺失数量 0 |
| 列表 `tenant` 字段范围 | 通过，仅 `id/name/slug` |
| `GET /front/projects/:id` | 200 |
| 详情 `tenant.name` 与 `tenant_name` | 通过 |
| 详情 `tenant` 字段范围 | 通过，仅 `id/name/slug` |

开发库示例：

```json
{
  "id": "54f11aa5-09a8-4410-a9c5-604a7fe9e09c",
  "name": "张学友·固始县蓼都廉租房 4单元201",
  "tenant": {
    "id": "3eebca47-961f-4899-b976-a3d3208d326b",
    "name": "固始晴天装饰工程有限公司",
    "slug": "tenant-sobmzdo5"
  },
  "tenant_name": "固始晴天装饰工程有限公司"
}
```

验证命令：

```text
bun run api:check
git diff --check
```

## 小程序对接结论

小程序侧无需变更字段读取逻辑，继续按现有兼容顺序读取即可：

```ts
project.tenant?.name
project.company?.name
project.tenant_name
project.company_name
```

后端已补齐推荐口径 `tenant.name` 和兜底字段 `tenant_name`。
