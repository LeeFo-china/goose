# 阶段 D1 调拨请求契约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地可供后续数据库／API／Admin 使用的调拨状态和严格请求契约，不开放调拨写入入口。

**Architecture:** 延续仓库领退料的 Domain 常量／DTO 与 API Zod schema 分工。复用既有分页规则，仅新增调拨专用契约，不改动原领退料或库存流水类型；数据库命令、路由和页面在后续独立批次交付。

**Tech Stack:** Bun test、TypeScript、已安装 Zod 4、现有 @gooes/domain 包。

---

## 设计与执行范围

设计：[D1 调拨](../specs/2026-09-09-warehouse-transfer-stage-d1-design.md)。
阶段 C 实际验收：[开发证据](../../operations/evidence/2026-09-09-warehouse-stage-c-dev-acceptance.md)。

用户已委托本任务内的确认，直接在现有隔离 worktree 中执行此批次，不重复询问实施方式。不得将此批次完成描述为整个 D1 上线。无新依赖、无 SQL、无远端写入、无角色授权、无 Orange 修改。

## 文件结构

- 新建 `packages/domain/src/warehouse-transfer.ts`：状态、标签、动作、草稿及版本命令类型。
- 新建 `packages/domain/src/warehouse-transfer.test.ts`：状态和动作的行为契约。
- 修改 `packages/domain/src/index.ts`：导出新领域契约。
- 新建 `apps/api/src/schema/warehouse-transfers.ts`：参数、草稿、命令、列表与明细分页的严格校验。
- 新建 `apps/api/src/schema/warehouse-transfers.test.ts`：真实 Zod 输入边界，不 mock。
- 新建 `docs/operations/evidence/2026-09-09-warehouse-stage-d1-contracts.md`：红绿测试、检查结果及仍未开放范围。

## Task 1：调拨状态与请求契约（单一实施单元）

### Step 1：先写 Domain 回归

- [ ] 新建测试，先从现有 barrel 动态导入并核验新导出；先运行观察新增常量缺失导致断言失败，再添加实现，不以拼错路径的导入错误作为红灯证据。

```ts
import { expect, test } from 'bun:test';

test('调拨状态、中文标签与终态动作保持一致', async () => {
  const domain = await import('./index');
  expect(Reflect.get(domain, 'WAREHOUSE_TRANSFER_STATUS_VALUES'))
    .toEqual(['draft', 'submitted', 'completed', 'cancelled']);
  expect(Reflect.get(domain, 'WAREHOUSE_TRANSFER_STATUS_LABELS'))
    .toEqual({ draft: '草稿', submitted: '待调拨', completed: '已调拨', cancelled: '已取消' });
  expect(Reflect.get(domain, 'WAREHOUSE_TRANSFER_ACTIONS')).toEqual({
    draft: ['save_draft', 'submit', 'cancel'],
    submitted: ['complete', 'cancel'],
    completed: [],
    cancelled: [],
  });
});
```

Run: `bun test packages/domain/src/warehouse-transfer.test.ts`。
Expected RED：缺少新导出，收到 undefined 而不是预期数组。

### Step 2：实现 Domain 并构建

- [ ] 新建领域文件，向 index.ts 增加 `export * from './warehouse-transfer';`，不向既有库存类型提前添加数据库尚不接受的值。

```ts
export const WAREHOUSE_TRANSFER_STATUS_VALUES = ['draft', 'submitted', 'completed', 'cancelled'] as const;
export type WarehouseTransferStatus = (typeof WAREHOUSE_TRANSFER_STATUS_VALUES)[number];
export type WarehouseTransferCommand = 'save_draft' | 'submit' | 'complete' | 'cancel';

export const WAREHOUSE_TRANSFER_STATUS_LABELS = {
  draft: '草稿', submitted: '待调拨', completed: '已调拨', cancelled: '已取消',
} as const satisfies Record<WarehouseTransferStatus, string>;

// 展示契约，不替代服务端权限、开关和数据库状态检查。
export const WAREHOUSE_TRANSFER_ACTIONS = {
  draft: ['save_draft', 'submit', 'cancel'],
  submitted: ['complete', 'cancel'],
  completed: [],
  cancelled: [],
} as const satisfies Record<WarehouseTransferStatus, readonly WarehouseTransferCommand[]>;

export interface WarehouseTransferDraft {
  expected_version: number;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  reason: string;
  items: { supplier_sku_id: string; quantity: string }[];
}

export interface WarehouseTransferCommandInput {
  expected_version: number;
}
```

