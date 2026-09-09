# 阶段 D2.1 盘点请求契约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development for the single contract implementation unit, then SPEC and quality review. User has delegated routine confirmations; continue this bounded plan without asking again. Parent owns verification/docs. No remote writes, migration, API registration, Admin, permissions, or Orange edits.

**Goal:** 为盘点建立独立的状态、请求 DTO 和严格、有界、精度安全的输入契约。
**Architecture:** 复用现有 warehouse-transfer 的Domain出口、Zod严格对象和PaginationQuerySchema；只增盘点域文件，不改原领退料/调拨校验器，不提前创建响应模型或通用库存引擎。
**Tech Stack:** Bun 1.3.2、TypeScript、已安装 Zod 4.4.2、@gooes/domain。

依据：`../specs/2026-09-09-warehouse-stocktake-stage-d2-design.md`，设计提交`d0fa6d0f`。本计划仅落实设计第5节及第6节的本批验收；快照、计价、条件原因校验、授权与原子过账属于后续数据库批次。

## 前置与设计检查

- [x] 阅读根及schema AGENTS、Domain/API配置、既有库存/领退料/调拨契约。
- [x] 确认已有linked worktree，无子模块、具名feature分支，不新建或清理工作区。
- [x] 原Domain3项、API5项契约基线通过；复用已有依赖，无install。
- [x] 核对实际Zod4.4.2导出与类型，uuid/strict/refine沿用真实API；RAG502，已明确以本地事实为准。
- [x] 提出快照版本校验与长期锁仓/确认时直接覆盖的取舍；采用用户统一确认授权，记录盘盈无计价依据拒绝，不开放人工定价。无本批视觉问题。
- [x] 设计文件已提交并自检，无未定义响应字段或新运行态权限。

## Task 1：盘点契约（一个紧耦合实施单元）

**Files:**

- Create `packages/domain/src/warehouse-stocktake.ts`：状态/标签/展示动作/请求DTO。
- Create `packages/domain/src/warehouse-stocktake.test.ts`：真实根出口行为。
- Modify `packages/domain/src/index.ts`：仅追加re-export。
- Create `apps/api/src/schema/warehouse-stocktakes.ts`：输入schema。
- Create `apps/api/src/schema/warehouse-stocktakes.test.ts`：边界行为及DTO对齐。

- [ ] 先写Domain失败测试，执行 `bun test packages/domain/src/warehouse-stocktake.test.ts`，必须因根出口缺失断言失败，不接受依赖解析失败替代RED。测试文件完整主体：

```ts
import { expect, test } from 'bun:test';

test('盘点根出口含完整状态及中文标签', async () => {
  const domain = await import('./index');
  expect(Reflect.get(domain, 'WAREHOUSE_STOCKTAKE_STATUS_VALUES')).toEqual([
    'draft', 'counting', 'submitted', 'completed', 'cancelled',
  ]);
  expect(Reflect.get(domain, 'WAREHOUSE_STOCKTAKE_STATUS_LABELS')).toEqual({
    draft: '草稿', counting: '盘点中', submitted: '待确认',
    completed: '已完成', cancelled: '已取消',
  });
});

test('盘点动作区分开始与录入，终态不可编辑', async () => {
  const domain = await import('./index');
  expect(Reflect.get(domain, 'WAREHOUSE_STOCKTAKE_ACTIONS')).toEqual({
    draft: ['save_draft', 'start', 'cancel'],
    counting: ['record_counts', 'submit', 'cancel'],
    submitted: ['complete', 'cancel'],
    completed: [], cancelled: [],
  });
});
```

- [ ] Domain RED后实现以下完整文件，并在index追加 `export * from './warehouse-stocktake';`，不改其他出口：

```ts
export const WAREHOUSE_STOCKTAKE_STATUS_VALUES = [
  'draft', 'counting', 'submitted', 'completed', 'cancelled',
] as const;
export type WarehouseStocktakeStatus = (typeof WAREHOUSE_STOCKTAKE_STATUS_VALUES)[number];
export type WarehouseStocktakeCommand =
  | 'save_draft' | 'start' | 'record_counts' | 'submit' | 'complete' | 'cancel';

export const WAREHOUSE_STOCKTAKE_STATUS_LABELS = {
  draft: '草稿', counting: '盘点中', submitted: '待确认',
  completed: '已完成', cancelled: '已取消',
} as const satisfies Record<WarehouseStocktakeStatus, string>;

// 展示契约，不替代服务端权限、开关、快照版本和数据库状态检查。
export const WAREHOUSE_STOCKTAKE_ACTIONS = {
  draft: ['save_draft', 'start', 'cancel'],
  counting: ['record_counts', 'submit', 'cancel'],
  submitted: ['complete', 'cancel'],
  completed: [], cancelled: [],
} as const satisfies Record<WarehouseStocktakeStatus, readonly WarehouseStocktakeCommand[]>;

export interface WarehouseStocktakeDraft {
  expected_version: number;
  warehouse_id: string;
  reason: string;
  items: { supplier_sku_id: string }[];
}

export interface WarehouseStocktakeCountsInput {
  expected_version: number;
  items: {
    supplier_sku_id: string;
    counted_quantity: string;
    difference_reason?: string | null;
  }[];
}

export interface WarehouseStocktakeCommandInput {
  expected_version: number;
}
```

