# Visitor 本地服务商列表公司地址后端对接

更新时间：2026-06-06

来源文档：

```text
/Users/leefo/Public/work/orange/docs/2026-06-06-visitor-local-services-tenant-address-backend.md
```

## 背景

小程序 visitor 首页“了解本地服务商”列表已改为展示：

- 装修公司名称
- 本地服务标记
- 公司地址

小程序读取地址字段优先级：

```text
address > company_address > tenant_address > office_address
```

后端此前 `POST /visitor/location-bootstrap` 的 `matched_tenants[]` 只包含服务区域和匹配信息，没有装修公司真实办公地址。

## 后端实现

已新增租户真实地址字段：

```sql
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address text;
```

字段语义：

- `tenants.address` 只表示装修公司真实办公地址或门店地址。
- 不使用 `province/city/district/adcode`、服务区域名称、匹配区域名称兜底。
- 地址为空时返回 `null`，小程序按既有逻辑隐藏地址行。

平台租户管理已支持维护该字段：

- 新建租户时可填写公司地址。
- 编辑租户时可更新公司地址。
- 租户详情基础信息展示公司地址。

## 接口契约

已调整：

```http
POST /visitor/location-bootstrap
```

以及写入 `user_location_contexts.matched_tenants` 的候选服务商快照。

每个候选装修公司继续保留原有字段，并补充地址兼容字段：

```json
{
  "tenant_id": "tenant-a",
  "tenant_name": "固始晴天装饰工程有限公司",
  "tenant_slug": "tenant-sobmzdo5",
  "address": "河南省信阳市固始县xxx路xxx号",
  "company_address": "河南省信阳市固始县xxx路xxx号",
  "tenant_address": "河南省信阳市固始县xxx路xxx号",
  "service_area_id": "service-area-id",
  "province": "河南省",
  "city": "信阳市",
  "district": "固始县",
  "adcode": "411525",
  "match_reason": "adcode",
  "match_rank": 90,
  "distance_km": null,
  "priority": 100
}
```

兼容性：

- `confirm`、`skip`、`selected_tenant` 逻辑不变。
- 已保存的历史定位上下文不会自动补齐地址；重新 bootstrap 后写入新快照。
- 地址为空的租户仍返回 `address/company_address/tenant_address: null`。

## 后端改动点

- `supabase/migrations/20260606103000_add_tenant_address.sql`
- `apps/api/src/schema/platform-tenants.ts`
- `apps/api/src/repositories/platform-tenants/legacy/*`
- `apps/api/src/repositories/tenant-service-areas.ts`
- `apps/api/src/services/location-matching.ts`
- `apps/api/src/services/visitor-location.ts`
- `apps/admin/components/platform-tenants/*`
- `apps/admin/app/(console)/platform/tenants/[id]/page.tsx`

## 验收标准

1. 目标环境执行数据库 migration 后，`tenants.address` 字段存在。
2. admin 平台租户新建/编辑可维护公司地址。
3. 给至少一个 active 租户填写真实公司地址。
4. 使用 visitor 登录态调用 `POST /visitor/location-bootstrap`。
5. 返回的 `matched_tenants[]` 中对应租户包含 `address`，且不是服务区域字段兜底。
6. 小程序“了解本地服务商”列表显示该地址；地址为空的服务商不显示地址行。

## 开发库 smoke

已执行：

```text
supabase db push --yes
bun run api:check
pnpm --dir apps/admin check
git diff --check
```

开发库状态：

| 检查项 | 结果 |
| --- | --- |
| `20260606103000_add_tenant_address.sql` | 已推送到当前开发 Supabase |
| `tenants.address` select | 通过 |
| active 租户数量 | 2 |
| active 且已填写地址的租户数量 | 0 |
| `locationMatchingService.matchServiceAreas()` | 匹配到 2 个候选 |
| 候选是否包含 `address/company_address/tenant_address` | 通过 |
| 候选地址值 | 当前均为 `null`，因为开发库尚未维护真实公司地址 |

## 待验证

需要在 admin 平台租户里给至少一个 active 装修公司维护真实公司地址后，再使用 visitor 登录态调用 `POST /visitor/location-bootstrap` 做端到端 smoke，确认小程序列表显示地址。
