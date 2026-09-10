import { redirect } from 'next/navigation';
import { StocktakeWorkspace } from '@/components/warehouse-stocktakes/stocktake-workspace';
import { getAdminSession } from '@/lib/auth';
export default async function WarehouseStocktakesPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  if (!session.employee.id) redirect('/');
  const query = await searchParams;
  return (
    <StocktakeWorkspace
      employeeId={session.employee.id}
      permissions={session.permissions.map((permission) => permission.code)}
      initialOrderId={query.order_id}
    />
  );
}
