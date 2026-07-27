import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function TenantDouyinMiniappWorkspaceLoading() {
  return (
    <main
      className="flex h-full min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 [scrollbar-gutter:stable] lg:p-6"
      aria-busy="true"
      aria-label="抖音小程序工作台加载中"
    >
      <header className="flex flex-col gap-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </header>

      <Card className="overflow-hidden">
        <CardHeader className="gap-4 border-b bg-muted/20">
          <div className="flex justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </CardHeader>

        <CardContent className="flex flex-col gap-6 pt-5">
          <LoadingSection columns={2} />
          <Separator />
          <LoadingSection columns={3} />
          <Separator />
          <LoadingSection columns={3} />
        </CardContent>
      </Card>
    </main>
  );
}

function LoadingSection({ columns }: { columns: 2 | 3 }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      <div
        className={
          columns === 2
            ? "grid gap-4 sm:grid-cols-2"
            : "grid gap-4 sm:grid-cols-3"
        }
      >
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton className="h-16 w-full" key={index} />
        ))}
      </div>
    </section>
  );
}
