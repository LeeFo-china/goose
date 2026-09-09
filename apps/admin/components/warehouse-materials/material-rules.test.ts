import { describe, expect, test } from 'bun:test';
import {
  materialAccess,
  validQuantity,
  validateLines,
  retainCommand,
  materialListPath,
} from './material-rules';

describe('领退料边界', () => {
  test('数量保留十进制字符串精度并限制范围', () => {
    for (const value of ['1', '0.0001', '99999999999999.9999'])
      expect(validQuantity(value)).toBe(true);
    for (const value of [
      '0',
      '-1',
      '1e3',
      '1.00001',
      '100000000000000',
      '',
      ' 1',
    ])
      expect(validQuantity(value)).toBe(false);
    expect(
      validateLines([
        { id: 'a', quantity: '1' },
        { id: 'a', quantity: '2' },
      ]),
    ).toContain('重复');
    expect(
      validateLines(
        Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, quantity: '1' })),
      ),
    ).toContain('100');
  });
  test('读取成本需要库存与项目权限，写入分别管理和确认', () => {
    expect(materialAccess(['inventory.stock.view']).canRead).toBe(false);
    expect(
      materialAccess(['inventory.stock.view', 'project.read']).canRead,
    ).toBe(true);
    expect(
      materialAccess(['project.read', 'inventory.issue.manage']).canManage,
    ).toBe(true);
    expect(
      materialAccess(['project.read', 'inventory.issue.approve']).canApprove,
    ).toBe(true);
  });
  test('未知结果及拒绝重试均保留原命令', () => {
    for (const status of [408, 429, 500, 503])
      expect(retainCommand({ status }, false)).toBe(true);
    for (const status of [401, 403, 404])
      expect(retainCommand({ status }, true)).toBe(true);
    expect(retainCommand(new TypeError('network'), false)).toBe(true);
    expect(retainCommand({ status: 409 }, true)).toBe(false);
    expect(retainCommand({ status: 400 }, false)).toBe(false);
  });
  test('列表默认20条，最多100条并传递筛选', () => {
    expect(materialListPath('issue', {})).toBe(
      '/warehouse-issues?page=1&pageSize=20',
    );
    expect(
      materialListPath('return', {
        pageSize: 999,
        warehouseId: 'w',
        projectId: 'p',
      }),
    ).toBe('/warehouse-returns?page=1&pageSize=100&warehouseId=w&projectId=p');
  });
});
