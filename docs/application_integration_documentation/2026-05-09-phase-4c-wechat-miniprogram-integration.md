# 阶段 4C 小程序/H5 对接说明：租户化 H5 公开入口

日期：2026-05-09

## 1. 结论

小程序端建议开始优先使用租户化 H5 链接，但旧链接仍可继续使用。

推荐路径：

```text
https://h5.goodcms.cn/t/:tenantSlug/p/:slug
```

兼容路径：

```text
https://h5.goodcms.cn/p/:slug
```

## 2. 活动列表

租户化活动列表接口：

```http
GET /public/tenants/:tenantSlug/marketing-pages?scene=marketing_list
```

响应 item 会返回 `slug`、`tenant_slug`、`url` 等字段。小程序端不要硬编码 H5 地址，优先直接使用 `url` 打开 web-view。

示例：

```json
{
  "items": [
    {
      "title": "春季活动",
      "slug": "springsale",
      "tenant_slug": "gooes_default",
      "url": "https://h5.goodcms.cn/t/gooes_default/p/springsale"
    }
  ]
}
```

## 3. H5 session

小程序打开 H5 前，如果需要换取 H5 短期 token，请调用：

```http
POST /wechat/h5-session
Authorization: Bearer <小程序登录 token>
Content-Type: application/json
```

请求：

```json
{
  "tenant_slug": "gooes_default",
  "slug": "springsale",
  "scene": "customer_home"
}
```

响应：

```json
{
  "token": "h5-token",
  "expires_at": "2026-05-09T12:00:00.000Z",
  "tenant_id": "tenant-id",
  "tenant_slug": "gooes_default",
  "identity_status": "identified",
  "customer_id": "customer-id"
}
```

web-view URL 可追加 token：

```text
https://h5.goodcms.cn/t/gooes_default/p/springsale?token=<h5-token>
```

## 4. Token 行为

- H5 token 内部携带 `tenant_id`。
- 线索提交和埋点时，后端会校验 token slug 与页面 slug。
- 如果 token 的租户和当前 H5 页面租户不一致，后端不会复用该身份，会按匿名访问处理。
- token 缺失时仍允许提交表单，后端按匿名线索处理。

## 5. 兼容策略

如果小程序当前还没有 `tenant_slug`：

- 可以继续使用 `/p/:slug`。
- 也可以先调用旧活动列表接口。
- 后续进入多租户客户选择态后，应在客户会话或租户选择结果中保存当前 `tenant_slug`。

如果小程序已经有当前租户上下文：

- 活动列表使用 `/public/tenants/:tenantSlug/marketing-pages`。
- web-view 使用接口返回的 `url`。
- `/wechat/h5-session` 请求体带 `tenant_slug`。

## 6. 联调检查

- 租户 A 小程序只展示租户 A H5 活动。
- 租户 A 打开的 H5 URL 形如 `/t/tenantA/p/slug`。
- 提交表单后，Admin 租户 A 的线索列表可见。
- 租户 B Admin 不可见租户 A 线索。
- 使用错误租户 token 不会绑定到错误客户。
