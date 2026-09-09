# 盘点 Admin 与 DEV 验收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成盘点后台全流程、平台配置和来源导航，apply、DEV发布并在晴天租户真实验收。

**Architecture:** 以已交付的盘点 API / Domain 为契约，复用调拨工作区模式和现有仓库/材料分页选择器。共享确实相同的冻结请求生命周期与分页，不引入通用单据引擎。数据库保持 migration 管理，发布固定候选 SHA。

**Tech Stack:** Bun、TypeScript、Next.js 15/React19、本地 shadcn/Radix、Playwright、Supabase migrations。

---

工作目录 `/Users/leefo/Public/work/gooes/.worktrees/warehouse-project-material-stage-c`。设计：`docs/superpowers/specs/2026-09-09-warehouse-stocktake-admin-design.md`。所有任务遵守设计中的权限、精度、状态、恢复与发布约束。用户统一授权选择推荐的当前会话分任务实现，不暂停询问执行方式。

## Task 1: 盘点工作台及请求可靠性

**Create:** `apps/admin/components/warehouse-stocktakes/stocktake-{rules,api,command-state,command}.ts`、相邻 `.test.ts`；`stocktake-{workspace,list,detail,draft,counts,parts}.tsx`、相邻静态渲染测试；`apps/admin/app/(console)/warehouse-stocktakes/page.tsx`。
**Modify as needed:** 从 `components/warehouse-transfers/transfer-command-state.ts` / `transfer-command.ts` 提取完全相同的存储/生命周期机制至 `components/inventory/frozen-inventory-command.ts` / `use-frozen-inventory-command.ts`，原调拨保留领域适配和兼容导出；共用分页至 `components/inventory/inventory-document-pager.tsx`，调拨维持原具名默认label。不复制整套请求引擎。

- [x] 写入真实规则测试并执行RED：

```ts
import { expect, test } from 'bun:test';
import { validStocktakeQuantity, stocktakeListPath } from './stocktake-rules';
test('实盘零合法，空白不是零且禁止精度溢出', () => {
  expect(validStocktakeQuantity('0')).toBe(true);
  for (const value of ['', ' ', '-1', '1e2', '01', '1.00001', '100000000000000'])
    expect(validStocktakeQuantity(value)).toBe(false);
  expect(validStocktakeQuantity('99999999999999.9999')).toBe(true);
  expect(stocktakeListPath({})).toBe('/warehouse-stocktakes?page=1&pageSize=20');
});
```

Run `cd apps/admin && bun test components/warehouse-stocktakes`，预期新能力缺失导致失败；然后最小实现规则，补齐非有限分页、大小写SKU去重、精确差异、原因边界、权限矩阵与版本上限用例。

- [x] 为API/命令恢复写RED：原始body/path/key、全部六动作目标状态/下一版本、错误或不完整回执不能确认；UUID与API z.uuid一致；完整明细校验≤100、total/list/order.item_count一致、唯一行/SKU、tenant/order/warehouse身份一致；卸载/同scope新实例/更新命令/存储异常安全。保留新重试403等未知性。
- [x] 以 `WarehouseStocktakeOrderSummary` / `WarehouseStocktakeItem` 等 `@gooes/domain` 真实导出实现。接口 `readStocktake<T>(path,signal?)`、`sendStocktake(path,body,key)`、`loadCompleteStocktakeItems(order,signal?)`；草稿和录入禁止Number数量/价格，不发送客户端成本。
- [x] 为草稿/实盘/权限渲染写RED再接入页面。Props使用Domain，不制造另一套单据模型。草稿保存body严格契约；counts分批提交仅非空已填项，明确零；所有未保存数据离开/分页前防丢失。详情每页20、编辑完整最多100；录入可采用有界完整100行表单以避免分页丢失，详情仍分页。
- [x] 工作区按账号/租户/员工scope重建；所有异步读abort/stale guard，unknown冻结且只能原样retry，配置失败新写failclosed，原成功重试允许在开关关闭时继续。所有六动作和冲突/终态按设计实现。确认对话框有标题说明，加载Skeleton、空态Empty、错误StatusAlert，响应式表格局部滚动。
- [x] `cd apps/admin && bun test components/warehouse-stocktakes components/warehouse-transfers` →全通过；`bun run typecheck` 和 `bun run check:file-size` →0错误。记录RED/GREEN证据，提交 `feat: 接入盘点后台工作台`。独立SPEC通过后再质量复核，修复所有重要问题。

Task 1完成：ab0de645 + a285dc1，SPEC/质量通过，37 tests/229 assertions；原调拨E2E32项通过。未保存保护的浏览器历史/外部router.push边界见验收记录，不据此宣称全站导航均被拦截。

## Task 2: 平台开关、库存来源与浏览器回归

