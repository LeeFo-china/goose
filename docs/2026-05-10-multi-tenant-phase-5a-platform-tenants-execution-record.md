# 多租户改造阶段 5A 执行记录：平台租户管理 API

日期：2026-05-10

## 本阶段目标

先交付平台超管可用的租户管理后端能力，作为后续 admin 平台页、租户初始化、租户管理员创建的基础。

## 已完成

### 1. 平台超管身份

- 新增 `platform_admin` 平台角色种子 migration。
- `/platform/tenants/*` 全部复用 `authorizationService.getRequiredAuthContext()`。
- 后端通过 `authContext.isPlatformAdmin` 统一拦截非平台超管。

### 2. 租户管理接口

已新增接口：

- `GET /platform/tenants`
- `POST /platform/tenants`
- `GET /platform/tenants/:id`
- `PATCH /platform/tenants/:id`
- `POST /platform/tenants/:id/suspend`
- `POST /platform/tenants/:id/activate`

### 3. 租户用量统计

租户列表和详情返回基础用量：

- `employee_count`
- `customer_count`
- `project_count`
- `h5_page_count`
- `camera_count`

统计来源均按业务表 `tenant_id` 过滤，不做跨租户业务数据返回。

### 4. 数据校验

- 租户 `slug` 必须唯一。
- 租户 `slug` 只允许小写字母、数字、下划线和中划线。
- 租户更新不允许修改 `slug`，避免已有 H5、小程序、分享链路失效。
- 已归档租户不允许通过本阶段接口停用或启用。

## 文件变更

- `apps/api/src/controllers/platform-tenants/index.ts`
- `apps/api/src/schema/platform-tenants.ts`
- `apps/api/src/services/platform-tenants.ts`
- `apps/api/src/repositories/platform-tenants.ts`
- `apps/api/src/routes/index.ts`
- `supabase/migrations/20260510100000_seed_platform_admin_role.sql`

## 后续阶段

### 5B：租户初始化

- 创建租户时初始化默认部门、岗位、角色。
- 创建租户管理员员工。
- 绑定管理员手机号。
- 记录租户模板版本。

### 5C：admin 平台页面

- 新增平台租户列表和详情页面。
- 支持创建、编辑、停用、启用。
- 展示基础用量统计。

### 5D：租户状态拦截

- 停用租户后阻止租户员工登录业务后台。
- 停用租户后阻止客户进入客户项目页。
- 明确 H5 公开页停用策略。

## 验证

```bash
bun run api:typecheck
```
