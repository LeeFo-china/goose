# 阶段 D2.2 手工调整请求契约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development for this single bounded implementation unit, followed by independent SPEC and quality review. User has delegated routine confirmations; execute within the approved bounds without pausing. No remote writes, migration, route registration, Admin, permission grants or Orange changes.

**Goal:** 建立独立手工数量差额调整的状态、Domain请求DTO和严格精度安全的API输入契约。
**Architecture:** 沿用warehouse-stocktake/warehouse-transfer邻近实现；仅新增Domain域文件和API schema，复用PaginationQuerySchema，不提取通用库存引擎、不预造响应。
**Tech Stack:** Bun 1.3.2、TypeScript、已安装Zod4.4.2、@gooes/domain。

---

设计：`../specs/2026-09-09-warehouse-adjustment-stage-d22-design.md`（259e5aa9）。
已核对AGENTS、API/Domain配置和邻近实现；linked worktree干净，无子模块；Domain3 tests/9 assertions、API8 tests/282 assertions基线通过。现有依赖无需install。知识库502不阻断本地事实核对。

## Task 1：Domain与API输入契约

**Files:**
- Create `packages/domain/src/warehouse-adjustment.ts`：状态/中文标签/展示动作和两类请求DTO。
- Create `packages/domain/src/warehouse-adjustment.test.ts`：真实根出口测试。
- Modify `packages/domain/src/index.ts`：追加一次re-export。
- Create `apps/api/src/schema/warehouse-adjustments.ts`：严格输入与分页schema。
- Create `apps/api/src/schema/warehouse-adjustments.test.ts`：精度、零/格式、原因、唯一SKU、版本、注入与分页测试。

- [ ] 写Domain测试并执行`bun test packages/domain/src/warehouse-adjustment.test.ts`，必须因根导出缺失断言RED，而非模块解析失败：

```ts
import { expect, test } from 'bun:test';

test('手工调整独立状态、中文标签与展示动作从根出口导出', async () => {
  const domain = await import('./index');
  expect(Reflect.get(domain, 'WAREHOUSE_ADJUSTMENT_STATUS_VALUES')).toEqual([
    'draft', 'submitted', 'completed', 'cancelled',
  ]);
  expect(Reflect.get(domain, 'WAREHOUSE_ADJUSTMENT_STATUS_LABELS')).toEqual({
    draft: '草稿', submitted: '待确认', completed: '已完成', cancelled: '已取消',
  });
  expect(Reflect.get(domain, 'WAREHOUSE_ADJUSTMENT_ACTIONS')).toEqual({
    draft: ['save_draft', 'submit', 'cancel'], submitted: ['complete', 'cancel'],
    completed: [], cancelled: [],
  });
});
```

- [ ] RED后新增Domain文件并在index追加`export * from './warehouse-adjustment';`：

```ts
export const WAREHOUSE_ADJUSTMENT_STATUS_VALUES = ['draft', 'submitted', 'completed', 'cancelled'] as const;
export type WarehouseAdjustmentStatus = (typeof WAREHOUSE_ADJUSTMENT_STATUS_VALUES)[number];
export type WarehouseAdjustmentCommand = 'save_draft' | 'submit' | 'complete' | 'cancel';

export const WAREHOUSE_ADJUSTMENT_STATUS_LABELS = {
  draft: '草稿', submitted: '待确认', completed: '已完成', cancelled: '已取消',
} as const satisfies Record<WarehouseAdjustmentStatus, string>;

// 仅用于展示，不替代服务端权限、开关、快照版本与数据库状态检查。
export const WAREHOUSE_ADJUSTMENT_ACTIONS = {
  draft: ['save_draft', 'submit', 'cancel'],
  submitted: ['complete', 'cancel'],
  completed: [],
  cancelled: [],
} as const satisfies Record<WarehouseAdjustmentStatus, readonly WarehouseAdjustmentCommand[]>;

export interface WarehouseAdjustmentDraft {
  expected_version: number;
  warehouse_id: string;
  reason: string;
  items: {
    supplier_sku_id: string;
    quantity_delta: string;
    adjustment_reason: string;
  }[];
}

export interface WarehouseAdjustmentCommandInput {
  expected_version: number;
}
```

- [ ] 定向Domain测试GREEN，执行`cd packages/domain && bun run build`。先写如下API测试，允许schema暂放`export {};`使导出断言失败；执行`cd apps/api && bun test src/schema/warehouse-adjustments.test.ts --test-name-pattern '明确导出'`取得真实RED，不能以缺少文件或拼写异常代替：