**Modify:** `apps/admin/components/layout/menu-config.ts`、`components/inventory/{inventory-workspace.tsx,inventory-types.ts,inventory-table.tsx}`及测试；`components/platform-tenants/tenant-supplier-settings-{card.tsx,rules.ts}`及测试；`components/suppliers/supplier-{types.ts,settings-api.ts,settings-api.test.ts}`。
**Create:** `apps/admin/e2e/warehouse-stocktakes-workflow.spec.ts`、`warehouse-stocktakes-mock-backend.mjs`、`warehouse-stocktakes-mock-fixture.mjs`、`apps/admin/playwright.warehouse-stocktakes.config.ts`。
**Modify:** `apps/admin/e2e/supplier-rollout-{workflow.spec.ts,mock-backend.mjs,mock-fixture.mjs}`。

实施时确认的测试职责拆分：新增`warehouse-stocktakes-recovery.spec.ts`承载恢复/会话隔离，`warehouse-stocktakes-helpers.ts`承载共用页面操作；主workflow保留正常流程，config显式匹配两份spec。避免单文件超过既有预算，不增加功能或通用测试引擎。

- [ ] 对库存两个adjustment方向写渲染RED：断言 `href="/warehouse-stocktakes?order_id=…"` 与“盘点单”；无采购/项目权限仍可链接，null来源不出现采购undefined。菜单和入口只用stock.view。
- [ ] 平台规则/请求RED：module=true且其他子开关false可开盘点；盘点true不能关模块；查看员工开关disabled；已知true在其他设置请求中保留；旧响应缺失且无意图省略新字段；明确false发送false；冻结body不变。

```ts
expect(JSON.parse(build({ moduleEnabled: true }, currentWithStocktake).body)
  .warehouse_stocktakes_enabled).toBe(true);
expect(Object.hasOwn(JSON.parse(build({ moduleEnabled: true }, legacyCurrent).body),
  'warehouse_stocktakes_enabled')).toBe(false);
```

- [ ] 实现上述最小字段、来源分支、菜单及独立控件，现有冻结请求不补字段。修改模块关闭说明包括盘点。
- [ ] 写真实页面E2E及完整HTTP fixture：复用transfer fixture认证结构和本地harness，不测试mock自身。覆盖完整状态链(含显式0/差异原因)、取消、25行详情分页与完整编辑、只读/manage/approve/denied、配置失败/非法/关闭、unknown/非法成功/429原body字节和key重放、刷新/员工切换隔离、版本冲突手动再确认、SNAPSHOT_CONFLICT取消重盘、COST_BASIS_REQUIRED不给输入价格、迟到列表响应、来源跳转。平台独立开关与回执重试在既有supplier-rollout suite增加用例。
- [ ] 首先 `bun run typecheck`；然后 `bunx playwright test --config playwright.warehouse-stocktakes.config.ts` (桌面+375px)、`bunx playwright test --config playwright.supplier-rollout.config.ts` 和调拨回归。预期全部通过。检查截图和页面宽度、对话框可达性；`bun run build` →成功。保存证据并提交 `feat: 接通盘点灰度开关与来源导航`，按SPEC→质量两轮审核。

## Task 3: DEV apply、固定候选发布与晴天验收

**Read:** `.github/workflows/release-dev.yml`、`deploy-dev.yml`、`docs/operations/evidence/2026-09-09-warehouse-transfer-granted-live-acceptance.md`；DEV操作脚本中的参数与环境校验。
**Create only if needed:** 使用 `supabase migration new qingtian_stocktake_dev_permission_grant` 产生目标租户/员工或既有角色的两项权限迁移与有界验收测试，不修改其他租户。仅观察真实缺失后实施。
**Create:** `docs/operations/evidence/2026-09-09-warehouse-stocktake-admin-live-acceptance.md`。

- [ ] 只读核实DEV远端身份、当前migration list与发布工作流参数，确认四份已提交D2迁移及其他实际待执行项；核实晴天适格员工的真实SQL权限。不得打印token/password/env。
- [ ] 如缺manage/approve，遵循已验收D1限定授权模式以migration加入两项权限；先隔离SQL回归，说明精确撤回路径。记录待apply列表，再通过仓库DEV工作流apply。
- [ ] `supabase migration list`证明Local/Remote对齐。新固定release分支指向审核通过提交（不移动D1分支），push并dispatch DEV；跟踪workflow最终结论、部署SHA及健康端点。失败定位根因，不盲目重复。
- [ ] 使用Chrome技能bootstrap和真实UI登录、平台开盘点、切换晴天合适员工。先截图/读库存基线，再最小盘盈/盘亏与业务反向单恢复，验收版本/单据/金额/数量/流水来源。期间发现并发变化不强制过账。
- [ ] 记录命令、迁移状态、workflow URLs/SHA、单据ID与库存前后证据、开关最终状态；不把mock当live结果。最终fresh复验、文档提交push，工作树干净。明确手工调整D2.2仍未开始。

## 计划自检

设计中的UI、权限、精度和恢复由Task1覆盖，导航/平台与浏览器由Task2覆盖，apply/release/真实租户由Task3覆盖。暂无需新依赖或后端状态机修改。Task1期间主代理只读准备DEV目标与Chrome就绪，避免任务串行等待；不在审核前apply/发布。
