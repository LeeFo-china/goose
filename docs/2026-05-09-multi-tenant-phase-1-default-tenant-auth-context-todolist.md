# 多租户改造阶段 1 Todo：默认租户与身份上下文

日期：2026-05-09

## 目标

建立租户基础模型，并让现有单公司数据全部归属默认租户。登录后后端 `AuthContext` 能携带租户信息，但现有 admin、小程序、H5 行为尽量保持不变。

## 前置条件

- 阶段 0 完成。
- 性能基线已记录。
- 默认租户名称、slug 已确认。
- 各环境 `DEFAULT_TENANT_SLUG` 已确认。
- 已确认当前生产数据全部归入默认租户。

## Todo

### 1. 数据库 migration

- [x] 新增 `tenants` 表。
- [x] 新增租户更新时间 trigger。
- [x] 插入默认租户：
  - `slug = DEFAULT_TENANT_SLUG`
  - `status = active`
- [x] 记录 `DEFAULT_TENANT_SLUG` 的应用层定位，数据库初始化使用 `gooes_default`。
- [ ] 必要时兼容 `DEFAULT_TENANT_ID`，但不作为首选。
- [x] 给核心表增加 `tenant_id`：
  - `employees`
  - `customers`
  - `projects`
  - `properties`
- [x] 回填现有数据到默认租户。
- [x] 确认默认租户只用于初始化和历史数据回填，不作为新业务请求兜底。
- [x] 给核心表增加基础索引：
  - `(tenant_id, created_at)`
  - `(tenant_id, status)`
  - `(tenant_id, phone)`，客户表适用
- [x] 对新增字段先允许兼容旧数据，确认回填完成后再考虑 `not null`。

### 2. 类型与 domain

- [ ] 更新 Supabase database types。
- [x] 更新 `@gooes/domain` 中涉及 tenant 的基础类型。
- [x] 定义 `TenantStatus`。
- [x] 定义租户基础响应类型。

### 3. AuthorizationService

- [x] `AuthContext` 增加：
  - `tenantId`
  - `tenantName`
  - `tenantSlug`
  - `tenantStatus`
  - `isPlatformAdmin`
- [x] 员工登录时通过 `employees.tenant_id` 关联 `tenants`。
- [x] 员工无租户时返回明确错误。
- [x] 租户状态非 `active` 时，禁止进入普通业务接口。
- [x] 缓存 key 设计检查，避免多租户身份缓存混乱。

### 4. Admin 登录态

- [x] `/admin/auth/me` 返回 tenant 信息。
- [x] admin session 类型增加 tenant。
- [x] admin 顶部或用户信息区域预留公司名称展示。
- [ ] 租户停用时 admin 显示明确提示并退出。

### 5. 小程序登录态

- [x] 后端员工登录响应预留 tenant 信息。
- [x] 小程序端暂不强制改 UI。
- [x] 文档说明小程序后续可在“我的”页展示所属公司。

### 6. 兼容验证

- [ ] 现有 admin 登录正常。
- [ ] 现有客户列表正常。
- [ ] 现有项目列表正常。
- [ ] 现有小程序客户登录正常。
- [ ] 现有 H5 页面访问正常。

## 验收标准

- [ ] 默认租户创建成功。
- [ ] 不同环境可通过 `DEFAULT_TENANT_SLUG` 使用不同默认租户。
- [ ] `employees/customers/projects/properties` 全部有 `tenant_id`。
- [ ] 现有数据全部回填默认租户。
- [ ] 登录后的 `AuthContext` 包含 tenant 信息。
- [ ] admin `/auth/me` 可返回 tenant 信息。
- [ ] 现有业务功能无回归。

## 回滚点

- migration 需要可回滚或至少可通过默认租户兼容旧逻辑。
- 如果登录受影响，优先回滚 `AuthorizationService` 变更。

## 不做事项

- 不做跨租户隔离测试通过要求。
- 不创建第二个真实租户。
- 不改客户/项目 service 的全部查询。
- 不做平台超管页面。
- 不允许新业务在缺少租户上下文时自动写入默认租户。