Run: `bun test packages/domain/src/warehouse-transfer.test.ts packages/domain/src/warehouse-material.test.ts && bun run --cwd packages/domain build`。
Expected：测试与构建退出 0，编译后的包暴露新常量。

### Step 3：写严格输入测试并确认红灯

- [ ] 用真实 schema 测试；首个新文件可使用最小空导出骨架运行断言，红灯必须是契约尚未实现，不保留空骨架。以下是必须包含的测试内容，可按行为拆分测试名称：

```ts
import { expect, test } from 'bun:test';

const source = 'abcdef00-0000-4000-8000-000000000001';
const destination = 'abcdef00-0000-4000-8000-000000000002';
const sku = 'abcdef00-0000-4000-8000-000000000003';
const draft = {
  expected_version: 0, source_warehouse_id: source, destination_warehouse_id: destination,
  reason: '开发调拨', items: [{ supplier_sku_id: sku, quantity: '0.0001' }],
};

test('调拨草稿保留精度并拒绝同仓、重复 SKU 和客户端会计字段', async () => {
  const schema = await import('./warehouse-transfers');
  expect(schema.WarehouseTransferDraftSchema).toBeDefined();
  const parse = (value: unknown) => schema.WarehouseTransferDraftSchema.safeParse(value);
  expect(parse(draft).success).toBe(true);
  for (const value of [source, source.toUpperCase()]) {
    expect(parse({ ...draft, destination_warehouse_id: value }).success).toBe(false);
  }
  expect(parse({ ...draft, items: [draft.items[0], { supplier_sku_id: sku.toUpperCase(), quantity: '1' }] }).success).toBe(false);
  for (const quantity of ['0', '0.0000', '-1', '1.00001', '100000000000000', '1e2', 'NaN', '01', ' 1', 1]) {
    expect(parse({ ...draft, items: [{ supplier_sku_id: sku, quantity }] }).success).toBe(false);
  }
  const maximum = '99999999999999.9999';
  expect(schema.WarehouseTransferDraftSchema.parse({
    ...draft, items: [{ supplier_sku_id: sku, quantity: maximum }],
  }).items[0]?.quantity).toBe(maximum);
  for (const field of ['unit_cost', 'amount', 'cost_category_id', 'project_id', 'tenant_id', 'actor_user_id', 'status']) {
    expect(parse({ ...draft, [field]: source }).success).toBe(false);
    expect(parse({ ...draft, items: [{ ...draft.items[0], [field]: source }] }).success).toBe(false);
  }
  const items = Array.from({ length: 101 }, (_, index) => ({
    supplier_sku_id: '10000000-0000-4000-8000-' + String(index).padStart(12, '0'), quantity: '1',
  }));
  expect(parse({ ...draft, items: [] }).success).toBe(false);
  expect(parse({ ...draft, items: items.slice(0, 100) }).success).toBe(true);
  expect(parse({ ...draft, items }).success).toBe(false);
  for (const reason of [undefined, null, '', '   ', '字'.repeat(501)]) {
    expect(parse({ ...draft, reason }).success).toBe(false);
  }
  expect(schema.WarehouseTransferDraftSchema.parse({ ...draft, reason: '  调拨  ' }).reason).toBe('调拨');
  expect(parse({ ...draft, reason: '字'.repeat(500) }).success).toBe(true);
});

test('调拨版本、分页、参数和状态过滤有界且严格', async () => {
  const schema = await import('./warehouse-transfers');
  for (const value of [-1, 1.5, '1', 2147483648]) {
    expect(schema.WarehouseTransferDraftSchema.safeParse({ ...draft, expected_version: value }).success).toBe(false);
    expect(schema.WarehouseTransferCommandSchema.safeParse({ expected_version: value }).success).toBe(false);
  }
  expect(schema.WarehouseTransferCommandSchema.safeParse({ expected_version: 0 }).success).toBe(false);
  expect(schema.WarehouseTransferCommandSchema.parse({ expected_version: 2147483647 }).expected_version).toBe(2147483647);
  expect(schema.WarehouseTransferCommandSchema.safeParse({ expected_version: 1, tenant_id: source }).success).toBe(false);
  expect(schema.WarehouseTransferParamSchema.parse({ id: source }).id).toBe(source);
  expect(schema.WarehouseTransferParamSchema.safeParse({ id: 'invalid' }).success).toBe(false);
  expect(schema.WarehouseTransferParamSchema.safeParse({ id: source, tenant_id: source }).success).toBe(false);
  for (const query of [schema.WarehouseTransferListQuerySchema, schema.WarehouseTransferItemsQuerySchema]) {
    expect(query.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(query.parse({ page: '2', pageSize: '100' })).toEqual({ page: 2, pageSize: 100 });
    for (const input of [{ page: 0 }, { pageSize: 101 }, { pageSize: 0 }, { tenant_id: source }]) {
      expect(query.safeParse(input).success).toBe(false);
    }
  }
  expect(schema.WarehouseTransferListQuerySchema.parse({
    sourceWarehouseId: source, destinationWarehouseId: destination, status: 'submitted', keyword: ' 单号 ',
  }).keyword).toBe('单号');
  for (const input of [{ status: 'in_transit' }, { projectId: source }, { keyword: '字'.repeat(101) }, { sourceWarehouseId: 'invalid' }]) {
    expect(schema.WarehouseTransferListQuerySchema.safeParse(input).success).toBe(false);
  }
});
```

