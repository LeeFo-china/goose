# 多租户改造阶段 5C 执行记录：admin 平台租户管理页

日期：2026-05-10

## 本阶段目标

给平台超管提供可操作的租户管理页面，完成租户创建、编辑、启用/停用和基础用量查看。

## 已完成

### 1. 侧边栏入口

新增侧边栏入口：

```text
平台租户 -> /platform/tenants
```

显示规则：

- 当前 admin session 的 `roles` 包含 `platform_admin` 时显示。
- 普通租户管理员不显示该入口。

### 2. 页面

新增页面：

```text
apps/admin/app/(console)/platform/tenants/page.tsx
apps/admin/app/(console)/platform/tenants/loading.tsx
```

页面能力：

- 租户列表
- 状态筛选
- 关键词搜索
- 分页
- 本页摘要统计
- 用量统计展示

### 3. 创建租户

创建弹窗对接：

```http
POST /platform/tenants
```

表单包含：

- 公司名称
- slug
- 联系人
- 联系电话
- 管理员姓名
- 管理员手机号

创建后由后端初始化：

- 默认部门
- 默认岗位
- 默认角色
- 管理员员工和 `system_admin` 角色

### 4. 编辑租户

编辑弹窗对接：

```http
PATCH /platform/tenants/:id
```

允许更新：

- 公司名称
- 联系人
- 联系电话

不允许更新：

- slug
- 状态
- 管理员

### 5. 启用/停用

操作对接：

```http
POST /platform/tenants/:id/suspend
POST /platform/tenants/:id/activate
```

交互：

- 按钮触发二次确认弹窗。
- `archived` 状态只读，不显示可用操作。

## 文件变更

- `apps/admin/app/(console)/platform/tenants/page.tsx`
- `apps/admin/app/(console)/platform/tenants/loading.tsx`
- `apps/admin/components/platform-tenants/platform-tenant-types.ts`
- `apps/admin/components/platform-tenants/platform-tenant-list-actions.tsx`
- `apps/admin/components/platform-tenants/platform-tenant-mutations.tsx`
- `apps/admin/components/platform-tenants/platform-tenants-table.tsx`
- `apps/admin/components/layout/admin-shell.tsx`
- `apps/admin/components/layout/admin-nav.tsx`

## 验证

```bash
pnpm --dir apps/admin build
```

## 后续

### 5C-2 可选增强

- 租户详情页。
- 租户初始化记录查看。
- 租户管理员重置/补建。
- 平台租户审计日志。

### 5D 建议继续

- 停用租户登录拦截。
- 停用租户小程序客户态访问拦截。
