import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomersLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
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
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-6 w-28" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[150px_150px_150px_160px_1fr_72px]">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
          <div className="flex flex-col gap-3 pt-1 md:flex-row md:items-center md:justify-between">
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
