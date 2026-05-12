import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonBlock({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

export function PermissionListSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">权限点管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">正在加载权限编码、模块和状态。</p>
        </div>
        <Button disabled>
          <Shield data-icon="inline-start" />
          新增权限
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex items-center gap-3 p-4">
              <SkeletonBlock className="size-10" />
              <div className="flex flex-col gap-2">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-6 w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle>权限点列表</CardTitle>
              <CardDescription>正在加载权限点列表和当前筛选条件。</CardDescription>
            </div>
            <Badge variant="outline">加载中</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-[140px_180px_1fr_72px]">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-0">
          <div className="overflow-x-auto">
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
          <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
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
