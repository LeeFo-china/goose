# 项目运营风险中心 UI 审核记录

日期：2026-07-14

## 当前结论

当前完成静态预审、production build 验证，以及已固化到 Playwright 的本地 mock 数据浏览器 smoke。尚未完成连接 dev 数据库和真实管理员登录态的发布级浏览器 smoke，也尚未执行基于真实截图的 `$impeccable audit` 评分。

阻塞项：

- 本机 Docker daemon 不可用，`supabase status` 无法连接 Docker；
- 当前 shell 未设置 `SUPABASE_DB_DIRECT_URL`、`PROJECT_HEALTH_TENANT_ID`、`PROJECT_HEALTH_ADMIN_TOKEN`、`ADMIN_TOKEN`；
- 缺少可登录 Admin 的租户管理员会话，无法验证真实 `/project-health` 列表、五类跳转、AI POST 和权限差异。

因此本文件暂不记录 Impeccable 分数，不声明 P0/P1 已清零。mock smoke 只证明前端页面结构、RSC 边界、展示页 contract、AI 按需交互和响应式溢出在本地可重复验证。

## 已完成静态证据

命令：

```bash
bun test packages/domain/src/project-operational-risk.test.ts
cd apps/api && bun test \
  src/schema/project-health.test.ts \
  src/repositories/project-operational-risks.test.ts \
  src/services/project-operational-risk-migration-contract.test.ts \
  src/services/project-operational-risk-presentation.test.ts \
  src/services/project-operational-risks.test.ts \
  src/services/project-operational-risk-ai.test.ts \
  src/controllers/project-health/routes.test.ts \
  src/scripts/project-operational-risk-performance-smoke.test.ts
cd apps/admin && bun test \
  components/layout/admin-nav-utils.test.ts \
  components/layout/admin-nav-visibility.test.ts \
  components/project-health/*.test.ts \
  app/'(console)'/project-health/project-health-page-layout.test.ts
pnpm --dir packages/domain build
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

结果：

- Domain contract test：5 pass；
- API project-health/performance 定向测试：47 pass；
- Admin nav/project-health 定向测试：31 pass；
- `packages/domain build`：通过；
- `api:check`：通过；
- `apps/admin check`：通过；
- `apps/admin build`：通过，`/project-health` route 生成成功。

## 本地 mock 浏览器 smoke

环境：

- mock backend：`127.0.0.1:3999`
- Admin dev server：`127.0.0.1:3011`
- mock session：非平台租户管理员
- mock 数据：五类风险各 1 条，summary.total = 5

可复跑命令：

```bash
python3 /Users/leefo/.codex/skills/webapp-testing/scripts/with_server.py \
  --server "node apps/admin/e2e/project-health-mock-backend.mjs" \
  --port 3999 \
  --timeout 45 \
  -- zsh -lc 'cd apps/admin && \
    GOOES_API_BASE_URL=http://127.0.0.1:3999 \
    PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
    pnpm exec playwright test e2e/project-health-smoke.spec.ts --project=chromium'
```

验证项：

- `/project-health` 服务端渲染成功，不再把 icon component 从 server component 传给 client component；
- Admin helper 能接受后端返回的 display page items，包括 `title/description/action`；
- 390、768、1440 三个宽度均无页面级横向溢出；
- 表格视口内能看到风险列表；
- 首屏不自动请求 `ai-summary`，点击“生成 AI 经营摘要”后才 POST；
- AI 摘要面板显示 overview、priority 和 caution；
- 关键词、严重度、风险类型筛选会同步 URL，并刷新为过滤后的列表；
- 重置筛选会回到 `/project-health?page=1` 并恢复完整列表；
- AI 摘要失败只显示摘要错误，风险列表和 KPI 保持可用；
- console error = 0；
- failed response = 0。

结果：

- `apps/admin/e2e/project-health-smoke.spec.ts`：6 passed；
- 首次固化时，390px 视口发现列表卡片被筛选区压缩导致 table viewport 不可见；
- 已通过 `components/project-health/project-health-client-shell.tsx` 的移动端列表卡片保底高度修复，桌面 `lg` 以上仍保持原满高工作台布局。

## 静态 UI 预审

已由源码契约测试覆盖：

- 页面固定在 admin 工作区：`h-[calc(100vh-6.5625rem)]`、`min-h-0`、页面级 `overflow-hidden`；
- 项目风险列表使用单一 Card workspace，Card 内 table viewport 滚动，footer 固定；
- 禁止营销化视觉：无 `bg-gradient`、`backdrop-blur`、`text-transparent`；
- 使用本地 shadcn/Admin 组件：`Input`、`Select`、`Button`、`DataTable`、`StatusAlert`、`Skeleton`；
- AI 摘要只在 client button action 触发，server 首屏不调用 `ai-summary`；
- AI 摘要拥有独立 `aiSummary/aiError/isAiLoading` 状态、独立 `AbortController` 和 request id；
- AI 面板包含 `aria-live="polite"`，错误态使用独立 `StatusAlert`，不清空列表/KPI。

## 待完成浏览器 smoke

需要具备 dev 或本地完整运行条件后补充：

1. 使用具备 `dashboard.read + project.read:all` 的租户管理员登录；
2. 验证导航显示“项目风险”，self/assigned/department scope 用户不显示且 API 403；
3. 使用真实数据验证 GET 首屏 200、pageSize 20、KPI 与 summary 一致；
4. 使用真实数据验证搜索、严重度、风险类型、重置、上一页/下一页同步 URL；
5. 快速切换筛选，确认旧响应不覆盖新结果；
6. 验证五类“去处理”分别进入 `overview/logs/acceptances/customer-service`；
7. 使用真实 API 验证 AI 不自动调用，点击后才 POST，AI 失败只影响摘要面板；
8. 验证 RPC 错误显示 StatusAlert，不显示为风险 0；
9. 捕获 1440、1024、768、390 宽度截图；
10. 完成键盘、焦点、触摸目标和 WCAG AA 对比度 smoke；
11. 基于截图执行 `$impeccable audit`，记录评分、P0/P1、问题和修复 commit。

## 发布门槛

发布前仍需满足：

- Impeccable 总分 >= 16/20；
- P0/P1 = 0；
- 四断点截图无页面级横向溢出；
- 表格横向滚动受控；
- 失败/空状态不误导为风险 0；
- AI 紫色、渐变、玻璃、装饰动画等反模式为 0。
