import { Skeleton } from "@/components/ui/skeleton";

export default function TenantSupplierCatalogLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5" aria-label="正在加载供应商目录">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="min-h-80 flex-1 rounded-lg" />
    </div>
  );
}
