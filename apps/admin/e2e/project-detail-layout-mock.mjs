import { createServer } from 'node:http';
import { sessionFor, serviceAccess } from './rendering-library-mock-fixture.mjs';
const projectId = '50000000-0000-4000-8000-000000000001';
const address = '十里头德盛苑 河南省郑州市中牟县万洪路北大新世纪实验学校西北侧约270米';
const project = { id: projectId, name: `李·${address}`, status: 'completed', display_status_label: '已完成',
  budget: 136000, signed_amount: 136000, start_date: '2026-10-09', created_at: '2026-10-09', address,
  customer: { name: '李' }, designer: { name: '丁春秋' }, supervisor: { name: '唐僧' }, members: [],
  property: { id: '60000000-0000-4000-8000-000000000001', community: address, area: 132, layout: '三室两厅',
    location_status: 'confirmed', province: '河南省', city: '郑州市', district: '中牟县', adcode: '410122', latitude: 34.68, longitude: 114.01 } };
const finance = { project_id: projectId, contract_amount: 136000, received_amount: 80000,
  receivable_remaining_amount: 0, overdue_count: 0, overdue_amount: 0, ledger_entry_count: 2,
  budget_configured: false, actual_profit_amount: 80000, projected_profit_amount: 136000,
  risk_level: 'warning', risk_reasons: [], unallocated_expense_amount: 0, unallocated_expense_items: [],
  expense_paid_amount: 0, supplier_cost_amount: 0, supplier_unpaid_amount: 0 };
function send(res, data) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, data })); }
createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1:3996').pathname;
  if (path === '/health') return send(res, {});
  if (path === '/admin/auth/me') {
    const session = sessionFor('manager');
    session.tenant.name = '河南晴天装饰工程有限公司';
    session.permissions = ['project.read', 'project.update', 'project.acceptance.read', 'project.log.read', 'finance.read'].map(code => ({ code, scope: 'all' }));
    return send(res, session);
  }
  if (path === '/employee/service-access') return send(res, serviceAccess);
  if (path === '/notifications/summary') return send(res, { unread_count: 0 });
  if (path === '/projects/50000000-0000-4000-8000-000000000002') return send(res, { ...project, id: '50000000-0000-4000-8000-000000000002', name: address.repeat(12), property: null, address: '未关联房产的项目地址：中牟县测试路88号' });
  if (path === `/projects/${projectId}`) return send(res, project);
  if (path.endsWith('/employee-detail-bootstrap')) return send(res, {
    workflow_progress: { source: 'workflow_runtime', instance_status: 'completed', current_node_title: '结束', current_node_type: 'end', current_node_key: 'end', current_gate: null },
    construction_stages: { project_id: projectId, required_completed: true, stages: [], missing_required_stages: [] } });
  if (path.endsWith('/state')) return send(res, { workflow_state: { subject_type: 'project', subject_id: projectId,
    instance_id: projectId, instance_status: 'completed', current_node_title: '结束', current_node_key: 'end', pending_task_count: 0, actions: [], timeline_nodes: [] } });
  if (path.endsWith('/finance-summary')) return send(res, finance);
  if (path.startsWith('/finance/reconciliation/project/')) return send(res, {
    received_amount: 80000, ledger_income_amount: 80000, allocated_amount: 80000,
    expense_paid_amount: 0, ledger_expense_amount: 0, receivable_amount: 80000,
    exception_count: 0, open_exception_count: 0, danger_count: 0, warning_count: 0, resolved_exception_count: 0 });
  if (path.endsWith('/receivable-summary')) return send(res, { project_id: projectId, upcoming: [], items: [] });
  // Empty paged auxiliary lists keep this fixture isolated from real tenant data.
  if (req.method === 'GET') return send(res, { list: [], items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  res.writeHead(405); res.end('Read-only fixture');
}).listen(3996, '127.0.0.1');
