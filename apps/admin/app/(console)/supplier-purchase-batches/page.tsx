import { redirect } from "next/navigation";
import { BatchWorkspace } from "@/components/supplier-purchase-batches/batch-workspace";
import { batchAccess } from "@/components/supplier-purchase-batches/batch-rules";
import { getAdminSession } from "@/lib/auth";

export default async function SupplierPurchaseBatchesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return (
    <BatchWorkspace
      access={batchAccess(session.permissions.map(({ code }) => code))}
    />
  );
}
