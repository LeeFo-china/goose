# Admin Playwright E2E 引入执行文档

日期：2026-05-27

## 背景

Admin 前端存在大量弹窗、下拉、表格和客户端交互。仅依赖 `curl`、构建和代码扫描无法确认 hydration 后的真实点击、输入、弹窗展示和浏览器运行错误。

本次引入 Playwright，作为 admin 前端验收和回归测试工具。

## 目标

- 在 `apps/admin` 内安装 Playwright 测试依赖。
- 只安装 Chromium 浏览器，先控制依赖体积。
- 新增 admin e2e 配置和首批 smoke 用例。
- 覆盖登录、组织架构页面访问、配置岗位弹窗、搜索或新增岗位输入。
- 不在测试中创建真实岗位，避免污染业务数据。

## 非目标

- 不引入全仓库 e2e 框架。
- 不改 API 服务测试体系。
- 不做完整业务数据准备器。
- 不把 e2e 作为构建脚本的强制前置步骤。

## 阶段 1：依赖安装

### 执行范围

- 在 `apps/admin` 安装 `@playwright/test`。
- 安装 Chromium 浏览器。

### 验收

- `apps/admin/package.json` 包含 `@playwright/test`。
- `pnpm --dir apps/admin exec playwright --version` 可运行。

### 执行记录

2026-05-27：

- 已执行 `pnpm --dir apps/admin add -D @playwright/test`。
- 已执行 `pnpm --dir apps/admin exec playwright install chromium`。
- Chromium 下载到本机 Playwright cache，仅作为本地测试运行时依赖。

### 验收记录

2026-05-27：

- `apps/admin/package.json` 已包含 `@playwright/test`。
- `pnpm --dir apps/admin exec playwright --version` 返回 `Version 1.60.0`。

## 阶段 2：配置和脚本

### 执行范围

- 新增 `apps/admin/playwright.config.ts`。
- 新增 e2e 测试目录。
- 增加 admin package scripts：
  - `test:e2e`
  - `test:e2e:headed`
  - `test:e2e:ui`

### 验收

- Playwright 配置默认使用独立端口 `http://127.0.0.1:3011`，避免复用 3010 上可能过期的本地 admin 服务。
- 配置可复用已有 3011 测试服务，也可在没有服务时自动启动 `next dev -p 3011`。
- Playwright 的 dev 产物必须写入独立目录，不能覆盖 production `.next`。
- 测试报告、截图、trace 输出目录不进入业务源码。

### 执行记录

2026-05-27：

- 新增 `apps/admin/playwright.config.ts`。
- 新增 `apps/admin/e2e/` 测试目录。
- `apps/admin/package.json` 新增：
  - `test:e2e`
  - `test:e2e:headed`
  - `test:e2e:ui`
- `.gitignore` 新增：
  - `apps/*/.next-e2e`
  - `playwright-report`
  - `test-results`

### 验收记录

2026-05-27：

- Playwright 默认 baseURL 为 `http://127.0.0.1:3011`。
- webServer 使用 `node scripts/playwright-dev-server.mjs`。
- `apps/admin/next.config.ts` 支持 `NEXT_DIST_DIR`，默认仍使用 `.next`。
- `apps/admin/scripts/playwright-dev-server.mjs` 负责用 `NEXT_DIST_DIR=.next-e2e` 启动 `next dev -H 127.0.0.1 -p 3011`，并在运行期间恢复 Next 自动改写的 `next-env.d.ts` / `tsconfig.json`。
- `test-results` 和 `playwright-report` 不进入 `git status --short`。

## 阶段 3：首批用例

### 执行范围

- 登录租户 admin 账号 `18800000001`。
- 访问 `/dashboard` 和 `/organization`。
- 打开组织架构中的“配置岗位”弹窗。
- 验证“搜索或新增岗位”输入可见。
- 输入一个不存在的岗位名，验证出现“创建并加入当前部门”入口，但不点击创建。
- 输入已有岗位名，验证不出现“创建并加入当前部门”入口，避免重复创建。

### 验收

- `pnpm --dir apps/admin test:e2e` 通过。
- 用例不产生新增岗位或其他业务写入。

### 执行记录

2026-05-27：

- 新增 `apps/admin/e2e/admin-smoke.spec.ts`。
- 用例通过 `page.request.post("/api/auth/login")` 登录租户管理员。
- 用例访问 `/dashboard` 和 `/organization`。
- 用例点击“配置岗位”，验证“搜索或新增岗位”输入。
- 用例读取已有岗位并回填，验证同名岗位不会出现创建入口。
- 用例输入 `临时验收岗位X`，只验证“创建并加入当前部门”入口出现，不点击创建入口。

### 验收记录

2026-05-27：

- `pnpm --dir apps/admin test:e2e` 通过。
- 用例未调用岗位创建动作，不产生业务写入。

## 阶段 4：回归

### 执行范围

- 执行 admin 构建。
- 执行 e2e。
- 执行 `git diff --check`。

### 验收

- `bun run admin:build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过。
- `git diff --check` 通过。
- 工作区只包含本次 admin e2e 引入、配置岗位交互优化和相关文档。

### 执行记录

2026-05-27：

- 曾发现 3010 旧 standalone 服务在重新构建后可能引用旧 chunk manifest，导致页面 SSR 可见但客户端点击未接管。
- 已将 e2e 默认端口调整为 3011，避免测试误复用日常 admin 服务。
- 已将 Playwright dev 构建目录调整为 `apps/admin/.next-e2e`，避免覆盖 production `.next` 和 standalone 静态资源。
- 已增加 Playwright dev server 包装脚本，避免 Next dev 的类型文件自动改写残留到工作区。
- 新增 `apps/admin/scripts/verify-standalone-css.mjs` 和 `verify:standalone-css` 脚本，验证 `/login` 引用的 CSS 都能返回 200 且内容不是异常空文件。

### 验收记录

2026-05-27：

- `bun run admin:build` 通过。
- `pnpm --dir apps/admin test:e2e` 通过，结果 `1 passed`。
- `pnpm --dir apps/admin verify:standalone-css` 通过，CSS `/_next/static/css/c51c8822ddfaeb40.css` 返回 200，大小 56819 bytes。
- `git diff --check` 通过。
- e2e 后确认 `apps/admin/.next/standalone/apps/admin/server.js` 仍存在，说明测试没有再污染 production `.next`。
- e2e 后确认 `apps/admin/next-env.d.ts` 和 `apps/admin/tsconfig.json` 无残留 diff。
- admin 服务 `http://127.0.0.1:3010` 保持运行。
- 待提交内容范围：
  - admin 配置岗位交互优化。
  - admin Playwright e2e 引入。
  - 相关执行和说明文档。
