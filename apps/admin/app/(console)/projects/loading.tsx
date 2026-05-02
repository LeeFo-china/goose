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
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="size-10" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[150px_150px_1fr_72px]">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
