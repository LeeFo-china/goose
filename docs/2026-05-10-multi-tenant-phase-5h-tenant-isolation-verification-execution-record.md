# 多租户阶段 5H 执行记录：多租户隔离验收

日期：2026-05-10

## 目标

补齐阶段 5 的最后上线前验收项：确认新租户和普通租户账号不能看到默认租户或其它租户的数据。

## 已完成

- 新增可重复执行的验收脚本：
  - `scripts/verify-phase5h-tenant-isolation.ts`
- 新增可重复构造 A/B 租户验收数据的 seed 脚本：
  - `scripts/seed-phase5h-tenant-verification.ts`
- 新增 package 命令：
  - `bun run seed:tenant:phase5h`
  - `bun run verify:tenant:phase5h`
- 更新阶段 5 todo，将“新租户看不到默认租户数据”标记为已完成。
- 新增 admin / 小程序影响文档。
- 修复 `GET /customers/:id/detail` 跨租户空结果返回 500 的问题，现在返回 404。

## 验收覆盖范围

脚本覆盖列表接口隔离：

- 客户：`GET /customers`
- 项目：`GET /projects/status`
- 员工：`GET /employees`
- 部门：`GET /departments`
- 岗位：`GET /posts`
- 角色：`GET /roles`
- 费用：`GET /expense-requests`
- 工序验收：`GET /project-acceptances`
- 施工日志项目列表：`GET /project_logs/projects`
- 摄像头：`GET /project-cameras/projects`
- 营销页：`GET /marketing-pages`
- H5 线索：`GET /marketing-leads`
- 员工拓客链接：`GET /tenant-share-links`
- 通知：`GET /notifications`
- 待办：`GET /task-center/todos`
- 自媒体脚本：`GET /admin/social-video/scripts`
- 自媒体用量：`GET /admin/social-video/usage-summary`

脚本覆盖跨租户详情访问防护：

- 客户详情
- 项目详情
- 费用详情
- 工序验收详情
- 营销页详情
- 短视频转写详情
- 摄像头播放参数

脚本覆盖平台能力隔离：

- 普通租户不能访问 `/platform/tenants`
- 普通租户不能访问 `/platform/leads`
- 普通租户不能访问 `/platform/audit-logs`

## 使用方式

最小运行：

```bash
API_BASE_URL=https://api.goodcms.cn \
TENANT_VERIFY_TOKEN=<租户账号 token> \
bun run verify:tenant:phase5h
```

建议运行：

```bash
API_BASE_URL=https://api.goodcms.cn \
TENANT_VERIFY_TOKEN=<新租户或租户A账号 token> \
TENANT_OWN_PROJECT_ID=<当前租户项目ID> \
TENANT_FORBIDDEN_IDS=<默认租户或租户B的关键资源ID,逗号分隔> \
TENANT_OTHER_CUSTOMER_ID=<其它租户客户ID> \
TENANT_OTHER_PROJECT_ID=<其它租户项目ID> \
TENANT_OTHER_EXPENSE_REQUEST_ID=<其它租户费用ID> \
TENANT_OTHER_PROJECT_ACCEPTANCE_ID=<其它租户验收ID> \
TENANT_OTHER_CAMERA_ID=<其它租户摄像头ID> \
TENANT_OTHER_MARKETING_PAGE_ID=<其它租户营销页ID> \
TENANT_OTHER_SOCIAL_VIDEO_TRANSCRIPTION_ID=<其它租户转写任务ID> \
bun run verify:tenant:phase5h
```

严格模式：

```bash
STRICT_TENANT_VERIFY=1 bun run verify:tenant:phase5h
```

严格模式下，任何 skipped 检查都会使进程退出码为 1，适合 CI 或上线前验收。

构造测试数据并输出本地验证环境变量：

```bash
bun run seed:tenant:phase5h --format=shell > /tmp/gooes-phase5h.env
```

本地严格验收：

```bash
set -a
source /tmp/gooes-phase5h.env
set +a
API_BASE_URL=http://127.0.0.1:3000 \
STRICT_TENANT_VERIFY=1 \
bun run verify:tenant:phase5h
```

## 判断规则

列表接口：

- 2xx 且响应中不包含 `TENANT_FORBIDDEN_IDS`：通过。
- 2xx 但响应中包含禁止出现的其它租户资源 ID：失败。
- 403 且该接口需要业务权限：跳过。
- 其它非 2xx：失败。

详情接口：

- 访问其它租户资源返回 400 / 403 / 404：通过。
- 返回 2xx：失败。

平台接口：

