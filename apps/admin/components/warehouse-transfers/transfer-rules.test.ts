import { describe, expect, test } from 'bun:test';

import {
  retainTransferCommand,
  transferAccess,
  transferListPath,
  validTransferQuantity,
  validateTransferDraft,
} from './transfer-rules';

describe('仓库调拨边界', () => {
  test('读取只需要库存查看权限，不依赖项目权限', () => {
    expect(transferAccess(['inventory.stock.view']).canRead).toBe(true);
    expect(transferAccess(['project.read']).canRead).toBe(false);
    expect(transferAccess(['inventory.transfer.manage']).canManage).toBe(true);
    expect(transferAccess(['inventory.transfer.approve']).canApprove).toBe(true);
  });

  test('列表默认20条、最多100条并传递四类筛选', () => {
    expect(transferListPath({})).toBe('/warehouse-transfers?page=1&pageSize=20');
    expect(transferListPath({
      page: -4,
      pageSize: 999,
      keyword: '单号',
      status: 'submitted',
      sourceWarehouseId: 'source',
      destinationWarehouseId: 'destination',
    })).toBe('/warehouse-transfers?page=1&pageSize=100&keyword=%E5%8D%95%E5%8F%B7&status=submitted&sourceWarehouseId=source&destinationWarehouseId=destination');
  });

  test('数量使用精确十进制字符串且拒绝指数和越界精度', () => {
    for (const value of ['1', '0.0001', '99999999999999.9999'])
      expect(validTransferQuantity(value)).toBe(true);
    for (const value of ['0', '-1', '1e3', '1.00001', '100000000000000', ' 1'])
      expect(validTransferQuantity(value)).toBe(false);
  });

  test('仓库和SKU比较不区分大小写，原因与行数必须有效', () => {
    expect(validateTransferDraft({
      sourceWarehouseId: 'ABC', destinationWarehouseId: 'abc', reason: '调拨',
      lines: [{ id: 'sku', quantity: '1' }],
    })).toContain('不能相同');
    expect(validateTransferDraft({
      sourceWarehouseId: 'a', destinationWarehouseId: 'b', reason: '调拨',
      lines: [{ id: 'SKU', quantity: '1' }, { id: 'sku', quantity: '2' }],
    })).toContain('重复');
    expect(validateTransferDraft({
      sourceWarehouseId: 'a', destinationWarehouseId: 'b', reason: '   ', lines: [],
    })).toContain('原因');
  });

  test('未知结果保留命令，版本冲突清除命令', () => {
    for (const status of [408, 429, 500, 503])
      expect(retainTransferCommand({ status }, false)).toBe(true);
    for (const status of [401, 403, 404])
      expect(retainTransferCommand({ status }, true)).toBe(true);
    expect(retainTransferCommand(new TypeError('network'), false)).toBe(true);
    expect(retainTransferCommand({ status: 409 }, true)).toBe(false);
    expect(retainTransferCommand({ status: 400 }, false)).toBe(false);
  });
});
