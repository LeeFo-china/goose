# 仓库财务 Admin Stage B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成既有供应商应付→付款申请→审批→付款界面的仓库目的地适配，并保持原项目闭环和安全重试。

**Architecture:** 沿用已确认的仓库 MVP 设计与 Stage B 执行 1–4，不新增平行财务系统。复用现有 API、金额工具、分页组件与冻结命令基础；在财务域内统一目的地校验和展示，再接入原页面。后端/API/SQL 已有候选实现，本单元不修改数据库、全局请求客户端或租户功能开关。

**Tech Stack:** Bun、TypeScript、React、Next.js、现有 shadcn/ui、Zod、Playwright。

**Approved design:** `docs/superpowers/specs/2026-09-05-warehouse-procurement-inventory-mvp-design.md` 第 4、6、9、11–13 节；本计划只细化 Stage B 财务 UI，不包含 Stage C、Orange 或部署授权。

## 当前证据与边界

- 基线 `9073b8fa`，独立 worktree `feature/warehouse-procurement-inventory-stage-b`；财务两个目录 8 个测试文件逐文件运行 53 tests / 256 assertions 通过。
- 已复现 `canMergePayables` 将不同仓库、同供应商且 `project_id=null` 判为可合并；`validateDraftPayables`、`mergePaymentRequestDraftLines` 重复该项目专用判断。只改标签或 nullable 类型不能完成本单元。
- 真实财务参数为 `destination_type` / `warehouse_id`，不是采购批次的 camelCase 查询参数。对应 API 文件：`apps/api/src/schema/supplier-payments.ts`、`schema/supplier-payment-destination.ts`、`repositories/supplier-payables.ts`、`repositories/supplier-payment-requests.ts`、`services/supplier-payment-destination.ts`。
- 旧项目响应可缺新增字段，但只在有合法 `project_id` 且没有仓库归属时归一为项目；不能把空项目补成虚拟项目或绕过目的地检查。
- 应付查看、申请查看分别保留既有财务权限；仓库读取另需 `inventory.warehouse.view`。编辑/提交/取消/关闭需财务 manage + warehouse.manage，审批需 approve + warehouse.manage，付款需 pay + warehouse.manage，不额外要求 approve/pay 角色拥有财务 manage。
- 已有应付/付款不能因仓库停用或补货开关关闭被阻断；筛选历史仓库不可只取 active。草稿按 ID 查询接口仍允许有申请 manage、无 payable.view 的角色读取获准的草稿事实，不得换成依赖 payable.view 的列表。

## Task 1: 归属契约、精确混选规则与列表筛选

**Files:**

- 新建 `apps/admin/components/supplier-payables/payable-destination.ts` 及同名测试，承载财务域目的地归一、比较、展示；不放 HTTP 或 React 状态。
- 修改该目录 `payable-types.ts`、`payable-rules.ts`、`payable-api.ts`、`use-payable-list.ts` 及邻近测试。
- 修改 `apps/admin/components/supplier-payment-requests/payment-request-types.ts`、`payment-request-api.ts`、`payment-request-page-utils.ts` 及邻近测试。

- [x] 写并运行跨仓混选 RED，覆盖同仓成功、跨仓拒绝、项目/仓库拒绝、跨项目拒绝、旧项目响应兼容和非法互斥拒绝。最小业务断言：

```ts
const scope = {
  destination_type: "warehouse" as const,
  warehouse_id: "10000000-0000-4000-8000-000000000001",
  project_id: null,
  tenant_supplier_id: "20000000-0000-4000-8000-000000000001",
  currency: "CNY" as const,
};
expect(canMergePayables(scope, {
  ...scope,
  warehouse_id: "10000000-0000-4000-8000-000000000002",
})).toBe(false);
expect(canMergePayables(scope, scope)).toBe(true);
```

- [x] 用完整归属比较替换三处项目专用比较，禁止 selectionScope 丢失目的地；全部金额继续使用现有 BigInt 分单位工具。核心归属表示：

```ts
type FinanceDestination =
  | { destination_type: "project"; project_id: string; warehouse_id: null }
  | { destination_type: "warehouse"; project_id: null; warehouse_id: string };
function sameDestination(a: FinanceDestination, b: FinanceDestination): boolean {
  return a.destination_type === b.destination_type &&
    a.project_id?.toLowerCase() === b.project_id?.toLowerCase() &&
    a.warehouse_id?.toLowerCase() === b.warehouse_id?.toLowerCase();
}
```

- [x] 请求适配发送 snake_case，列表默认 20、最大 100，归属字段覆盖应付、申请列表/详情、付款记录/回执。仓库草稿发送互斥字段，不提交服务端金额事实：

```ts
const destination = {
  destination_type: "warehouse" as const,
  project_id: null,
  warehouse_id: "10000000-0000-4000-8000-000000000001",
};
const query = new URLSearchParams({ page: "1", pageSize: "20", ...{
  destination_type: destination.destination_type,
  warehouse_id: destination.warehouse_id,
} });
expect(query.has("project_id")).toBe(false);
```

- [x] 运行 `bun test components/supplier-payables/payable-rules.test.ts`、新增目的地测试、两目录 API/page 测试，每个文件独立进程；RED 原因应为真实跨仓误判或未传参数，不以导入失败充当业务 RED。