- [ ] Domain定向测试及build通过后，先写API测试。允许暂用同路径空模块`export {};`使动态导入正常，先观察schema缺失的toBeDefined断言RED；不可将模块解析异常当RED。将以下完整测试保存，并在实现schema前运行：

```ts
import { expect, test } from 'bun:test';
import type {
  WarehouseStocktakeDraft, WarehouseStocktakeCountsInput, WarehouseStocktakeCommandInput,
} from '@gooes/domain';

const warehouse = 'abcdef00-0000-4000-8000-000000000001';
const sku = 'abcdef00-0000-4000-8000-000000000002';
const draft = { expected_version: 0, warehouse_id: warehouse, reason: '季度盘点',
  items: [{ supplier_sku_id: sku }] };
const counts = { expected_version: 2,
  items: [{ supplier_sku_id: sku, counted_quantity: '0.0000' }] };

test('盘点schemas导出', async () => {
  const schema = await import('./warehouse-stocktakes');
  for (const name of ['WarehouseStocktakeDraftSchema', 'WarehouseStocktakeCountsSchema',
    'WarehouseStocktakeCommandSchema', 'WarehouseStocktakeParamSchema',
    'WarehouseStocktakeListQuerySchema', 'WarehouseStocktakeItemsQuerySchema',
    'WarehouseStocktakeSettingsQuerySchema']) {
    expect(Reflect.get(schema, name)).toBeDefined();
  }
});

test('实盘零值和精度保留，未录入或非法数量不能冒充零', async () => {
  const { WarehouseStocktakeCountsSchema: schema } = await import('./warehouse-stocktakes');
  for (const value of ['0', '0.0000', '0.0001', '1', '1.0000', '99999999999999.9999']) {
    const input: WarehouseStocktakeCountsInput = schema.parse({
      ...counts, items: [{ supplier_sku_id: sku, counted_quantity: value }],
    });
    expect(input.items[0]?.counted_quantity).toBe(value);
  }
  for (const value of [undefined, null, '', ' ', 0, 1, '-0', '-1', '01', '1e2',
    'NaN', 'Infinity', '100000000000000', '1.00001', ' 1', '1 ', '1\n', '.1', '1.']) {
    expect(schema.safeParse({ ...counts,
      items: [{ supplier_sku_id: sku, counted_quantity: value }] }).success).toBe(false);
  }
});

test('盘点范围与录入均限制1至100个唯一SKU', async () => {
  const s = await import('./warehouse-stocktakes');
  const items = Array.from({ length: 101 }, (_, n) => ({
    supplier_sku_id: '10000000-0000-4000-8000-' + String(n).padStart(12, '0'),
  }));
  for (const n of [0, 1, 100, 101]) {
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, items: items.slice(0, n) }).success)
      .toBe(n === 1 || n === 100);
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts,
      items: items.slice(0, n).map((item) => ({ ...item, counted_quantity: '0' })) }).success)
      .toBe(n === 1 || n === 100);
  }
  expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft,
    items: [{ supplier_sku_id: sku }, { supplier_sku_id: sku.toUpperCase() }] }).success).toBe(false);
  expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts,
    items: [counts.items[0], { supplier_sku_id: sku.toUpperCase(), counted_quantity: '1' }] }).success).toBe(false);
  for (const id of ['bad', null, undefined]) {
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, warehouse_id: id }).success).toBe(false);
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, items: [{ supplier_sku_id: id }] }).success).toBe(false);
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts, items: [{ supplier_sku_id: id, counted_quantity: '1' }] }).success).toBe(false);
  }
});

test('草稿原因必填，行原因可缺省或null但不能空白', async () => {
  const s = await import('./warehouse-stocktakes');
  const parsed: WarehouseStocktakeDraft = s.WarehouseStocktakeDraftSchema.parse({ ...draft, reason: '  盘点  ' });
  expect(parsed.reason).toBe('盘点');
  for (const reason of [undefined, null, '', ' ', '字'.repeat(501)]) {
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, reason }).success).toBe(false);
  }
  expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, reason: '字'.repeat(500) }).success).toBe(true);
  for (const reason of [undefined, null, '现场损耗', '字'.repeat(500)]) {
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts,
      items: [{ ...counts.items[0], difference_reason: reason }] }).success).toBe(true);
  }
  for (const reason of ['', ' ', '字'.repeat(501), 1]) {
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts,
      items: [{ ...counts.items[0], difference_reason: reason }] }).success).toBe(false);
  }
  expect(s.WarehouseStocktakeCountsSchema.parse({ ...counts,
    items: [{ ...counts.items[0], difference_reason: '  短缺  ' }] }).items[0]?.difference_reason).toBe('短缺');
});

test('拒绝客户端身份、状态、快照、会计和强制过账字段', async () => {
  const s = await import('./warehouse-stocktakes');
  for (const field of ['tenant_id', 'actor_user_id', 'project_id', 'status', 'book_quantity',
    'book_inventory_value', 'book_unit_cost', 'balance_id', 'balance_version',
    'difference_quantity', 'unit_cost', 'amount', 'force', 'unexpected']) {
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, [field]: warehouse }).success).toBe(false);
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft,
      items: [{ ...draft.items[0], [field]: warehouse }] }).success).toBe(false);
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts, [field]: warehouse }).success).toBe(false);
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts,
      items: [{ ...counts.items[0], [field]: warehouse }] }).success).toBe(false);
    expect(s.WarehouseStocktakeCommandSchema.safeParse({ expected_version: 1, [field]: warehouse }).success).toBe(false);
  }
  expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft,
    items: [{ ...draft.items[0], counted_quantity: '0' }] }).success).toBe(false);
  expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts, warehouse_id: warehouse }).success).toBe(false);
});

test('版本仅接受有界整数，已有单命令不能版本0', async () => {
  const s = await import('./warehouse-stocktakes');
  for (const version of [undefined, null, -1, 1.5, '1', 2147483648]) {
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, expected_version: version }).success).toBe(false);
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts, expected_version: version }).success).toBe(false);
    expect(s.WarehouseStocktakeCommandSchema.safeParse({ expected_version: version }).success).toBe(false);
  }
  expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, expected_version: 0 }).success).toBe(true);
  expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts, expected_version: 0 }).success).toBe(false);
  expect(s.WarehouseStocktakeCommandSchema.safeParse({ expected_version: 0 }).success).toBe(false);
  for (const version of [1, 2147483647]) {
    const input: WarehouseStocktakeCommandInput = s.WarehouseStocktakeCommandSchema.parse({ expected_version: version });
    expect(input.expected_version).toBe(version);
    expect(s.WarehouseStocktakeDraftSchema.safeParse({ ...draft, expected_version: version }).success).toBe(true);
    expect(s.WarehouseStocktakeCountsSchema.safeParse({ ...counts, expected_version: version }).success).toBe(true);
  }
});

test('参数、过滤、明细和设置查询严格且分页有界', async () => {
  const s = await import('./warehouse-stocktakes');
  expect(s.WarehouseStocktakeParamSchema.parse({ id: warehouse }).id).toBe(warehouse);
  for (const input of [{}, { id: 'invalid' }, { id: warehouse, tenant_id: warehouse }]) {
    expect(s.WarehouseStocktakeParamSchema.safeParse(input).success).toBe(false);
  }
  for (const schema of [s.WarehouseStocktakeListQuerySchema, s.WarehouseStocktakeItemsQuerySchema]) {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(schema.parse({ page: '2', pageSize: '100' })).toEqual({ page: 2, pageSize: 100 });
    for (const input of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 101 }, { tenant_id: warehouse }]) {
      expect(schema.safeParse(input).success).toBe(false);
    }
  }
  for (const status of ['draft', 'counting', 'submitted', 'completed', 'cancelled']) {
    expect(s.WarehouseStocktakeListQuerySchema.parse({ warehouseId: warehouse, status, keyword: ' 单号 ' }).keyword).toBe('单号');
  }
  for (const input of [{ status: 'posted' }, { warehouseId: 'invalid' }, { projectId: warehouse },
    { keyword: '字'.repeat(101) }]) {
    expect(s.WarehouseStocktakeListQuerySchema.safeParse(input).success).toBe(false);
  }
  expect(s.WarehouseStocktakeListQuerySchema.safeParse({ keyword: '字'.repeat(100) }).success).toBe(true);
  for (const input of [{ warehouseId: warehouse }, { status: 'counting' }, { keyword: 'a' }]) {
    expect(s.WarehouseStocktakeItemsQuerySchema.safeParse(input).success).toBe(false);
  }
  expect(s.WarehouseStocktakeSettingsQuerySchema.parse({})).toEqual({});
  for (const input of [{ tenant_id: warehouse }, { page: 1 }]) {
    expect(s.WarehouseStocktakeSettingsQuerySchema.safeParse(input).success).toBe(false);
  }
});
```

