import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function ServiceProviderSettingsLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col overflow-hidden">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-4" aria-label="服务商公开资料加载中">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
                <div className="grid gap-4 md:grid-cols-2">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16 md:col-span-2" />
                  <Skeleton className="h-16 md:col-span-2" />
                  <Skeleton className="h-36 md:col-span-2" />
                </div>
                <div className="lg:sticky lg:top-0">
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-col gap-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <Skeleton className="h-8 w-20" />
                    </div>
                    <Skeleton className="mt-3 h-64 lg:h-[360px]" />
                  </div>
                </div>
              </div>
            </section>
            <Separator />
            <section className="flex flex-col gap-4" aria-label="服务区域加载中">
              <div className="flex justify-end">
                <Skeleton className="h-9 w-24" />
              </div>
              <div className="overflow-hidden rounded-md border">
                <div className="grid grid-cols-[minmax(140px,1fr)_140px_90px_100px_96px] gap-3 border-b px-4 py-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-4" />
                  ))}
                </div>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(140px,1fr)_140px_90px_100px_96px] gap-3 border-b px-4 py-4 last:border-b-0"
                  >
                    {Array.from({ length: 5 }).map((_, cellIndex) => (
                      <Skeleton key={cellIndex} className="h-6" />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <Skeleton className="h-4 w-36" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
