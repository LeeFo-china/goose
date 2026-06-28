import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformAuditLogsLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col gap-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="shrink-0 grid gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className="shadow-none">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-12" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="grid gap-3 md:grid-cols-[190px_1fr_72px]">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-hidden">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="border-b px-4 py-3">
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-5 w-56" />
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
