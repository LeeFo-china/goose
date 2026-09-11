import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function PlatformDouyinMiniappsLoading() {
  return (
    <div
      aria-busy="true"
      className="flex h-full min-h-0 flex-col gap-8 overflow-y-auto pb-10 pr-1 [scrollbar-gutter:stable]"
    >
      <section aria-label="抖音模板版本加载中" className="space-y-5">
        <LoadingHeader titleWidth="w-40" descriptionWidth="w-56" action />
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="flex flex-col justify-between gap-3 border-b p-6 sm:flex-row sm:items-start">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-6 w-28" />
          </div>
          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  data-slot="template-version-skeleton"
                  className="space-y-3 rounded-md border bg-muted/20 p-4"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-36" />
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-52 max-w-full" />
              </div>
              <Skeleton className="h-9 w-full sm:w-36" />
            </div>
          </div>
        </div>
      </section>

      <section aria-label="商户发布审核加载中" className="space-y-5">
        <LoadingHeader titleWidth="w-32" descriptionWidth="w-96" />
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="space-y-2 border-b p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="space-y-5 p-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="grid gap-3 sm:grid-cols-[6rem_minmax(0,1fr)]">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton
                  key={index}
                  className={index % 2 === 0 ? "h-4 w-16" : "h-4 w-full max-w-56"}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function LoadingHeader({
  action = false,
  descriptionWidth,
  titleWidth,
}: {
  action?: boolean;
  descriptionWidth: string;
  titleWidth: string;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <Skeleton className={`h-7 ${titleWidth}`} />
        <Skeleton className={`h-4 max-w-full ${descriptionWidth}`} />
      </div>
      {action ? <Skeleton className="h-9 w-full sm:w-36" /> : null}
    </header>
  );
}
