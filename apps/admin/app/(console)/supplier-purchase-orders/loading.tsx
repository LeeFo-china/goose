import { Skeleton } from "@/components/ui/skeleton";

export default function SupplierPurchaseOrdersLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="min-h-80 flex-1 rounded-lg" />
    </div>
  );
}
