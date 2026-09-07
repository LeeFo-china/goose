# 库存工具栏精简实施计划

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. 用户已确认方案，并授权在当前 main 提交和 push。

**Goal:** 删除库存页冗余标题、说明和仓库搜索，保留紧凑且完整的库存查询操作。

**Architecture:** 沿用 InventoryWorkspace、InventoryWarehouseFilter 和现有列表接口。仓库筛选使用本地 Radix DropdownMenu 的单选项及分页操作，分页仅在展开时、多页时展示；每页仍请求 20 条，不做全量加载。权限、库存搜索、下钻、错误重试、列表分页保持不变。

**Tech Stack:** Next.js、React、shadcn/Radix、Tailwind、Bun、Playwright。

## 已确认设计与边界

- 删除可见“仓库库存”标题和副标题，保留现有导航和两种库存视图。
- 删除仓库名称搜索及防抖状态。选中仓库名称跨页保留，停用仓库仍可查看库存。
- 工具栏桌面单排、小屏换行，控件统一 36px；分页与表格滚动结构不变。
- 无仓库目录权限继续只显示仓库名称及下钻提示，不请求目录。
- 不修改后端、数据库、orange、小程序或生产配置，不新增依赖。
- 使用 impeccable 的 distill/product 原则；design-taste-frontend 的保留式审查原则适用，营销版式不适用。布局变化 2、动效 1、密度 7，保留现有语义色和字体。

## 实施与验证

- [x] 在 `apps/admin/components/inventory/inventory-workspace.test.tsx` 增加服务端渲染断言：`expect(markup).not.toContain('<h1')`、不含副标题、仓库搜索或折叠态分页。
- [x] 运行 `cd apps/admin && bun test ./components/inventory/inventory-workspace.test.tsx`，确认新增断言先失败。
- [x] 修改 `inventory-workspace.tsx`：移除标题区，压缩 CardHeader 与网格间距，对齐搜索和操作按钮。
- [x] 修改 `inventory-warehouse-filter.tsx`：删除 keyword、防抖 effect；以 `loadInventoryWarehouses(canViewWarehouses, { page, keyword: '' }, signal)` 分页读取。复用 DropdownMenuRadioGroup/RadioItem，分页 Item 的 onSelect 调用 `event.preventDefault()` 后更新 page，保持展开；加载、失败重试放在面板内部。
- [x] 更新 `apps/admin/e2e/inventory-workspace.spec.ts`：用 tab 定位页面；检查展开前分页不可见，展开后跨页选择停用仓库，Escape 返回焦点，单页不显示分页，失败可重试；保留库存全量回归。
- [x] 必要的 mock 场景只加入现有 `inventory-mock-backend.mjs`，不得更改生产接口。
- [x] 从 `apps/admin` 分进程运行库存各 `*.test.ts*`，运行 `bun run check`，确认类型通过后运行 `bunx playwright test --config=playwright.inventory.config.ts`。
- [x] 查看桌面、375px 和展开面板截图，检查长名称、文字与按钮溢出、键盘操作；运行 `bun run build`。
- [ ] 审查 `git diff --check` 和逐文件 diff，仅暂存本任务文件，提交 `fix(inventory): 精简库存筛选工具栏`，普通 push 到 origin/main，不强推。

## 发布边界

Push main 会触发现有镜像构建及其成功后的开发自动部署；本任务不手动触发生产发布。既有 `.artifacts/` 保留，不纳入提交。
