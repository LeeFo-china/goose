import { Skeleton } from "@/components/ui/skeleton";

export default function SupplierPurchaseRequisitionsLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5">
      <Skeleton className="h-14 w-full shrink-0" />
      <Skeleton className="min-h-80 flex-1 rounded-lg" />
    </div>
  );
}
