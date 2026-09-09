import { redirect } from 'next/navigation';

import { TransferWorkspace } from '@/components/warehouse-transfers/transfer-workspace';
import { getAdminSession } from '@/lib/auth';

export default async function WarehouseTransfersPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  if (!session.employee.id) redirect('/');
  const query = await searchParams;
  return <TransferWorkspace employeeId={session.employee.id} permissions={session.permissions.map((permission) => permission.code)} initialOrderId={query.order_id} />;
}
