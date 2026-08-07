# 客户项目日志分享卡租户品牌字段设计

## 背景

小程序“我的海报”需要展示项目所属装修公司的对客名称。当前
`GET /customer/projects/:projectId/logs/:logId/share-card` 只返回项目、日志、
图片和助力活动信息，不返回项目所属租户名称。前端暂时使用当前登录态租户名兜底，
在客户拥有多个租户身份或切换租户时可能出现品牌错配。

## 目标

- 分享卡响应明确返回项目所属租户的展示名称。
- 同时提供 `tenant_name` 和 `company_name`，兼容不同客户端字段命名。
- 两个字段来源一致，不依赖客户当前登录态中的租户。
- 保持现有接口路径、请求参数、鉴权和其他响应字段不变。

## 非目标

- 不调整租户表结构或新增品牌配置字段。
- 不修改助力活动、二维码、奖励或海报图片逻辑。
- 不修改 Orange 仓库；小程序端继续按既定优先级消费字段。
- 不为此引入额外数据库查询、缓存或新依赖。

## 数据来源与查询

在 `getOwnedProjectLogContext()` 已有的项目查询中增加项目租户关系：

```text
tenant:tenants!projects_tenant_id_fkey(name)
```

名称来源固定为 `projects.tenant_id` 关联到的 `tenants.name`。该名称是现有系统中租户
对客展示名称的统一来源，与项目列表和公开项目详情的 `tenant_name` 口径一致。

采用一次关联查询，不根据登录态租户补值，也不根据 `tenant_id` 发起第二次查询，避免
多租户品牌错配和额外数据库往返。

## 服务上下文与响应契约

`CustomerProjectRow` 增加可空的租户关系类型，`CustomerProjectLogShareContext` 增加：

```typescript
tenant_name: string | null;
```

关系数据需兼容 Supabase 返回单对象或数组的形式，并复用当前服务中的关系规范化方式。

`getShareCard()` 在现有响应上增加：

```json
{
  "tenant_name": "杭州某某装饰工程有限公司",
  "company_name": "杭州某某装饰工程有限公司"
}
```

字段规则：

- 两个字段始终取 `context.tenant_name`，值保持一致。
- 项目没有租户或租户名称不可用时，两个字段均返回 `null`。
- 字段保留在 JSON 中，不因值为 `null` 而省略，便于客户端获得稳定结构。
- 不使用客户登录态租户名称进行服务端兜底。

## 分层边界

- Controller 继续只负责参数校验、调用服务和包装响应，不补租户名称。
- 现有 legacy service 的项目上下文查询负责取得并规范化项目所属租户名称。
- `getShareCard()` 负责把上下文名称映射为兼容的两个响应字段。
- 本次不迁移或重构现有 legacy service 的 Supabase 访问方式，避免扩大范围。

## 错误与兼容性

- 项目、日志、客户归属和鉴权错误继续使用现有错误响应，不增加错误码。
- 租户关系为空不会导致接口失败，只返回两个 `null` 字段。
- 现有客户端忽略新增字段即可保持兼容。
- Orange 已约定读取优先级：`tenant_name` → `company_name` → 登录态租户名。

## 测试与验收

按 TDD 增加聚焦测试，至少覆盖：

1. 项目上下文查询包含 `projects_tenant_id_fkey` 租户关系且只查询必要的 `name` 字段。
2. 租户关系为对象或数组时，均能得到正确 `tenant_name`。
3. 分享卡同时返回同值的 `tenant_name` 和 `company_name`。
4. 租户名称缺失时两个字段均为 `null`。
5. 现有分享卡图片、奖励、二维码和活动字段保持不变。

实施后运行相关 Bun 测试、API TypeScript 检查和最小构建验证。dev 发布后使用至少两个
不同租户的客户项目进行接口 smoke，确认返回值跟随项目所属租户，而不是当前登录态租户。

## 前后端责任

Gooes 负责查询项目所属租户并返回双字段，发布后同步 dev commit 和脱敏响应样例。
Orange 继续维护字段读取优先级和海报展示，不需要调整请求路径、参数或鉴权流程。
