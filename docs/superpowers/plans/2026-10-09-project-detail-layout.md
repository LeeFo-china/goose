# 项目详情平铺布局实施计划

**Goal:** 修复长地址挤压和总览横向溢出，按用户批准的方案移除内部档案侧栏与多重卡片。

**Architecture:** 复用现有 Next.js、shadcn 和业务组件。统一项目页头与 URL 页签导航；总览按流程、财务、资料纵向组织。共享组件增加 embedded 展示参数，保持原独立展示和业务操作。

**Tech Stack:** React 19、Next.js 15、Tailwind 3、Bun、Playwright。

- [x] 页头：将 project-detail-side-rail 替换为 project-detail-header；保留返回、状态、刷新与导航，名称可换行，状态不可压缩。
- [x] 总览：去掉重复摘要与固定双列；流程操作置顶，财务和资料使用分隔线。财务内部使用 repeat(auto-fit,minmax(min(100%,24rem),1fr))，按可用宽度布局。
- [x] 展示语义：使用接口 instance_status 判断完成态；合同未收与计划待收明确区分，金额数据与工作流权限不变。
- [x] 验证：先运行现有项目详情基线测试与静态检查；以隔离 mock 后端运行实际页面，覆盖长地址、1280/1440/1920/窄屏、导航、展开明细、刷新与错误态；检查截图与元素溢出。
- [x] 完成：复核 diff、必要测试与类型检查，记录结果并交付本地改动。无数据库迁移，无线上数据写入。

## 根因

顶部资料 dl 的 shrink-0 及未限定宽度与左侧竞争空间。外层 viewport xl 双列加内层财务固定最小列宽，在双侧栏场景无法满足宽度预算。页面重复摘要和层层容器进一步占用有效区域。


## 验证结果（2026-10-09）

- `cd apps/admin && bun run check`：类型、路由类型及文件大小检查通过。
- `bun run test:e2e --config=playwright.project-detail-layout.config.ts`：10/10 通过，使用本地只读模拟后端，不涉及生产租户数据。
- `bun test ./components/projects/project-detail-page-client.test.ts ./components/projects/project-construction-stages-panel.test.ts ./components/projects/project-workflow-runtime-panel.test.ts ./components/projects/project-finance-reconciliation-summary-utils.test.ts`：13/13 通过。
- 修复前红灯：1280px 原页面横向溢出；1920px 财务图区宽度占比 0.326；390×600 极长名称下正文仅32px。修复后上述断言通过。
- 截图人工核查：1920/1440/390px 总览、财务明细展开；状态完整、无整页横向滚动、区块无嵌套卡片。
- 审查修正：页头最多占内容工作区45%，超长摘要可滚动，保留正文空间；状态预警移出财务 auto-fit 网格以避免空列；无关联房产时回退项目地址。
- 已有失败：`project-management-page-layout.test.ts:69` 的项目列表 loading class 字符串断言在未修改的主工作区同样失败（9 pass / 1 fail），该文件和对应列表实现均未改动。
- `git diff --check` 通过。无新依赖、数据库迁移或小程序仓库改动；未部署线上。