```ts
import { expect, test } from 'bun:test';
import type { WarehouseAdjustmentDraft, WarehouseAdjustmentCommandInput } from '@gooes/domain';

const warehouse = 'abcdef00-0000-4000-8000-000000000001';
const sku = 'abcdef00-0000-4000-8000-000000000002';
const id = 'abcdef00-0000-4000-8000-000000000003';
const item = { supplier_sku_id: sku, quantity_delta: '-0.5000', adjustment_reason: '破损复核' };
const draft = { expected_version: 0, warehouse_id: warehouse, reason: '账面纠正', items: [item] };
const forbidden = ['tenant_id', 'actor_user_id', 'actor_employee_id', 'project_id', 'status',
  'book_quantity', 'book_value', 'book_unit_cost', 'balance_id', 'balance_version',
  'unit_cost', 'amount', 'force', 'counted_quantity', 'quantity', 'difference_quantity', 'unexpected'];

test('手工调整请求schema明确导出', async () => {
  const module = await import('./warehouse-adjustments');
  for (const name of ['WarehouseAdjustmentParamSchema', 'WarehouseAdjustmentDraftSchema',
    'WarehouseAdjustmentCommandSchema', 'WarehouseAdjustmentListQuerySchema',
    'WarehouseAdjustmentItemsQuerySchema', 'WarehouseAdjustmentSettingsQuerySchema']) {
    expect(Reflect.get(module, name)).toBeDefined();
  }
});

test('数量差额保留正负精度，拒绝零和非法十进制', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  for (const quantity_delta of ['0.0001', '-0.0001', '1', '-1', '1.0000', '-1.0000',
    '99999999999999.9999', '-99999999999999.9999']) {
    const typed: WarehouseAdjustmentDraft = schema.parse({ ...draft, items: [{ ...item, quantity_delta }] });
    expect(typed.items[0]?.quantity_delta).toBe(quantity_delta);
  }
  for (const quantity_delta of [undefined, null, 0, 1, -1, NaN, Infinity, '', ' ', '\n',
    '0', '-0', '0.0', '-0.0000', '0.0000', '+1', '+0.1', '01', '-01', '.1', '-.1',
    '1.', '-1.', '1e2', '-1e2', 'NaN', 'Infinity', '1.00001', '-1.00001',
    '100000000000000', '-100000000000000', '1\n', '-1\r\n', ' 1', '1 ', '−1']) {
    expect(schema.safeParse({ ...draft, items: [{ ...item, quantity_delta }] }).success).toBe(false);
  }
});

test('仓库SKU合法、大小写去重且行数有界，允许不同SKU混合方向', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  const rows = Array.from({ length: 101 }, (_, index) => ({
    ...item, supplier_sku_id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    quantity_delta: index % 2 === 0 ? '1' : '-1',
  }));
  for (const length of [1, 100]) expect(schema.safeParse({ ...draft, items: rows.slice(0, length) }).success).toBe(true);
  for (const items of [[], rows, [item, { ...item, supplier_sku_id: sku.toUpperCase(), quantity_delta: '1' }]]) {
    expect(schema.safeParse({ ...draft, items }).success).toBe(false);
  }
  for (const value of [undefined, null, '', 'invalid']) {
    expect(schema.safeParse({ ...draft, warehouse_id: value }).success).toBe(false);
    expect(schema.safeParse({ ...draft, items: [{ ...item, supplier_sku_id: value }] }).success).toBe(false);
  }
});

test('整单和逐行原因必填、修剪且限制500字符', async () => {
  const { WarehouseAdjustmentDraftSchema: schema } = await import('./warehouse-adjustments');
  expect(schema.parse({ ...draft, reason: '  纠正  ', items: [{ ...item, adjustment_reason: '  破损  ' }] }))
    .toMatchObject({ reason: '纠正', items: [{ adjustment_reason: '破损' }] });
  expect(schema.safeParse({ ...draft, reason: '字'.repeat(500),
    items: [{ ...item, adjustment_reason: '字'.repeat(500) }] }).success).toBe(true);
  for (const value of [undefined, null, 1, '', ' ', '\n', '字'.repeat(501)]) {
    expect(schema.safeParse({ ...draft, reason: value }).success).toBe(false);
    expect(schema.safeParse({ ...draft, items: [{ ...item, adjustment_reason: value }] }).success).toBe(false);
  }
});

test('严格白名单阻止客户端注入身份、账面和成本', async () => {
  const { WarehouseAdjustmentDraftSchema: schema, WarehouseAdjustmentCommandSchema: command } = await import('./warehouse-adjustments');
  for (const field of forbidden) {
    expect(schema.safeParse({ ...draft, [field]: warehouse }).success).toBe(false);
    expect(schema.safeParse({ ...draft, items: [{ ...item, [field]: warehouse }] }).success).toBe(false);
    expect(command.safeParse({ expected_version: 1, [field]: warehouse }).success).toBe(false);
  }
  expect(schema.safeParse({ ...draft, quantity_delta: '1' }).success).toBe(false);
  expect(command.safeParse({ expected_version: 1, items: [item] }).success).toBe(false);
  expect(schema.safeParse({ ...draft, items: [{ ...item, expected_version: 1 }] }).success).toBe(false);
});

test('版本和路径参数严格有界，schema输出符合Domain命令DTO', async () => {
  const s = await import('./warehouse-adjustments');
  expect(s.WarehouseAdjustmentDraftSchema.parse(draft).expected_version).toBe(0);
  expect(s.WarehouseAdjustmentCommandSchema.safeParse({ expected_version: 0 }).success).toBe(false);
  for (const expected_version of [1, 2147483647]) {
    const typed: WarehouseAdjustmentCommandInput = s.WarehouseAdjustmentCommandSchema.parse({ expected_version });
    expect(typed.expected_version).toBe(expected_version);
    expect(s.WarehouseAdjustmentDraftSchema.parse({ ...draft, expected_version }).expected_version).toBe(expected_version);
  }
  for (const expected_version of [undefined, null, -1, 1.5, '1', 2147483648, NaN, Infinity]) {
    expect(s.WarehouseAdjustmentDraftSchema.safeParse({ ...draft, expected_version }).success).toBe(false);
    expect(s.WarehouseAdjustmentCommandSchema.safeParse({ expected_version }).success).toBe(false);
  }
  expect(s.WarehouseAdjustmentParamSchema.parse({ id })).toEqual({ id });
  for (const input of [{}, { id: null }, { id: 'invalid' }, { id, tenant_id: warehouse }]) {
    expect(s.WarehouseAdjustmentParamSchema.safeParse(input).success).toBe(false);
  }
});

test('列表明细和设置有独立分页与筛选白名单', async () => {
  const s = await import('./warehouse-adjustments');
  for (const schema of [s.WarehouseAdjustmentListQuerySchema, s.WarehouseAdjustmentItemsQuerySchema]) {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(schema.parse({ page: '2', pageSize: '100' })).toEqual({ page: 2, pageSize: 100 });
    for (const input of [{ page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 101 }, { tenant_id: warehouse }]) {
      expect(schema.safeParse(input).success).toBe(false);
    }
  }
  for (const status of ['draft', 'submitted', 'completed', 'cancelled']) {
    expect(s.WarehouseAdjustmentListQuerySchema.parse({ status }).status).toBe(status);
  }
  expect(s.WarehouseAdjustmentListQuerySchema.parse({ warehouseId: warehouse, keyword: ' 单号 ' }))
    .toMatchObject({ warehouseId: warehouse, keyword: '单号' });
  expect(s.WarehouseAdjustmentListQuerySchema.safeParse({ keyword: '字'.repeat(100) }).success).toBe(true);
  for (const input of [{ status: 'counting' }, { status: 'unknown' }, { warehouseId: 'invalid' },
    { keyword: '字'.repeat(101) }, { projectId: warehouse }]) {
    expect(s.WarehouseAdjustmentListQuerySchema.safeParse(input).success).toBe(false);
  }
  for (const input of [{ warehouseId: warehouse }, { status: 'draft' }, { keyword: '单号' }]) {
    expect(s.WarehouseAdjustmentItemsQuerySchema.safeParse(input).success).toBe(false);
  }
  expect(s.WarehouseAdjustmentSettingsQuerySchema.parse({})).toEqual({});
  for (const input of [{ page: 1 }, { tenant_id: warehouse }, { warehouse_adjustments_enabled: true }]) {
    expect(s.WarehouseAdjustmentSettingsQuerySchema.safeParse(input).success).toBe(false);
  }
});
```

