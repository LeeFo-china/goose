import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function OpsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full max-w-96" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-24 shrink-0 rounded-md" />
          ))}
        </div>
        <Separator />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-full max-w-72" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <Separator />
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}
