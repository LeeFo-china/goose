# 项目运营风险中心 UI 审核记录

日期：2026-07-14

## 当前结论

当前仅完成静态预审和 production build 验证，尚未完成可替代发布门槛的浏览器 smoke 或 `$impeccable audit` 评分。

阻塞项：

- 本机 Docker daemon 不可用，`supabase status` 无法连接 Docker；
- 当前 shell 未设置 `SUPABASE_DB_DIRECT_URL`、`PROJECT_HEALTH_TENANT_ID`、`PROJECT_HEALTH_ADMIN_TOKEN`、`ADMIN_TOKEN`；
- 缺少可登录 Admin 的租户管理员会话，无法验证真实 `/project-health` 列表、五类跳转、AI POST 和权限差异。

因此本文件暂不记录 Impeccable 分数，不声明 P0/P1 已清零。

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

- Domain contract test：4 pass；
- API project-health/performance 定向测试：47 pass；
- Admin nav/project-health 定向测试：31 pass；
- `packages/domain build`：通过；
- `api:check`：通过；
- `apps/admin check`：通过；
- `apps/admin build`：通过，`/project-health` route 生成成功。

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
3. 验证 GET 首屏 200、pageSize 20、KPI 与 summary 一致；
4. 验证搜索、严重度、风险类型、重置、上一页/下一页同步 URL；
5. 快速切换筛选，确认旧响应不覆盖新结果；
6. 验证五类“去处理”分别进入 `overview/logs/acceptances/customer-service`；
7. 验证 AI 不自动调用，点击后才 POST，AI 失败只影响摘要面板；
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
