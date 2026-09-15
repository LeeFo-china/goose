import { Skeleton } from "@/components/ui/skeleton";

export default function ServiceProviderSettingsLoading() {
  return (
    <div className="h-[calc(100vh-6.5625rem)] overflow-y-auto p-5 lg:p-6">
      <header className="mx-auto mb-5 max-w-6xl" aria-label="服务商资料加载中">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </header>
      <div className="mx-auto max-w-6xl rounded-md bg-card px-5 sm:px-7">
        <section className="flex flex-col justify-between gap-5 border-b py-6 lg:flex-row">
          <div className="space-y-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-24" />
          </div>
        </section>
        <section className="border-b py-6" aria-label="公开资料加载中">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
              <Skeleton className="h-36" />
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16 md:col-span-2" />
                <Skeleton className="h-16 md:col-span-2" />
              </div>
            </div>
            <div>
              <Skeleton className="mb-3 h-4 w-20" />
              <Skeleton className="h-64 lg:h-[360px]" />
            </div>
          </div>
        </section>
        <section className="py-6" aria-label="服务区域加载中">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="mt-4 space-y-3 border-y py-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-8" />)}
          </div>
          <Skeleton className="mt-4 h-8 w-48 max-w-full" />
        </section>
      </div>
    </div>
  );
}
