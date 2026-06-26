import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationLoading() {
  return (
    <div
      className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Building2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="mt-2 h-4 w-96 max-w-full" />
          </div>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-card px-4 py-0">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex h-11 items-center">
              <Skeleton className="h-5 w-14" />
            </div>
            <div className="flex gap-2 pb-3 md:pb-0">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="shrink-0 border-b bg-muted/20 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid flex-1 gap-3 lg:grid-cols-[160px_1fr_72px]">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="h-10 w-24" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="hidden border-b bg-muted/60 px-4 py-2 lg:grid lg:grid-cols-[minmax(0,1fr)_88px_92px_104px_260px] lg:gap-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-4" />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="min-h-[112px] border-b px-4 py-3">
                <Skeleton className="h-9" />
              </div>
            ))}
          </div>

          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-4 w-32" />
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
