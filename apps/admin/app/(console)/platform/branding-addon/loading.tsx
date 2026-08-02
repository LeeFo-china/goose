import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformBrandingAddonLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex shrink-0 items-start gap-3">
        <Skeleton className="size-10 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-80 max-w-[70vw]" />
        </div>
      </div>

      <div
        data-testid="platform-branding-loading-tabs"
        className="flex shrink-0 gap-5 border-b"
      >
        <Skeleton className="h-9 w-24 rounded-none" />
        <Skeleton className="h-9 w-20 rounded-none" />
        <Skeleton className="h-9 w-20 rounded-none" />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex-row items-start justify-between gap-4 border-b">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-96 max-w-[60vw]" />
          </div>
          <Skeleton className="h-6 w-14" />
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-auto p-5">
          <div className="flex min-h-full flex-col gap-6">
            <section
              data-testid="platform-branding-loading-product-fields"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-72 max-w-[60vw]" />
              </div>
              <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-24 w-full md:col-span-2" />
                <Skeleton className="h-20 w-full md:col-span-2" />
              </div>
            </section>

            <section
              data-testid="platform-branding-loading-payment-summary"
              className="flex flex-col gap-4 border-t pt-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-80 max-w-[55vw]" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-12 w-full" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
              </div>
            </section>
          </div>
        </CardContent>

        <CardFooter className="shrink-0 justify-end border-t pt-5">
          <Skeleton className="h-9 w-24" />
        </CardFooter>
      </Card>
    </div>
  );
}
