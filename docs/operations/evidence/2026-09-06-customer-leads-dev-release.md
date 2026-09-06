# 客户线索开发环境发布记录

日期：2026-09-06。仅开发环境；不发布生产、不合并 main、不修改 orange、不发布 npm registry。

## 版本与发布范围

- 功能分支：`feature/customer-leads-foundation`。
- 功能提交：`d1d29a09c8331863ea5b3e4d99d3e3e1208114f5`。
- 原开发基线：`28d1ae3761766093d3cffe2c8547c743e5e7c202`。
- 发布流程：[Release Dev 34016423164](https://github.com/LeeFo-china/goose/actions/runs/34016423164)，请求服务 `api,admin`，操作 `release`。
- 发布状态：成功。运行时间 2026-09-06 14:24:59–14:33:04（北京时间）；API、Admin 部署及各自健康检查均通过。
- 流程采用同次运行的不可变镜像证据：构建 → migration history 门禁 → API 部署及健康检查 → Admin 部署及健康检查。未请求 H5、Web 或 worker 发布。

## 发布前验证

- API 类型检查、构建（957 modules）、权限边界检查：通过。
- API 客户线索/旧抖音相关测试：8 个文件、44 项、202 次断言，全部通过。
- Admin 类型检查、文件大小检查：通过，1376 个 TS/TSX 文件均在 500 行以内。
- Admin 新旧工作台测试：4 个文件、42 项、173 次断言，全部通过。
- 浏览器工作流回归：8 项通过，27.8 秒；使用本地合成后端，不写远端业务数据。
- Domain build、packed consumer：通过；基础契约 77 项检查通过。
- `1.20.0` 交付包 SHA-256 仍为 `f7cd89002cea94b713825f32edccf365fc5252fba940ebd3d38bcfcd4c97a5f0`。
- `git diff --check` 和提交前文件大小钩子：通过。

执行浏览器回归时，首次将 `--cwd` 传给 `bunx` 导致其误将目录解析为包名、返回下载 404；该次未启动测试。改用项目已安装的 `pnpm exec playwright test --config playwright.customer-leads.config.ts`（工作目录 `apps/admin`）后 8 项通过，没有修改依赖或业务代码。

## 数据库

使用项目受控命令 `bun run supplier:purchasable-sku:migration:list:dev-direct`，目标开发库 `api-dev`；不打印连接串或凭证。

579 条 Local/Remote 完全对齐，差异 0。本轮没有应用 migration 或执行远端业务写入。此前已应用的两项本次纳入上述功能提交：

- `20260906040943_tenant_customer_lead_permissions.sql`
- `20260906043943_tenant_customer_lead_commands.sql`

历史事务、权限和 SQL 证据见 [后端记录](./2026-09-06-customer-leads.md)。数据库回退采取前向修复，不删除新增普通跟进、来源或幂等流水。

## 发布前实际 HTTP 基线

使用现有开发发布流程配置的租户 Admin smoke 账号，经正常开发登录取得会话；不保存或输出手机号、token、Cookie、客户个人信息。

| 请求（经 Admin BFF） | 发布前结果 |
|---|---|
| `GET /tenant/douyin-miniapp/leads?page=1&pageSize=20` | 200，分页总数 2 |
| `GET /tenant/customer-leads?page=1&pageSize=20` | 404，`ROUTE_NOT_FOUND` |

账号配置读取自 GitHub repository variable；environment variable 查询返回 404 后核对了实际配置层级。未创建账号或调整角色权限。

## 发布后实际检查

正式开发 API 地址为 `https://api-dev.goodcms.cn`，Admin 地址为 `https://admin-dev.goodcms.cn`。地址已从构建/部署配置与实际 HTTPS 请求核对，不是从数据库主机名推测。

经开发登录取得现有验收账号的 Bearer 员工会话，直接请求 API：

| 检查 | 实际结果 |
|---|---|
| 新旧线索分页列表 | 均 200、总数 2，逐项 lead ID 及顺序一致，各自严格 DTO 适配通过 |
| 新旧详情、预约、跟进历史 | 均 200，各自严格 DTO 适配及分页校验通过 |
| 新旧分配候选、负责人筛选选项 | 均 200，分页大小 20、结果数量不超过 20 |
| `source=douyin_miniapp` | 200，通用 DTO 校验通过 |
| `page=10000&pageSize=20` | 200、空列表，保留所请求分页 |
| `pageSize=101`、`source=xiaohongshu` | 400，`VALIDATION_ERROR` |
| 不存在的线索 ID | 404，`CUSTOMER_LEAD_NOT_FOUND` |
| 新旧接口无 Bearer | 401，`TOKEN_MISSING` |

随后用无头 Chromium 经正常 Admin 登录访问实际开发站点：`/customer-leads` 与 `/douyin-miniapp/leads` 均 HTTP 200，正确标题，各显示 2 条线索，均可打开详情面板，页面 JavaScript 异常数 0。未点击任何业务提交按钮；不保存真实客户截图或会话状态。

本次遵循现有 Release Dev 的 API 健康检查 → Admin 顺序。业务级新旧接口 smoke 在整体部署后完成，未改动发布工作流来增加线索专用门禁。

## 不可变制品证据

已下载核对同一运行的 `dev-build-plan`、两个 `image-manifest` 和 `auto-predeploy-migration-d1d29a09c8331863ea5b3e4d99d3e3e1208114f5`。提交、运行 ID、环境一致，构建/部署清单仅 `api,admin`；migration evidence 的 `migration_history_aligned=true`。

- API digest：`sha256:e8975b66066dd5d7e964599ea0235e641008269858f4db26444869e9d2242777`。
- Admin digest：`sha256:e29da03d84529aa0588c01ca26e47a52def7f31bb6be29339836cc3c35cf06ff`。
- 实际部署工作流同时验证容器健康状态、配置镜像 digest、镜像 revision 和构建运行 ID；两项部署 job 均 success。

若需要应用回退，应另行确认目标版本后通过现有 Release Dev 的 rollback 操作执行，不直接 SSH 改容器。本轮未回退服务，也未更改数据库。

## 未验证边界

微信页面由 orange 团队实施；真机、双账号/双端并发、普通角色 self/department/all 的完整远端矩阵及真实远端写命令验收不能以本轮单个 Admin 账号的只读检查或 mock 测试代替。本轮不对现有客户线索执行分配、转客户、跟进、标无效等业务变更；也未新增账号或扩大普通角色权限。
