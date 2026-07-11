import { SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
          <Skeleton className="mt-3 h-6 w-28" />
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="flex shrink-0 gap-2 overflow-hidden border-b bg-muted/25 p-2 lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-44 shrink-0 lg:w-full" />
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <div className="border-b px-4 py-4 sm:px-5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="mt-2 h-4 w-72 max-w-full" />
            </div>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <Skeleton className="h-10 w-full max-w-xl" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