- [ ] API RED后实施以下完整schema，不修改公共分页或旧业务：

```ts
import { WAREHOUSE_ADJUSTMENT_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的调整 ID');
const draftExpectedVersion = z.number().int().min(0).max(2147483647);
const commandExpectedVersion = z.number().int().min(1).max(2147483647);
const reason = z.string().trim().min(1, '请填写调整原因').max(500, '原因不能超过 500 个字符');
const quantityDelta = z.string()
  .regex(/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, '调整数量最多 14 位整数、4 位小数')
  .refine((value) => value === value.trim(), '调整数量不能包含首尾空白')
  .refine((value) => /[1-9]/.test(value), '调整数量不能为零');
const draftItem = z.object({
  supplier_sku_id: uuid,
  quantity_delta: quantityDelta,
  adjustment_reason: reason,
}).strict();

export const WarehouseAdjustmentParamSchema = z.object({ id: uuid }).strict();
export const WarehouseAdjustmentDraftSchema = z.object({
  expected_version: draftExpectedVersion,
  warehouse_id: uuid,
  reason,
  items: z.array(draftItem).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.supplier_sku_id.toLowerCase())).size === items.length,
    '调整 SKU 不能重复',
  ),
}).strict();

// 库存是否足够、计价依据与快照一致性须由后续数据库原子命令校验。
export const WarehouseAdjustmentCommandSchema = z.object({
  expected_version: commandExpectedVersion,
}).strict();
export const WarehouseAdjustmentListQuerySchema = PaginationQuerySchema.extend({
  warehouseId: uuid.optional(),
  status: z.enum(WAREHOUSE_ADJUSTMENT_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(100).optional(),
}).strict();
export const WarehouseAdjustmentItemsQuerySchema = PaginationQuerySchema.strict();
export const WarehouseAdjustmentSettingsQuerySchema = z.object({}).strict();

export type WarehouseAdjustmentDraftInput = z.infer<typeof WarehouseAdjustmentDraftSchema>;
export type WarehouseAdjustmentCommandInput = z.infer<typeof WarehouseAdjustmentCommandSchema>;
export type WarehouseAdjustmentListQuery = z.infer<typeof WarehouseAdjustmentListQuerySchema>;
```

