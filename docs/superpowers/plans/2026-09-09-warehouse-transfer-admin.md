# D1 Admin Implementation Plan

> **For agentic workers:** Use subagent-driven-development for Task 1 with SPEC then quality review; main implements disjoint Task 2 with TDD. User delegated confirmations; continue without repetitive approval prompts. Existing isolated feature worktree only.

**Goal:** 交付可验证的调拨 Admin 工作区、来源跳转和独立开关 UI。

**Architecture:** 复用 Next server session、backend-client、Domain transfer DTO、冻结命令存储和既有库存/仓库选择器。页面组合现有 Field/Button/StatusAlert/FormSelect，不新增依赖或业务引擎。

**Tech Stack:** Bun、Next.js 15、React19、TypeScript、shadcn/Radix、Playwright。

## Task 1：调拨工作区（独立代理）

Create `apps/admin/components/warehouse-transfers/transfer-{rules,api,command}.ts`、`transfer-{workspace,list,detail,draft}.tsx`、相邻 tests、`apps/admin/app/(console)/warehouse-transfers/page.tsx`。允许按明确职责增加 `transfer-types.ts` / `transfer-parts.tsx` / `transfer-command-state.ts`。不改领退料现有文件，不处理导航/库存/平台设置，不提交远端或改DB。

- [x] 阅读 Domain `warehouse-transfer.ts`、API warehouse-transfers service/repository、现有 `warehouse-materials/*`、backend-client、admin-session-scope、frozen command helpers、仓库选择器真实导出。
- [x] 写RED rules/API tests，例 `expect(transferAccess(['inventory.stock.view']).canRead).toBe(true)`、`expect(transferListPath({pageSize:101})).toContain('pageSize=100')`；拒绝同仓、大小写重复SKU、非精确数量。运行 `bun test components/warehouse-transfers`，确认失败原因。
- [x] 最小实现只读API与草稿校验。列表 `GET /warehouse-transfers?page=1&pageSize=20`；明细 `GET /warehouse-transfers/:id/items`，完整编辑读取100并校验total/item_count/去重/单据归属。复用Domain类型，不猜字段。
- [x] 命令先写RED回执测试，再实现 `POST /warehouse-transfers/:id/{save-draft|submit|complete|cancel}` 与 `Idempotency-Key`；body为精确草稿或 `{expected_version}`。冻结存储path/body/key/orderId并验证恢复记录，未知结果保留，409重读。覆盖ID/动作/状态/版本不一致回执拒绝。
- [x] 实现状态/权限/开关门控工作区，列表/详情独立分页，草稿源仓SKU选择，二次确认，AbortController/session key防串线。详情明确成本待确认/已冻结；只读用户没有写入口。
- [x] 单测、`bun run check` 最小静态检查通过后交主代理做浏览器集成，SPEC审查通过后质量审查；主代理集中提交。

## Task 2：设置、来源、入口（主代理）

Modify `components/suppliers/supplier-types.ts`、`supplier-settings-api.ts`、`components/platform-tenants/tenant-supplier-settings-{rules.ts,card.tsx}` 及 tests；`components/inventory/inventory-{types.ts,table.tsx,workspace.tsx}` 及 tests；`components/layout/menu-config.ts`（仅确认当前菜单配置支持后增加入口）。

- [x] 添加来源RED：transfer对象渲染 `调拨单 DB001` 和 `/warehouse-transfers?order_id=...`，不出现采购链接或undefined。读权限不借用项目权限。
- [x] 添加设置RED：`canToggleSupplierRolloutFlag(settings,'warehouse_transfers_enabled')` 独立于采购/领退料；`hasEnabledSupplierRolloutFlags({...settings,warehouse_transfers_enabled:true})` 阻止关闭module。请求新字段合并current，旧冻结body保持原样。
- [x] GREEN类型加optional boolean、intent `warehouseTransfersEnabled?: boolean`、request `warehouse_transfers_enabled: intent.warehouseTransfersEnabled ?? current.warehouse_transfers_enabled ?? false`，卡片新增字段/文案/defaultfalse；不改变旧字段规则。
- [x] GREEN库存新增四字段source union和专用分支：`if ('transfer_order_id' in source)` 渲染调拨链接。库存和侧栏入口受stock.view门控，不默认启用功能。
- [x] 运行受影响Bun测试、Admin check，独立SPEC→quality审查。

## Task 3：浏览器、发布与真实验收

Create `apps/admin/e2e/warehouse-transfers-{mock-backend.mjs,workflow.spec.ts}`、`playwright.warehouse-transfers.config.ts`；按既有e2e fixture会话/分页/错误协议实现，不修改生产认证。视共享数据拆独立fixture文件。

- [x] 先静态检查，再运行桌面+375px Playwright：草稿→提交→完成、取消、只读/无权限/开关关闭、库存不足/409、未知结果重试、详情分页与不完整禁止编辑、来源链接、源仓切换、会话隔离；断言实际请求body/key和UI，不只断言mock状态。
- [x] 回归库存及rollout受影响测试，截图审查布局/键盘/文本/横向溢出；无失败后固定release SHA，推送功能/新release分支。
- [x] 检查DEV604条对齐及磁盘，发布Admin（本批无API变更时不重发API），等待workflow完成及容器SHA/HTTP验证。
- [ ] Chrome真实会话只读核对租户/员工权限/仓库/SKU条件。具备权限时通过UI开启目标租户测试开关并用明确测试库存执行正常闭环/反向调拨，读取库存价值守恒与无项目成本/应付变化；结束关闭开关。缺少任一必要权限时不自动授权，只记录阻塞。
- [x] 记录真实/模拟测试边界、发布证据、未完用例与D1状态；提交文档，保留工作树，不进入D2直到D1验收条件满足。

发布结果：`e20387a1` / run `34298832069` success；40项单测、60项本地浏览器回归通过。Chrome接管/导航超时，真实租户业务验收待恢复连接后继续；调拨开关保持关闭。证据见 `docs/operations/evidence/2026-09-09-warehouse-transfer-admin-dev-release.md`。