Run from apps/api：`bun test src/schema/warehouse-transfers.test.ts`。
Expected RED：新 schema 未定义或不能接受合法输入。实现前保留失败输出用于证据，不跳过失败测试。

### Step 4：实现严格 API schema

- [ ] 新建 `apps/api/src/schema/warehouse-transfers.ts`：

```ts
import { WAREHOUSE_TRANSFER_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的调拨 ID');
const quantity = z.string()
  .regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, '数量最多 14 位整数、4 位小数')
  .refine((value) => /[1-9]/.test(value), '数量必须大于 0');
const expectedVersion = z.number().int().min(0).max(2147483647);
const item = z.object({ supplier_sku_id: uuid, quantity }).strict();

export const WarehouseTransferParamSchema = z.object({ id: uuid }).strict();
export const WarehouseTransferDraftSchema = z.object({
  expected_version: expectedVersion,
  source_warehouse_id: uuid,
  destination_warehouse_id: uuid,
  reason: z.string().trim().min(1, '请填写调拨原因').max(500, '原因不能超过 500 个字符'),
  items: z.array(item).min(1).max(100).refine(
    (items) => new Set(items.map((entry) => entry.supplier_sku_id.toLowerCase())).size === items.length,
    '调拨 SKU 不能重复',
  ),
}).strict().refine(
  (draft) => draft.source_warehouse_id.toLowerCase() !== draft.destination_warehouse_id.toLowerCase(),
  { message: '调出仓库与调入仓库不能相同', path: ['destination_warehouse_id'] },
);
export const WarehouseTransferCommandSchema = z.object({
  expected_version: expectedVersion.min(1, '版本号必须为正整数'),
}).strict();
export const WarehouseTransferListQuerySchema = PaginationQuerySchema.extend({
  sourceWarehouseId: uuid.optional(),
  destinationWarehouseId: uuid.optional(),
  status: z.enum(WAREHOUSE_TRANSFER_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(100).optional(),
}).strict();
export const WarehouseTransferItemsQuerySchema = PaginationQuerySchema.strict();

export type WarehouseTransferDraftInput = z.infer<typeof WarehouseTransferDraftSchema>;
export type WarehouseTransferCommandInput = z.infer<typeof WarehouseTransferCommandSchema>;
export type WarehouseTransferListQuery = z.infer<typeof WarehouseTransferListQuerySchema>;
```

### Step 5：验证、两阶段审查及提交

- [ ] 从 apps/api 执行 `bun test src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts && bun run typecheck`；预期 0 失败、类型检查退出 0。
- [ ] 从根目录执行 `bun test packages/domain/src/warehouse-transfer.test.ts packages/domain/src/warehouse-material.test.ts && bun run --cwd packages/domain build && git diff --check`；预期全部退出 0。
- [ ] 规格审查逐条检查设计第 7 节请求契约验收；之后独立代码质量审查检查未知字段、精度、UUID 归一比较、范围、包导出与无越界写入。修复发现项后重新运行对应测试。
- [ ] 写入上述证据文件：记录实际测试数量、红灯原因、最终命令及退出码，明确未创建数据库命令、未注册路由、未部署。
- [ ] 精确暂存五个源／测试文件与证据，提交 `feat(inventory): 建立阶段 D1 调拨请求契约`；计划的完成勾选与验收记录可单独 docs 提交，不混入其他工作。

## 计划自检

此计划覆盖设计第 7 节的请求契约批次。设计中数据库、权限配置、UI 和真实调拨验收明确属于后续批次，不以本计划的完成替代 D1 完整验收。本批次没有运行态功能开关，因为未新增任何可调用入口；后续入口必须在独立开关和原子命令完整后开放。

