import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformServiceOrdersLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-[34rem] max-w-[70vw]" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex gap-5">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 flex-1 min-w-[220px]" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="flex-1 p-3">
          <div className="flex flex-col gap-1">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