- [ ] 运行全量该契约测试GREEN；补充发现的真实边界且必须先RED。核对DTO赋值与实际Zod导出，不用Number或any。任何快照/计价/权限验证留在后续数据库批次，不伪称本schema能完成库存业务。
- [ ] 执行以下最小静态/构建/原契约回归，全部退出0后自检并仅提交上述5个文件，提交信息`feat: 增加仓库手工调整请求契约`：

```sh
bun test packages/domain/src/warehouse-adjustment.test.ts packages/domain/src/warehouse-stocktake.test.ts packages/domain/src/warehouse-transfer.test.ts packages/domain/src/warehouse-material.test.ts
cd packages/domain && bun run build
cd ../../apps/api
bun test src/schema/warehouse-adjustments.test.ts src/schema/warehouse-stocktakes.test.ts src/schema/warehouse-transfers.test.ts src/schema/warehouse-materials.test.ts
bunx tsc -p tsconfig.json --noEmit
bun run build
```

在根目录执行`bun run check:file-size`及`git diff --check`。独立SPEC核对设计第5/6节及文件边界通过后，再独立质量审查；重要问题修复后复审。

## Task 2：证据与收尾（主代理）

- [ ] 主代理fresh重跑定向测试、类型/构建/大小检查，验证没有新增路由、数据库、权限或开关。
- [ ] 新增`docs/operations/evidence/2026-09-09-warehouse-adjustment-contracts.md`，记录实际RED/GREEN、版本/数量边界、审查结果与本批未接入限制；更新MVP进度和设计首批进度。
- [ ] 勾选本计划，验证diff与本地文档链接，提交证据到feature并push；最终clean且远端SHA一致，不合并main、不建PR、不移动D1/D2.1固定release。
- [ ] 下一批另立数据库计划：新migration、原子保存/提交快照/完成/取消、独立权限定义及默认关闭开关、真实SQL并发/回滚/财务隔离验证；本轮不apply不开发发布。

## 自检

设计第2/5节映射Task1状态/DTO/schema，第3节输入精度映射非法与最大最小测试，第4节严格字段/分页映射白名单测试，第6节本批验证映射Task1回归与两阶段审查。实际数据库计价、权限和UI明确排除，未将输入契约等同上线。没有未定义响应类型、新依赖或占位实现。
