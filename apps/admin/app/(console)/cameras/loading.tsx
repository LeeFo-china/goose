import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CamerasLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="size-10" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-6 w-28" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Skeleton className="h-10" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-10 w-16" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-md border">
              <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-4 w-80" />
                </div>
                <Skeleton className="h-6 w-52" />
              </div>
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-3 pt-1 md:flex-row md:items-center md:justify-between">
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
