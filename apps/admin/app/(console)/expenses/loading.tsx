import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExpensesLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="size-10" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 xl:grid-cols-[140px_140px_160px_1fr_72px]">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
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
