import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerServiceLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-[360px]" />
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_160px_1fr_72px]">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
