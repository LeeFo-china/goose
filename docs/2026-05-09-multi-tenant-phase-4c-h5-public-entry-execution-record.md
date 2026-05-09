# 多租户阶段 4C 执行记录：H5 租户化公开入口

日期：2026-05-09

## 1. 目标

阶段 4C 解决 H5 活动页在多租户场景下的公开访问入口问题：

- 保留旧入口 `/p/:slug`，保证已发布链接继续可用。
- 新增租户化入口 `/t/:tenantSlug/p/:slug`。
- 公开 API 支持按租户 slug 查询活动页、提交线索、记录埋点。
- H5 session token 写入 `tenant_id`，避免跨租户复用身份。

## 2. 已完成改动

### 2.1 后端公开接口

新增租户化公开接口：

```text
GET  /public/tenants/:tenantSlug/marketing-pages
GET  /public/tenants/:tenantSlug/marketing-pages/:slug
POST /public/tenants/:tenantSlug/marketing-pages/:slug/leads
POST /public/tenants/:tenantSlug/marketing-pages/:slug/events
```

旧接口继续保留：

```text
GET  /public/marketing-pages
GET  /public/marketing-pages/:slug
POST /public/marketing-pages/:slug/leads
POST /public/marketing-pages/:slug/events
```

### 2.2 H5 session

`POST /wechat/h5-session` 请求体新增可选字段：

```json
{
  "tenant_slug": "gooes_default",
  "slug": "springsale",
  "scene": "customer_home"
}
```

响应新增：

```json
{
  "tenant_id": "tenant-id",
  "tenant_slug": "gooes_default"
}
```

签发的 H5 token 内部携带 `tenant_id`。提交线索或埋点时，如果 token 中的 `tenant_id` 与当前页面租户不一致，后端不会复用该 token 身份，会按匿名访问处理。

### 2.3 H5 前端

H5 站点支持两种路径：

```text
/p/:slug
/t/:tenantSlug/p/:slug
```

H5 表单提交、埋点、页面详情读取会根据当前路径自动调用对应公开接口。本地已提交状态缓存 key 增加租户维度：

```text
gooes:h5:lead:{tenantSlug|global}:{slug}
```

### 2.4 Tenant slug 兼容

租户 slug 校验已兼容现有数据中的下划线，例如：

```text
gooes_default
tenant_verify_a
```

## 3. 验证记录

本地 API 使用临时端口 `3105`，通过远程 Supabase smoke 数据验证：

- 租户 A 活动列表只返回租户 A 页面。
- 租户 A 详情不能读取租户 B 页面。
- 旧入口 `/public/marketing-pages/:slug` 仍可读取。
- `/wechat/h5-session` 返回 `tenant_id` 和 `tenant_slug`。
- 租户化线索提交成功。
- 租户化埋点提交成功。
- 租户 A token 用在租户 B 页面时按匿名处理。

静态校验：

```text
bun run api:typecheck
bun run api:build
node --check apps/h5/src/main.js
git diff --check
```

## 4. 后续建议

- Admin 列表可继续使用当前接口，不需要展示租户字段。
- 小程序打开 H5 时优先使用列表接口返回的 `url`。
- 小程序申请 H5 session 时，如果上下文里有 `tenant_slug`，应传给 `/wechat/h5-session`。
- 后续如果要取消 slug 全局唯一，需要新增数据库唯一索引迁移：`unique(tenant_id, slug)`，并移除旧的全局 slug 唯一索引。
