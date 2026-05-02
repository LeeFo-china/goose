import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonBlock({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

export function PermissionListSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">角色权限</h1>
          <p className="mt-1 text-sm text-muted-foreground">正在加载权限编码、模块和状态。</p>
        </div>
        <Button disabled>
          <Shield />
          新增权限
        </Button>
      </div>
      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[140px_180px_1fr_72px]">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle>权限列表</CardTitle>
          <Badge variant="outline">加载中</Badge>
        </CardHeader>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>
    </div>
  );
}
