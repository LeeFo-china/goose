import { redirect } from 'next/navigation';
import { InventoryWorkspace } from '@/components/inventory/inventory-workspace';
import { inventoryAccess } from '@/components/inventory/inventory-rules';
import { getAdminSession } from '@/lib/auth';

export default async function InventoryPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  return (
    <InventoryWorkspace
      {...inventoryAccess(session.permissions.map(({ code }) => code))}
    />
  );
}
