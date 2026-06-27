import { Skeleton } from "@/components/ui/skeleton";

export default function OpsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-md" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="flex items-end justify-between border-b pb-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}
