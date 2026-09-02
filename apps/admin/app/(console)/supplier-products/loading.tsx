import { Skeleton } from "@/components/ui/skeleton";

export default function SupplierProductsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="min-h-80 flex-1 rounded-lg" />
    </div>
  );
}
