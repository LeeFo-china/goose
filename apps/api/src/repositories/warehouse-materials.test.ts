import { expect, test } from 'bun:test';
import { Errors } from '@/errors/error-factory';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

export const ID = '10000000-0000-4000-8000-000000000001';
const scope = { tenant_id: ID, actor_user_id: ID, actor_employee_id: ID };
export const ISSUE_ORDER = {
  id: ID, tenant_id: ID, warehouse_id: ID, project_id: ID, order_no: 'WI-001',
  status: 'draft' as const, version: 1, reason: null, created_by_employee_id: ID,
  updated_by_employee_id: ID, created_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T00:00:00Z',
  submitted_at: null, completed_at: null, cancelled_at: null,
};
const summary = { ...ISSUE_ORDER, document_type: 'issue' as const, warehouse_name: '主仓库', project_name: '项目',
  total_amount: null, item_count: 1, original_issue_order_no: null };
const item = { id: ID, tenant_id: ID, warehouse_id: ID, project_id: ID, issue_order_id: ID,
  line_no: 1, supplier_sku_id: ID, quantity: '99999999999999.9999', unit_cost: '0.0001', amount: '10000000000.00',
  cost_category_id: ID, cost_category_name: '材料', sku_name: '木板', sku_code: 'SKU-1',
  original_issued_quantity: '99999999999999.9999', original_issued_amount: '10000000000.00',
  returned_quantity: '1.0000', returned_amount: '0.00', returnable_quantity: '99999999999998.9999' };

test('material reads preserve exact SQL fields and map RPC paging and actor parameters', async () => {
  const { WarehouseMaterialReadsRepository } = await import('./warehouse-material-reads');
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const repository = new WarehouseMaterialReadsRepository({ rpc: async (name, params) => {
    calls.push({ name, params });
    const data = name === 'get_warehouse_material_order' ? summary : { items:
      name === 'list_warehouse_material_orders' ? [summary] : name === 'list_warehouse_material_projects' ? [{ id: ID, name: '项目' }] : [item],
      total: 1, page: 2, pageSize: 20 };
    return { data, error: null };
  } });
  const input = { ...scope, document_type: 'issue' as const, page: 2, pageSize: 20 };
  expect((await repository.list(input)).list[0]).toEqual(summary);
  expect((await repository.get({ ...input, order_id: ID }))).toEqual(summary);
  expect((await repository.listItems({ ...input, order_id: ID })).list[0]).toEqual(item);
  expect((await repository.listProjects({ ...scope, page: 2, pageSize: 20 })).pagination.totalPages).toBe(1);
  expect(calls[0]).toEqual({ name: 'list_warehouse_material_orders', params: {
    p_tenant_id: ID, p_actor_user_id: ID, p_actor_employee_id: ID, p_document_type: 'issue',
    p_warehouse_id: null, p_project_id: null, p_status: null, p_keyword: null, p_page: 2, p_page_size: 20,
  } });
  expect(calls[2]?.params).toEqual({ p_tenant_id: ID, p_actor_user_id: ID, p_actor_employee_id: ID,
    p_document_type: 'issue', p_order_id: ID, p_page: 2, p_page_size: 20 });
  expect(calls[3]?.params).not.toHaveProperty('p_document_type');
});

test('return parsers match enriched source item identity without issue-only columns', async () => {
  const { WarehouseMaterialReadsRepository } = await import('./warehouse-material-reads');
  const { issue_order_id: _, ...baseItem } = item;
  const returnItem = { ...baseItem, return_order_id: ID, original_issue_order_id: ID, original_issue_item_id: ID };
  const repository = new WarehouseMaterialReadsRepository({ rpc: async () => ({
    data: { items: [returnItem], total: 1, page: 1, pageSize: 20 }, error: null,
  }) });
  expect((await repository.listItems({ ...scope, document_type: 'return', order_id: ID, page: 1, pageSize: 20 })).list).toEqual([returnItem]);
});

