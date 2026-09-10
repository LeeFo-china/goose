import { z } from 'zod';

const option = z.object({ id: z.uuid(), name: z.string() }).strict();
const draft = z.object({
  kind: z.literal('draft'), orderId: z.uuid(), version: z.number().int().nonnegative(),
  warehouse: option.nullable(), reason: z.string().max(500), lines: z.array(option).max(100),
}).strict();
const counts = z.object({
  kind: z.literal('counts'), orderId: z.uuid(), version: z.number().int().positive(),
  lines: z.array(z.object({ skuId: z.uuid(), counted: z.string().max(19), reason: z.string().max(500) }).strict()).max(100),
}).strict();
const schema = z.discriminatedUnion('kind', [draft, counts]).refine((edit) => {
  const ids = edit.kind === 'draft' ? edit.lines.map((line) => line.id.toLowerCase()) : edit.lines.map((line) => line.skuId.toLowerCase());
  return new Set(ids).size === ids.length;
});
export type StocktakeEdit = z.infer<typeof schema>;
export type StocktakeDraftEdit = Extract<StocktakeEdit, { kind: 'draft' }>;
export type StocktakeCountsEdit = Extract<StocktakeEdit, { kind: 'counts' }>;

// One editor per account/tenant/employee in this tab. Never stores authentication or inventory costs.
export function createStocktakeEditorStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  scope: string,
) {
  const key = `gooes:warehouse-stocktake-editor:${scope}`;
  let raw: string | null | undefined;
  function current() {
    if (!storage) throw new Error('无法读取盘点编辑记录');
    return storage.getItem(key);
  }
  function owned() {
    if (raw === undefined || current() !== raw) throw new Error('盘点编辑记录已变化，请刷新核实');
  }
  return {
    read(): StocktakeEdit | null {
      raw = current();
      if (raw === null) return null;
      try { return schema.parse(JSON.parse(raw)); }
      catch { throw new Error('盘点编辑记录无效，请核实或放弃恢复'); }
    },
    write(edit: StocktakeEdit) {
      owned();
      const next = JSON.stringify(schema.parse(edit));
      storage!.setItem(key, next);
      if (current() !== next) throw new Error('无法保存盘点编辑记录，本次输入未接收');
      raw = next;
    },
    clear() {
      owned();
      storage!.removeItem(key);
      if (current() !== null) throw new Error('无法清理盘点编辑记录');
      raw = null;
    },
  };
}
