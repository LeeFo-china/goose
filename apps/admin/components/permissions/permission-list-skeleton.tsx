import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonBlock({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

export function PermissionListSkeleton() {
  return (
    <div
      className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <KeyRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">权限点管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">正在加载权限编码、模块和状态。</p>
          </div>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>权限点列表</span>
            <SkeletonBlock className="h-5 w-16" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[140px_180px_1fr_72px]">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1120px] border-t text-sm">
              <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">权限</th>
                  <th className="px-5 py-3">模块</th>
                  <th className="px-5 py-3">资源</th>
                  <th className="px-5 py-3">动作</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <SkeletonBlock className="h-4 w-28" />
                        <SkeletonBlock className="h-3 w-52" />
                      </div>
                    </td>
                    <td className="px-5 py-4"><SkeletonBlock className="h-4 w-20" /></td>
                    <td className="px-5 py-4"><SkeletonBlock className="h-4 w-20" /></td>
                    <td className="px-5 py-4"><SkeletonBlock className="h-4 w-16" /></td>
                    <td className="px-5 py-4"><SkeletonBlock className="h-6 w-14" /></td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <SkeletonBlock className="h-8 w-16" />
                        <SkeletonBlock className="h-8 w-16" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <SkeletonBlock className="h-4 w-32" />
            <div className="flex gap-2">
              <Button variant="outline" disabled>上一页</Button>
              <Button variant="outline" disabled>下一页</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
