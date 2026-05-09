# 多租户阶段 1 执行记录：默认租户与身份上下文

日期：2026-05-09

## 本阶段落地范围

- 新增 `tenants` 租户表。
- 给 `employees`、`customers`、`projects`、`properties` 增加 `tenant_id`。
- 将历史数据回填到默认租户 `gooes_default`。
- 给核心表补充第一批租户查询索引。
- 后端 `AuthContext` 增加租户上下文。
- 后台登录态 `/admin/auth/login`、`/admin/auth/me` 返回 `tenant`。
- admin 顶部预留当前公司名称展示。
- `@gooes/domain` 增加租户基础类型。

## 默认租户策略

数据库 migration 使用固定初始化 slug：

```text
gooes_default
```

应用层后续可通过 `DEFAULT_TENANT_SLUG` 指向不同环境的默认租户。该环境变量只用于初始化、迁移和历史兼容，不允许普通业务请求在缺少租户上下文时自动写入默认租户。

## 兼容边界

- `tenant_id` 本阶段先允许为空，避免一次迁移直接阻断存量异常数据。
- 已登录员工如果没有 `tenant_id`，后端会返回明确错误。
- 非平台管理员所属租户状态非 `active` 时，普通业务接口会被拒绝。
- 业务列表查询隔离不在阶段 1 展开，留到阶段 2。

## 对接输出

- `docs/application_integration_documentation/2026-05-09-phase-1-admin-integration.md`
- `docs/application_integration_documentation/2026-05-09-phase-1-wechat-miniprogram-integration.md`

## 后续进入阶段 2 前检查

- 确认生产库 migration 执行后，核心表历史数据 `tenant_id` 回填数量正确。
- 确认 admin 登录、客户列表、项目列表、小程序客户登录、H5 页面访问无回归。
- 用阶段 0 的双租户测试策略准备隔离测试账号和数据。

## 本地验证

已执行：

```text
bun run api:typecheck
bun run api:build
pnpm --filter @gooes/admin build
pnpm --filter @gooes/domain build
```

验证结果均通过。
