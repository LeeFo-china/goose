import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { MaterialWorkspace } from '@/components/warehouse-materials/material-workspace';

export default async function WarehouseIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  if (!session.employee.id) redirect('/');
  const query = await searchParams;
  return (
    <MaterialWorkspace
      kind="issue"
      employeeId={session.employee.id}
      permissions={session.permissions.map((permission) => permission.code)}
      initialOrderId={query.order_id}
    />
  );
}
