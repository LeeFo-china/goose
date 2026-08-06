import { Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const rows = Array.from({ length: 8 }, (_, index) => index);

export default function PlatformOperatorsLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <Shield aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-normal">平台人员</h1>
              <Badge variant="outline">加载中</Badge>
            </div>
            <Skeleton className="mt-2 h-4 w-[360px] max-w-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-9 min-w-[240px] flex-1" />
            <Skeleton className="h-9 w-[132px]" />
            <Skeleton className="h-9 w-[132px]" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="grid grid-cols-[minmax(230px,1.4fr)_128px_88px_minmax(220px,1fr)_156px_230px] gap-0 border-t bg-muted/60 px-4 py-3 text-sm">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="ml-auto h-4 w-10" />
            </div>
            {rows.map((row) => (
              <div
                key={row}
                className="grid h-[76px] grid-cols-[minmax(230px,1.4fr)_128px_88px_minmax(220px,1fr)_156px_230px] items-center border-t px-4"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-md" />
                  <div className="flex min-w-0 flex-col gap-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-14 rounded-md" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
                <Skeleton className="h-4 w-28" />
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="size-8" />
                </div>
              </div>
            ))}
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-32" />
            </div>
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