## Task 2: 原页面接线与逐操作权限

**Files:**

- 修改 `apps/admin/app/(console)/supplier-payables/page.tsx`、`apps/admin/app/(console)/supplier-payment-requests/page.tsx`，传递实际仓库权限。
- 修改 payables 目录 `payable-workspace.tsx`、`payable-list.tsx`、`payable-filters.tsx`。
- 修改 payment-requests 目录 `payment-request-workspace.tsx`、`payment-request-filters.tsx`、`use-payment-request-filter-options.ts`、`payment-request-list.tsx`、`payment-request-detail-content.tsx`、`payment-request-editor.tsx`、`payment-request-rules.ts`、`payment-request-detail.tsx`。

- [x] 写组件/规则 RED：warehouse null project 必须显示具体仓库名称；无 warehouse.manage 的仓库行不能新建/编辑/审批/付款；只有 approve 或 pay 而非 manage 的角色仍能做获准动作，项目原行为不变。
- [x] 复用原筛选 UI，增加全部/项目/仓库和分页仓库选项；切换目的地清空互斥项目/仓库条件、旧选择并回第一页，旧异步响应不能覆盖新状态。付款申请 URL 同步相同 snake_case 条件；无 payable.view 不请求其筛选接口，不新加未授权的项目或仓库查询。
- [x] 在列表、详情、草稿编辑及付款确认上下文统一显示“采购去向”，不对 null 调用 ID 截断、不显示虚拟项目、不让用户任意更换已冻结应付目的地。列表/详情已有错误、空态、分页与窄屏页脚必须保留。
- [x] 在既有 `paymentRequestActions` 中按归属缩减权限，保持真实后端状态/发票门禁语义。等价核心逻辑：

```ts
const warehouseAllowed = destination.destination_type !== "warehouse" || canManageWarehouse;
const effective = {
  canManage: canManage && warehouseAllowed,
  canApprove: canApprove && warehouseAllowed,
  canPay: canPay && warehouseAllowed,
};
```

- [x] 运行两个财务目录逐文件 Bun 测试，再执行 `bun run check`；类型、导入和组件真实 API 核对通过后才启动浏览器。

## Task 3: 财务命令回执与不确定结果恢复

**Files:**

- 修改 `payment-request-api.ts`、`payment-request-editor.tsx`、`payment-request-detail.tsx`、`payment-dialog.tsx`、`payment-request-command-refresh.ts` 及邻近测试。
- 如当前大组件需抽出本域命令状态，可新建 `payment-request-command.ts` 与 `use-payment-request-command.ts`；职责分别为冻结/回执判定与 React 生命周期，复用 `supplier-command-attempt` 和 `purchase-order-fulfillment-ui-state` 基础，不引入全局架构或第三方依赖。

- [x] 对真实 sender 写 RED：HTTP 200 截断/缺失/资源或目的地不一致不能按成功释放 attempt；超时后的原操作不能因重新分配 key/付款 UUID 而重复写。回执校验必须依据真实财务 repository 返回形状，不猜业务状态或要求不存在字段。
- [x] 冻结原资源、动作、payload、version、key、付款 UUID 及归属元数据，保留原请求重试；已确认成功但读取失败只重读，不重发。确定性 409 走原冲突恢复；普通最新详情读取不等于证明某次不确定付款已成功或失败。
- [x] 保持付款凭证、金额精度、分配 ID/数量边界和冻结发票禁止支付规则，不能为演示仓库付款绕过门禁。仓库付款不发项目财务归属事件；项目路径继续刷新原读模型。
- [x] 运行回执/重试的 RED→GREEN、既有金额/发票/项目测试及 `bun run check`。遇真实后端契约缺口先报告，不改全局请求客户端或数据库掩盖。

## Task 4: 浏览器、双审查与提交

**Files:**

- 复用 `apps/admin/playwright.supplier-payment.config.ts`、`apps/admin/e2e/supplier-payment-{mock-backend,mock-fixture,mock-state}.mjs` 和 `supplier-payment-workflow.spec.ts`；按职责需要增加本域 warehouse/recovery spec，不复制整套服务器。
- 更新 `docs/operations/evidence/2026-09-07-warehouse-stage-b-execution.md`，本计划只在实际完成后勾选。

- [x] 将新增 fixture 对照真实 API 结构验证，旧项目样例仍允许历史缺省归属；先 RED 再 GREEN 覆盖同仓 AP 创建→提交→独立审批→分次付款/完成或尾款关闭、取消占用、跨仓阻断、停用仓库结算、发票门禁、独立角色权限、20 条后的仓库筛选/付款分页、旧请求竞态、未知结果原键恢复、375px 页脚。
- [x] 在 Admin 目录运行：

```bash
bun run check
env -u NO_COLOR bun x playwright test --config=playwright.supplier-payment.config.ts
bun run build
```

- [x] 查看桌面和 375px 截图，完成独立规格→质量审查；不得把 mock 浏览器当真实 API 或数据库验收。
- [x] 根代理按最新冻结候选独立复跑，按精确文件提交 `feat(finance): 支持仓库应付与付款申请闭环`。本单元完成后继续原获准 13 份中剩余 12 份开发库 migration 升级/真实联调（H5 已由其他执行上下文应用），不能提前合并 main、清理未合并分支或发布。
