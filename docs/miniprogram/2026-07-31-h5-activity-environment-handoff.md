# H5 活动环境域名小程序对接

## 结论

Gooes 将开发环境 H5 页面从官网 Web 服务拆分为独立 H5 服务，域名边界
保持如下：

| 环境 | API 请求 | H5 WebView 页面 |
| --- | --- | --- |
| development | `https://api-dev.goodcms.cn` | `https://h5-dev.goodcms.cn` |
| production | `https://api.goodcms.cn` | `https://h5.goodcms.cn` |

本次不调整活动接口的数据契约。Orange 仓库由小程序团队维护，本次后端
实施未修改 Orange 文件。

## 接口

### 活动列表

```http
GET /public/marketing-pages?scene=home
```

visitor 首页固定使用 `scene=home`。接口返回 `data.list`，列表项继续包含：

- `id`
- `title`
- `slug`
- `description`
- `cover_image`
- `display_scene`
- `sort_order`
- `url`
- `start_at`
- `end_at`
- `published_at`
- `updated_at`

列表请求必须使用对应环境的 API 域名，列表项 `url` 必须保留对应环境的
H5 域名。

### 租户活动列表

```http
GET /public/tenants/:tenantSlug/marketing-pages?scene=:scene
```

同样使用对应环境 API 域名。

### H5 session

```http
POST /wechat/h5-session
Authorization: Bearer <token>
Content-Type: application/json

{
  "tenant_slug": "optional-tenant",
  "slug": "activity-slug",
  "scene": "home"
}
```

使用对应环境 API 域名。既有开发构建通过 H5 域名访问该接口仍可由
开发 Nginx 兼容，但这只是过渡兼容，不应作为新代码的目标地址。

## Orange 修改点

只读核查文件：

- `src/utils/h5_activity.ts`
- `src/packageVisitor/pages/visitor-home/hooks/useVisitorH5Activities.ts`
- `src/packageVisitor/pages/visitor-home/VisitorView.tsx`
- `.env.development`

建议在 `src/utils/h5_activity.ts` 拆分两个 origin：

1. `H5_ACTIVITY_API_ORIGIN`：来自现有 `TARO_APP_BASEURL`，用于活动列表、
   租户活动列表和 `/wechat/h5-session`。
2. `H5_ACTIVITY_ORIGIN`：来自 `TARO_APP_H5_ACTIVITY_ORIGIN`，只用于生成、
   校验和打开 `/p/:slug` 或 `/t/:tenant/p/:slug` 页面。

不要把 API origin 用于 `isAllowedH5Url`；该安全校验仍只允许当前环境的
H5 页面 origin。

visitor 首页当前在请求失败时将活动清空，并通过 `hasActivities=false`
隐藏整个区域。建议至少记录脱敏的 request URL host、HTTP 状态和微信
错误消息，或渲染可重试错误态，避免合法域名错误再次表现为“没有活动”。

## 微信公众平台配置

开发版：

- request 合法域名：`https://api-dev.goodcms.cn`
- 业务域名：`https://h5-dev.goodcms.cn`

生产版：

- request 合法域名：`https://api.goodcms.cn`
- 业务域名：`https://h5.goodcms.cn`

配置后必须使用真机或开启域名校验的开发者工具验证，不能以关闭
`urlCheck` 的模拟结果作为验收依据。

## 验收清单

1. 开发构建的活动列表请求 host 为 `api-dev.goodcms.cn`。
2. 生产构建的活动列表请求 host 为 `api.goodcms.cn`。
3. 开发列表返回的活动 URL host 为 `h5-dev.goodcms.cn`。
4. 生产列表返回的活动 URL host 为 `h5.goodcms.cn`。
5. visitor 首页能显示 `scene=home` 的有效活动。
6. 点击活动进入对应 H5 页面，页面不再显示 Web 404。
7. 登录态 session 请求走 API 域名，成功后 WebView 正常打开。
8. 请求失败时能够看到可诊断反馈，不再静默等同于空列表。

