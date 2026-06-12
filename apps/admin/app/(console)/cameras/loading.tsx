import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CamerasLoading() {
  return (
    <div className="flex min-h-[calc(100vh-6.5rem)] flex-col gap-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <Skeleton className="size-10 shrink-0" />
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-80 max-w-full" />
            <div className="mt-1 flex flex-wrap gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-28" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col p-0">
          <div className="border-b bg-card px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-44" />
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,22rem)_auto_auto] lg:w-auto">
                <Skeleton className="h-9" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          </div>

          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="border-b">
              <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3 w-80 max-w-full" />
                </div>
                <Skeleton className="h-6 w-52" />
              </div>
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-3 bg-muted/20 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
