import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformBrandingAddonLoading() {
  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex shrink-0 items-start gap-3">
        <Skeleton className="size-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-80 max-w-[70vw]" />
        </div>
      </div>

      <div
        data-testid="platform-branding-loading-tabs"
        className="flex shrink-0 gap-5 border-b"
      >
        <Skeleton className="h-9 w-32 rounded-none" />
        <Skeleton className="h-9 w-20 rounded-none" />
        <Skeleton className="h-9 w-20 rounded-none" />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader
          className="shrink-0 space-y-3 border-b bg-muted/20 p-3"
        >
          <div
            data-testid="platform-branding-loading-configuration"
            className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-3"
          >
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div
            data-testid="platform-branding-loading-filters"
            className="flex gap-3"
          >
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-24" />
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 space-y-1 overflow-hidden p-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
          <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
