import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Skeleton className="h-6 w-28" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]">
            {Array.from({ length: 4 }).map((_, index) => (
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
