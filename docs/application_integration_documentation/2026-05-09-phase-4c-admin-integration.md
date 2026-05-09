# 阶段 4C Admin 对接说明：H5 租户化公开入口

日期：2026-05-09

## 1. 结论

Admin 端本阶段不需要改动。

阶段 4C 主要新增 H5 公开访问入口和小程序 web-view 链路能力，Admin 现有 H5 页面管理、发布、预览、线索列表继续走阶段 4B 已完成的租户隔离逻辑。

## 2. 后端新增能力

新增公开接口：

```text
GET  /public/tenants/:tenantSlug/marketing-pages
GET  /public/tenants/:tenantSlug/marketing-pages/:slug
POST /public/tenants/:tenantSlug/marketing-pages/:slug/leads
POST /public/tenants/:tenantSlug/marketing-pages/:slug/events
```

H5 新增访问路径：

```text
https://h5.goodcms.cn/t/:tenantSlug/p/:slug
```

旧路径继续保留：

```text
https://h5.goodcms.cn/p/:slug
```

## 3. Admin 现有逻辑保持

以下逻辑不变：

- H5 页面创建不用传 `tenant_id`。
- H5 页面列表自动按当前员工租户过滤。
- H5 页面发布、下线、复制、删除继续校验租户边界。
- H5 线索列表自动按当前员工租户过滤。
- H5 线索转客户只在当前租户内匹配手机号。

## 4. 可选优化

后续如果 Admin 页面需要展示或复制 H5 链接，建议优先使用后端返回的 tenant H5 URL：

```text
https://h5.goodcms.cn/t/:tenantSlug/p/:slug
```

当前阶段不强制改 UI，因为旧链接仍兼容。

## 5. 联调检查

- 当前租户 Admin 可以继续编辑和发布自己的 H5 页面。
- 当前租户 Admin 看不到其他租户 H5 页面。
- 从小程序或浏览器打开 tenant URL 后，线索进入正确租户。
