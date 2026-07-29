import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformBrandingAddonLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-6 w-16" />
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-hidden">
          <div className="flex flex-col gap-5">
            <Skeleton className="h-20 w-full" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-36 w-full md:col-span-2" />
              <Skeleton className="h-20 w-full md:col-span-2" />
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>

        <CardFooter className="shrink-0 justify-end border-t pt-5">
          <Skeleton className="h-9 w-24" />
        </CardFooter>
      </Card>
    </div>
  );
}
