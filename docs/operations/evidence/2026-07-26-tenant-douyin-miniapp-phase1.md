# 租户抖音小程序工作台 Phase 1 验证证据

## 验证范围

- 租户侧抖音小程序只读工作台
- 租户权限与导航可见性
- 内部租户名称和小程序公开品牌分离
- 公开案例、在建工地、有效服务区域计数
- 授权、公开资料和版本状态展示
- 单租户仅允许一个活跃商家安装的数据库约束
- 租户响应敏感字段边界

## 代码基线

| 内容 | 提交 |
| --- | --- |
| 基础权限与唯一索引 migration | `d98d394f` |
| 租户安全仓储 | `6ba45f2a` |
| 租户工作台 API | `dae70bd3` |
| Admin 工作台 | `64bb0d86` |
| 公开资料审核状态补强 | `48d7770f` |
| 系统管理员抖音权限上下文修复 | `0508e3bb` |
| 租户工作台根路由注册修复 | `e62cf869` |

分支：`feature/douyin-decoration-miniapp`

## 自动化验证

执行日期：2026-07-26（Asia/Shanghai）

### 聚焦 API 测试

```text
bun test src/services/tenant-douyin-miniapp \
  src/repositories/tenant-douyin-miniapp-workspace.test.ts \
  src/controllers/tenant-douyin-miniapp

13 pass
0 fail
44 expect() calls
```

覆盖：

- 从认证上下文派生租户，不接受调用方传入租户 ID
- 强制 `douyin_miniapp.read`
- 未授权工作台
- 内部租户名称和公开品牌分离
- 安装与版本安全字段投影
- 公开内容计数只执行 head count 查询
- 租户不存在时关闭失败

### Admin 组件与页面契约

```text
bun test components/douyin-miniapp \
  components/layout/admin-nav-utils.test.ts \
  components/layout/admin-nav-visibility.test.ts

全部通过
```

组件 SSR 契约覆盖：

- 无权限
- 加载失败
- 未授权
- 已授权且体验测试中
- 公开资料待审核
- 最近版本审核驳回
- 超长公开品牌名
- 单层 Card
- 窄屏所需的换行、最小宽度和纵向滚动类
- 不渲染平台密钥或令牌字段

### 包级门禁

```text
bun run api:check
PASS

pnpm --dir apps/admin check
PASS

bun run check:permission-boundaries
PASS
```

具体结果：

- API TypeScript：通过
- API Build：通过
- API 文件大小：通过
- Admin route type generation：通过
- Admin TypeScript：通过
- Admin 文件大小：780 个 TS/TSX 文件均不超过 500 行
- 权限边界检查：通过

### 响应敏感字段扫描

扫描生产响应 schema 与 Admin 组件，排除测试文件：

```text
deployment_key
access_token
refresh_token
ciphertext
component_app_secret
```

结果：0 个匹配。

## 真实开发数据运行态验证

migration 执行后，首次使用真实开发租户身份调用工作台 service 时发现：

```text
NO_BOUND_EMPLOYEE_WITH_DOUYIN_READ_PERMISSION
```

只读分层诊断确认：

- 当前唯一活跃商家安装对应租户有 1 名活跃员工；
- 该员工已绑定登录用户；
- 该员工角色为 `system_admin`；
- 数据库 `role_permissions` 已正确包含七项租户抖音权限；
- 但派生的 `AuthContext` 中没有 `douyin_*` 权限。

Root Cause：

租户 `system_admin` 的权限上下文不读取 `role_permissions`，而是直接使用
`@gooes/domain` 的静态 `PERMISSION_CODE_VALUES`。Phase 1 migration 已写入
数据库权限，但共享领域权限清单未同步，导致真实登录上下文遗漏新权限。

修复：

- 在共享领域权限清单和配置中补齐七项租户抖音权限；
- 增加领域权限契约测试；
- 增加系统管理员派生上下文测试；
- 未修改数据库数据、角色分配或授权逻辑。

修复后验证：

```text
domain permissions: 10 pass, 0 fail
system administrator Douyin permissions: 1 pass, 0 fail
focused API tests: 14 pass, 0 fail
```

真实开发库只读调用安全摘要：

```json
{
  "contextTenantMatchesInstallation": true,
  "hasReadPermission": true,
  "authorizationState": "active",
  "releaseState": "testing",
  "profileStatus": "published",
  "hasDistinctInternalAndPublicNames": true,
  "publicContent": {
    "cases": 1,
    "sites": 1,
    "active_service_areas": 1
  },
  "hasLatestRelease": true
}
```

该摘要未输出租户 ID、员工 ID、手机号、AppID、Token、密钥或运行时配置。

### 本地真实 HTTP smoke

首次启动当前分支 API 后，真实登录已包含新权限，但
`GET /tenant/douyin-miniapp/workspace` 返回 404。服务器路由树确认该路径未注册。

Root Cause：

controller 自身的装饰器注册测试通过，但新 controller 没有导入并注册到
`apps/api/src/routes/index.ts`。原测试只验证了 controller 的局部路由元数据，
没有验证根路由注册表。

修复：

- 将 `TenantDouyinMiniappController` 加入根路由注册表；
- 增加根注册表契约测试；
- 重启本地 API 后重新执行真实登录与 HTTP 请求。

修复后安全摘要：

```json
{
  "unauthenticatedStatus": 401,
  "loginStatus": 200,
  "loginHasReadPermission": true,
  "workspaceStatus": 200,
  "authorizationState": "active",
  "releaseState": "testing",
  "publicProfileStatus": "published",
  "distinctInternalAndPublicNames": true,
  "secretBoundaryClean": true
}
```

HTTP smoke 在脚本内部使用测试租户员工手机号和短生命周期登录 Token，不打印、
不落盘、不提交任何手机号或 Token。登录会按现有开发登录流程更新既有登录上下文与
身份关系，但未修改租户业务资料、小程序安装、版本或公开内容。

## 开发数据库 migration

目标：

- Supabase 项目：`gooes-dev`
- Project ref：`fclnkyatvfvmzgzdqlba`
- 环境来源：`/Users/leefo/Public/work/gooes/.env`

执行文件：

```text
20260726100000_tenant_douyin_workspace_foundation.sql
```

只读预检：

```json
{"activeMerchantInstallations":1,"duplicateTenantCount":0}
```

Dry run 仅列出上述一份 migration。执行结果：

```text
Applying migration 20260726100000_tenant_douyin_workspace_foundation.sql...
Finished supabase db push.
```

执行后 `supabase migration list`：

```text
20260726100000 | 20260726100000 | 2026-07-26 10:00:00
```

Local/Remote 已对齐。

回滚边界：

1. 先停止依赖新权限的租户工作台入口。
2. 删除 `douyin_miniapp_installations_one_active_merchant_per_tenant` 部分唯一索引。
3. 仅删除 migration 中列明的七个角色权限绑定与权限码。
4. 不删除任何安装、版本、租户或公开内容数据。

## 浏览器验证状态

本次会话在 2026-07-26 尝试连接浏览器时，运行时返回无可用浏览器，浏览器列表为空。为避免把源码检查冒充视觉验收，本证据不附伪造截图，也不把真实浏览器 smoke 标记为完成。

待浏览器恢复后需补充：

1. 有 `douyin_miniapp.read` 权限的租户工作台宽屏截图。
2. 无权限状态。
3. 未授权状态。
4. 公开资料待审核状态。
5. 最近版本审核驳回状态。
6. 375px 窄屏无横向溢出。

在补齐上述截图前，Phase 1 的代码、测试和开发库 migration 已完成，真实浏览器视觉验收仍待补证。