- 普通租户访问 `/platform/*` 返回 400 / 403 / 404：通过。
- 返回 2xx：失败。

## 与阶段 3 脚本关系

阶段 3 已有：

- `scripts/seed-phase3-tenant-verification.ts`
- `scripts/verify-phase3-tenant-isolation.ts`

阶段 5H 的脚本兼容阶段 3 环境变量：

- `TENANT_A_TOKEN`
- `TENANT_B_FORBIDDEN_IDS`
- `TENANT_B_*`

因此可以复用阶段 3 的 fixture 数据做更大范围验收。

## 当前验证结果

本轮已构造 A/B 租户数据并执行本地严格模式：

- `bun run seed:tenant:phase5h --format=shell > /tmp/gooes-phase5h.env` 通过。
- `API_BASE_URL=http://127.0.0.1:3000 STRICT_TENANT_VERIFY=1 bun run verify:tenant:phase5h` 通过。
- `bun run api:typecheck` 通过。
- `git diff --check` 通过。
- 验收结果：`27 passed, 0 failed, 0 skipped`。

线上发布后，建议再用生产 API 地址执行一次同样的严格模式验收。

## 生产验证结果

`feature/multi-tenant` 已加入生产部署分支，并在提交 `b2990f8` 后完成部署。

服务器状态：

- 服务器工作区 commit：`b2990f8`
- `goose`：online
- `goose-admin`：online
- `goose-social-video-worker`：online

通过 SSH tunnel 连接服务器本机 API 执行严格模式：

```bash
API_BASE_URL=http://127.0.0.1:3001 \
STRICT_TENANT_VERIFY=1 \
bun run verify:tenant:phase5h
```

生产进程验收结果：

- `27 passed`
- `0 failed`
- `0 skipped`

## 公开入口排查与修复

### `https://api.goodcms.cn`

已完成公网 API 入口配置，可以作为 5H 脚本验证入口。

修复前排查结果：

- 公网访问表现为 TLS 握手阶段连接断开。
- 服务器侧 `getent hosts api.goodcms.cn` 无解析结果。
- nginx 配置中没有 `api.goodcms.cn` 的 `server_name`。
- 服务器本机 `http://127.0.0.1:3000/` 正常返回。

已完成修复：

- DNS 已解析到服务器。
- 新增 `api.goodcms.cn` nginx server block。
- 反向代理到 `127.0.0.1:3000`。
- 已通过 certbot 签发并绑定 HTTPS 证书。
- `https://api.goodcms.cn/` 正常返回 `{"hello":"world"}`。
- 未登录访问 `https://api.goodcms.cn/customers` 正常返回 `TOKEN_MISSING`。

公网 API 严格模式验收：

```bash
API_BASE_URL=https://api.goodcms.cn \
STRICT_TENANT_VERIFY=1 \
bun run verify:tenant:phase5h
```

结果：

- `27 passed`
- `0 failed`
- `0 skipped`

### `https://h5.goodcms.cn`

H5 页面仍保持静态部署：

- 静态文件目录：`/var/www/h5.goodcms.cn`
- 静态资源：`https://h5.goodcms.cn/assets/main.js`

同时保留 H5 同源公开接口代理：

- `/public/marketing-pages` -> `127.0.0.1:3000`
- `/public/marketing-pages/*` -> `127.0.0.1:3000`
- `/public/tenants/*` -> `127.0.0.1:3000`

原因：

- H5 当前 `config.js` 使用 `apiBaseUrl: ""`，即默认同源请求。
- 微信小程序 web-view 已配置 `h5.goodcms.cn`，同源公开接口可减少跨域和小程序 request 域名配置成本。
- 新增 `/public/tenants/*` 是为了支持多租户 H5 地址的公开接口。

### `https://admin.goodcms.cn/api/backend`

当前不适合作为 5H 脚本的直接 Bearer token 验证入口。

原因：

- admin 的 `/api/backend/[...path]` 是 Next.js BFF 代理。
- 该代理从 admin 登录 cookie 中读取后台 token，再转发到后端。
- 脚本直接请求该代理时没有 admin cookie，因此返回 `TOKEN_MISSING`。

结论：

这是 admin BFF 的预期鉴权行为，不是后端租户隔离失败。

生产 5H 严格验收应优先使用：

- 独立 API 域名：`https://api.goodcms.cn`
- 或服务器本机 API：`127.0.0.1:3000`

## 不包含

- 不自动创建生产验收数据，seed 脚本需人工显式执行。
- 不自动清理生产数据，seed 脚本只清理自身固定 fixture ID。
- 不新增数据库 migration。
