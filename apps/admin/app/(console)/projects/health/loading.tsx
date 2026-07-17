import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectHealthLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          aria-hidden="true"
          data-testid="project-section-tabs-loading"
          className="flex overflow-x-auto"
        >
          <div className="flex h-auto min-w-max justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0">
            <Skeleton className="h-8 w-16 rounded-none" />
            <Skeleton className="h-8 w-16 rounded-none" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="shadow-none">
            <CardHeader className="p-4">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <div
            data-testid="project-health-filter-loading"
            className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_180px_auto_auto]"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10" />
            </div>
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-10" />
            </div>
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10" />
            </div>
            <div className="flex items-end">
              <Skeleton className="h-11 w-full md:h-10 md:w-20" />
            </div>
            <div className="flex items-end">
              <Skeleton className="h-11 w-full md:h-10 md:w-20" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
        <CardFooter className="shrink-0 justify-between border-t bg-card px-4 py-3">
          <Skeleton className="h-6 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
