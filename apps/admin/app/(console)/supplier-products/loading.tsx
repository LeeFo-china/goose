import { Skeleton } from "@/components/ui/skeleton";

export default function SupplierProductsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="min-h-80 flex-1 rounded-lg" />
    </div>
  );
}
