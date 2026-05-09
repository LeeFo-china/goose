# 多租户阶段 4F 执行记录：员工拓客直绑定

日期：2026-05-09

## 本阶段目标

落地装修公司员工分享小程序码、H5 活动页、报价表单等拓客入口后，客户登录时可直接绑定到分享员工所在租户，不进入平台公海线索。

## 已完成

### 1. 数据库

新增 migration：

```text
supabase/migrations/20260509220000_create_tenant_share_links.sql
```

包含：

- `tenant_share_links`：租户员工分享上下文。
- `customer_sources` 增补：
  - `source_employee_id`
  - `related_type`
  - `related_id`
  - `share_link_id`
- `bind_customer_from_tenant_share()`：员工分享路径直绑定 RPC。

RPC 行为：

1. 使用 `share_token` 锁定 `tenant_share_links`。
2. 校验分享链接状态、过期时间、租户状态、分享员工状态。
3. 按 `tenant_id + phone` 在目标租户下查找客户。
4. 客户已存在时不重复创建。
5. 客户不存在时创建目标租户客户。
6. 如果目标租户客户已绑定其他微信账号，拒绝绑定。
7. 写入 `customer_sources`，记录分享员工、分享链接和来源。
8. 更新分享链接 `use_count` 和 `last_used_at`。

### 2. 后端接口

新增：

```text
POST /tenant-share-links
GET /tenant-share-links
GET /public/tenant-share-links/:token
```

实现文件：

```text
apps/api/src/schema/tenant-share-links.ts
apps/api/src/repositories/tenant-share-links.ts
apps/api/src/services/tenant-share-links.ts
apps/api/src/controllers/tenant-share-links/index.ts
```

### 3. 客户登录接入

`POST /auth/verify-role` 的 `target_role=customer` 支持传入：

```json
{
  "share_token": "ts_xxx"
}
```

如果传入 `share_token`：

- 后端优先走员工分享直绑定。
- 成功后直接返回 `mode = customer`。
- 返回中增加 `share_binding`，供小程序识别本次是分享绑定。
- 不再走 `platform_visitor` 或 `select_tenant` 分流。

## 不做项

本阶段未实现通知租户管理员和分享员工，原因是当前后端还没有统一通知基础设施。建议后续和阶段 4E 的平台线索分配通知一起做。

## 验证

已执行：

```bash
bun run api:typecheck
bun run api:build
```

通过。
