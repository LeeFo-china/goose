import { FolderKanban } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <FolderKanban aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-2 h-4 w-[360px] max-w-full" />
            <div
              aria-hidden="true"
              data-testid="project-section-tabs-loading"
              className="mt-3 flex overflow-x-auto"
            >
              <div className="flex h-auto min-w-max justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0">
                <Skeleton className="h-8 w-16 rounded-none" />
                <Skeleton className="h-8 w-16 rounded-none" />
              </div>
            </div>
          </div>
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[150px_170px_150px_150px_minmax(220px,1fr)_72px]">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-9" />
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-hidden">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="border-b px-4 py-3">
                <Skeleton className="h-10" />
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