- [ ] 运行 `bun test src/schema/warehouse-stocktakes.test.ts`（cwd apps/api），观察schema导出缺失断言RED后才实现完整schema；测试仅跑真实Zod，无mock，不新增依赖：

```ts
import { WAREHOUSE_STOCKTAKE_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的盘点 ID');
const expectedVersion = z.number().int().min(0).max(2147483647);
const commandVersion = expectedVersion.min(1, '版本号必须为正整数');
const reason = z.string().trim().min(1, '请填写盘点原因').max(500, '原因不能超过 500 个字符');
const countedQuantity = z.string()
  .regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, '实盘数量最多 14 位整数、4 位小数')
  .refine((value) => value === value.trim(), '实盘数量不能包含首尾空白');
const draftItem = z.object({ supplier_sku_id: uuid }).strict();
const countItem = z.object({
  supplier_sku_id: uuid,
  counted_quantity: countedQuantity,
  difference_reason: z.string().trim().min(1, '差异原因不能为空')
    .max(500, '差异原因不能超过 500 个字符').nullable().optional(),
}).strict();
const uniqueSkus = (items: readonly { supplier_sku_id: string }[]): boolean =>
  new Set(items.map((item) => item.supplier_sku_id.toLowerCase())).size === items.length;

export const WarehouseStocktakeParamSchema = z.object({ id: uuid }).strict();
export const WarehouseStocktakeDraftSchema = z.object({
  expected_version: expectedVersion, warehouse_id: uuid, reason,
  items: z.array(draftItem).min(1).max(100).refine(uniqueSkus, '盘点 SKU 不能重复'),
}).strict();
// 此处仅验证输入形状；是否属于盘点范围、库存快照是否过期、差异行是否有原因由数据库命令验证。
export const WarehouseStocktakeCountsSchema = z.object({
  expected_version: commandVersion,
  items: z.array(countItem).min(1).max(100).refine(uniqueSkus, '盘点 SKU 不能重复'),
}).strict();
export const WarehouseStocktakeCommandSchema = z.object({ expected_version: commandVersion }).strict();
export const WarehouseStocktakeListQuerySchema = PaginationQuerySchema.extend({
  warehouseId: uuid.optional(),
  status: z.enum(WAREHOUSE_STOCKTAKE_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(100).optional(),
}).strict();
export const WarehouseStocktakeItemsQuerySchema = PaginationQuerySchema.strict();
export const WarehouseStocktakeSettingsQuerySchema = z.object({}).strict();

export type WarehouseStocktakeDraftInput = z.infer<typeof WarehouseStocktakeDraftSchema>;
export type WarehouseStocktakeCountsInput = z.infer<typeof WarehouseStocktakeCountsSchema>;
export type WarehouseStocktakeCommandInput = z.infer<typeof WarehouseStocktakeCommandSchema>;
export type WarehouseStocktakeListQuery = z.infer<typeof WarehouseStocktakeListQuerySchema>;
```

