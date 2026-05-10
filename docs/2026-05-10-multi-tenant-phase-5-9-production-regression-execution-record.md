# 多租户阶段 5.9 执行记录：生产回归收口

日期：2026-05-10

## 目标

阶段 5H 完成后，对生产环境做上线前回归收口，确认公网入口、核心服务、H5 公开链路和租户隔离验证可用。

## 环境

- 分支：`feature/multi-tenant`
- 生产 commit：`2297353`
- API：`https://api.goodcms.cn`
- Admin：`https://admin.goodcms.cn`
- H5：`https://h5.goodcms.cn`

## 自动 Smoke Test 结果

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| API 根路径 | 通过 | `GET https://api.goodcms.cn/` 返回 200 |
| API 未登录保护 | 通过 | `GET /customers` 返回 401 `TOKEN_MISSING` |
| Admin 登录页 | 通过 | `GET https://admin.goodcms.cn/login` 返回 200 |
| Admin BFF 未登录保护 | 通过 | `/api/backend/customers` 返回 401 `TOKEN_MISSING` |
| H5 静态资源 | 通过 | `GET /assets/main.js` 返回 200 |
| H5 活动列表公开接口 | 通过 | `GET /public/marketing-pages` 返回 200 |
| H5 多租户公开接口代理 | 通过 | `/public/tenants/...` 返回后端 JSON 404，不再误落静态页 |
| 租户 token 身份 | 通过 | `GET /admin/auth/me` 返回租户 `phase5h_verify_a` |
| 租户客户列表 | 通过 | `GET /customers` 返回当前租户数据 |
| 租户访问平台租户列表 | 通过 | 返回 403 |
| 租户访问平台线索列表 | 通过 | 返回 403 |

## 5H 严格隔离复验

命令：

```bash
API_BASE_URL=https://api.goodcms.cn \
STRICT_TENANT_VERIFY=1 \
bun run verify:tenant:phase5h
```

结果：

- `27 passed`
- `0 failed`
- `0 skipped`

## 生产服务状态

服务器 PM2：

- `goose`：online
- `goose-admin`：online
- `goose-social-video-worker`：online

## 已确认的入口边界

- `api.goodcms.cn` 是后端公网 API 入口，反代到 `127.0.0.1:3000`。
- `admin.goodcms.cn` 是后台 UI，反代到 `127.0.0.1:3010`。
- `admin.goodcms.cn/api/backend` 是 cookie 型 BFF 代理，不作为脚本 Bearer token 验证入口。
- `h5.goodcms.cn` 是静态站点，同时保留 `/public/marketing-pages*` 和 `/public/tenants/*` 到后端的同源公开接口代理。

## 需要人工联调的业务项

以下项会涉及真实账号、真实租户或写入生产业务数据，本轮不直接自动执行：

- admin 真实账号登录。
- 平台超管创建新租户。
- 新租户管理员登录 admin。
- 租户停用后管理员登录被拦截。
- 租户重新启用后管理员恢复登录。
- 平台线索手动分配到租户。
- 小程序客户命中单租户、多租户、无租户三种登录链路。
- H5 多租户公开页在小程序 web-view 内打开。

## 测试数据预检查

本轮做了生产库只读预检查，结果如下：

### 租户

当前存在可用于隔离验证的租户：

- `gooes_default`：默认租户，状态 `active`。
- `phase5h_verify_a`：5H 验收租户 A，状态 `active`。
- `phase5h_verify_b`：5H 验收租户 B，状态 `active`。
- `tenant_verify_a`：阶段 3 验收租户 A，状态 `active`。
- `tenant_verify_b`：阶段 3 验收租户 B，状态 `active`。

### H5 活动页

当前可用于 H5 公开页回归的已发布页面：

- `spring-dollar`
- `springsale`

可测试地址：

```text
https://h5.goodcms.cn/p/spring-dollar
https://h5.goodcms.cn/p/springsale
```

### 平台线索

当前 `platform_leads` 统计：

- `new`: 0
- `assigned`: 0
- `invalid`: 0

因此“平台线索手动分配”回归需要先通过小程序访客态或后端接口创建一条测试平台线索。

### 平台超管

当前预检查结果：

- `platform_admin` 角色存在。
- 已将员工“固始”（手机号 `186****5353`）绑定 `platform_admin`。

验证结果：

- `/admin/auth/me` 返回角色包含 `system_admin`、`platform_admin`。
- `GET https://api.goodcms.cn/platform/tenants?page=1&pageSize=5` 返回 200。
- `GET https://api.goodcms.cn/platform/leads?page=1&pageSize=5` 返回 200。

影响：

- 平台超管账号前置条件已满足。
- 后续可继续执行真实 admin 页面回归：租户列表、创建测试租户、停用启用、平台线索分配。

## 结论

生产环境自动化回归通过，阶段 5 后端和公网入口具备继续联调条件。

阶段 6 之前，建议产品/前端按人工联调清单补齐真实账号和小程序链路验证。