test('command repository maps expected version, actor, payload and receipt without numeric conversion', async () => {
  const { WarehouseMaterialCommandsRepository } = await import('./warehouse-material-commands');
  const payload = { warehouse_id: ID, project_id: ID, items: [{ supplier_sku_id: ID, quantity: '0.0001' }] };
  const result = { status: 'saved' as const, order: ISSUE_ORDER };
  const repository = new WarehouseMaterialCommandsRepository({ rpc: async (name, params) => {
    expect(name).toBe('command_warehouse_material_order');
    expect(params).toEqual({ p_tenant_id: ID, p_order_id: ID, p_document_type: 'issue', p_command: 'save_draft',
      p_expected_version: 0, p_payload: payload, p_actor_user_id: ID, p_actor_employee_id: ID, p_idempotency_key: 'key' });
    return { data: result, error: null };
  } });
  expect(await repository.command({ ...scope, order_id: ID, document_type: 'issue', command: 'save_draft',
    expected_version: 0, payload, idempotency_key: 'key' })).toEqual(result);
});

test('malformed monetary RPC output and SQL errors remain wrapped database failures', async () => {
  const { WarehouseMaterialReadsRepository } = await import('./warehouse-material-reads');
  for (const response of [{ data: { ...summary, total_amount: 12 }, error: null },
    { data: null, error: { message: 'WAREHOUSE_MATERIAL_FORBIDDEN' } }]) {
    const repository = new WarehouseMaterialReadsRepository({ rpc: async () => response });
    await expect(repository.get({ ...scope, document_type: 'issue', order_id: ID })).rejects.toMatchObject({ code: Errors.dbError().code });
  }
});

test('return command receipt accepts raw return order fields without a submitted_at column', async () => {
  const { WarehouseMaterialCommandsRepository } = await import('./warehouse-material-commands');
  const { submitted_at: _, ...baseOrder } = ISSUE_ORDER;
  const order = { ...baseOrder, original_issue_order_id: ID, order_no: 'WR-001' };
  const repository = new WarehouseMaterialCommandsRepository({ rpc: async () => ({ data: { status: 'saved', order }, error: null }) });
  expect((await repository.command({ ...scope, document_type: 'return', order_id: ID, command: 'save_draft',
    expected_version: 0, payload: { original_issue_order_id: ID, items: [{ original_issue_item_id: ID, quantity: '1.0000' }] },
    idempotency_key: 'return-key' })).order).toEqual(order);
});

test.each([null, '', '   ', '有效项目'])('normalizes legacy project label %s in both summaries and project options', async (name) => {
  const { WarehouseMaterialReadsRepository } = await import('./warehouse-material-reads');
  const expectedName = name?.trim() ? name : '未命名项目';
  const { submitted_at: _, ...returnBase } = ISSUE_ORDER;
  const repository = new WarehouseMaterialReadsRepository({ rpc: async (rpcName, params) => {
    const document = params.p_document_type === 'return'
      ? { ...returnBase, original_issue_order_id: ID, original_issue_order_no: 'WI-001', document_type: 'return',
        warehouse_name: '主仓库', project_name: name, total_amount: null, item_count: 1 }
      : { ...summary, project_name: name };
    return { data: rpcName === 'get_warehouse_material_order' ? document : {
      items: rpcName === 'list_warehouse_material_projects' ? [{ id: ID, name }] : [document],
      total: 1, page: 1, pageSize: 20,
    }, error: null };
  } });
  for (const document_type of ['issue', 'return'] as const) {
    expect((await repository.get({ ...scope, document_type, order_id: ID })).project_name).toBe(expectedName);
    expect((await repository.list({ ...scope, document_type, page: 1, pageSize: 20 })).list[0]?.project_name).toBe(expectedName);
  }
  expect((await repository.listProjects({ ...scope, page: 1, pageSize: 20 })).list[0]?.name).toBe(expectedName);
});
