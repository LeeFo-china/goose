import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-16" />
            ))}
          </div>
        </div>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-card px-4 py-0">
          <div className="flex h-11 items-center gap-5 overflow-hidden">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-20 shrink-0" />
            ))}
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          <div className="border-b bg-muted/20 px-4 py-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-2 h-4 w-80 max-w-full" />
          </div>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="border-b px-4 py-3">
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