- [ ] GREEN：Domain定向测试/build，API盘点/领退料/调拨schema测试、API typecheck，根diff check；不得先启动浏览器、dev server、Docker或远端测试。
- [ ] 独立SPEC后quality审查；修复发现并复跑，精确提交5文件 `feat(inventory): 建立阶段D2盘点请求契约`，不把父代理文档混入代码提交。

## Task 2：主代理验证和证据

- [ ] 主代理读取实际diff，确认只改5个目标文件，无权限、SQL、路由或客户端变更。运行：

```sh
bun test packages/domain/src/warehouse-stocktake.test.ts packages/domain/src/warehouse-material.test.ts packages/domain/src/warehouse-transfer.test.ts packages/domain/src/inventory.test.ts
bun run --cwd packages/domain build
```

在apps/api：

```sh
bun test src/schema/warehouse-stocktakes.test.ts src/schema/warehouse-materials.test.ts src/schema/warehouse-transfers.test.ts
bun run typecheck
```

- [ ] 增补本批证据到 `docs/operations/evidence/2026-09-09-warehouse-stocktake-contracts.md`，写明真实RED/GREEN、测试数和审查结论，严格区分契约和未实施数据库行为。检查`git diff --check`、精确docs提交并推送现有功能分支；不移动D1固定发布分支、不合并main。
- [ ] 后续批次是盘点原子数据库命令及其完整SQL计划；本批没有待apply migration、无需开发镜像重发，盘点和手工调整均未开放。
