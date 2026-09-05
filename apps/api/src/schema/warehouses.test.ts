import { describe, expect, test } from 'bun:test';

const ID = '91000000-0000-4000-8000-000000000001';

describe('warehouse schemas', () => {
  test('normalizes paginated list input', async () => {
    const { WarehouseListQuerySchema } = await import('./warehouses');
    expect(WarehouseListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(() => WarehouseListQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  test('accepts system id create and versioned update', async () => {
    const { WarehouseCreateSchema, WarehouseUpdateSchema } = await import('./warehouses');
    expect(WarehouseCreateSchema.parse({ id: ID, name: '公司仓库' })).toEqual({
      id: ID,
      name: '公司仓库',
      is_default: false,
    });
    expect(WarehouseUpdateSchema.parse({
      expected_version: 1,
      name: '主仓',
      is_default: true,
      status: 'active',
    }).is_default).toBe(true);
  });

  test('rejects empty names, unknown fields and incomplete updates', async () => {
    const { WarehouseCreateSchema, WarehouseUpdateSchema } = await import('./warehouses');
    expect(() => WarehouseCreateSchema.parse({ id: ID, name: ' ' })).toThrow();
    expect(() => WarehouseCreateSchema.parse({ id: ID, name: '仓库', code: 'WH-1' })).toThrow();
    expect(() => WarehouseUpdateSchema.parse({ expected_version: 1 })).toThrow();
    expect(() => WarehouseUpdateSchema.parse({ expected_version: 1, name: undefined })).toThrow();
  });
});
