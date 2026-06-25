import { Plus, Search, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

export function EmployeeListSkeleton() {
  return (
    <div
      className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <UsersRound aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">员工管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              正在加载员工档案、登录绑定、部门岗位和角色权限。
            </p>
          </div>
        </div>
        <Button disabled>
          <Plus />
          新增员工
        </Button>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {["全部", "在职", "待入职", "已封禁", "已离职"].map((item, index) => (
                <div
                  key={item}
                  className={cn(
                    "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium",
                    index === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground",
                  )}
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="flex w-full gap-2 xl:w-[360px]">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input disabled placeholder="搜索姓名或手机号" className="pl-9" />
              </div>
              <Button type="button" variant="outline" disabled>搜索</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col bg-card p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="sticky top-0 z-10 bg-card text-left text-xs font-medium text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
                <tr>
                  <th className="px-5 py-3">员工</th>
                  <th className="px-5 py-3">手机号</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">登录绑定</th>
                  <th className="px-5 py-3">角色</th>
                  <th className="px-5 py-3">部门</th>
                  <th className="px-5 py-3">职位</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right lg:sticky lg:right-0 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <SkeletonBlock className="size-9" />
                        <div className="flex flex-col gap-2">
                          <SkeletonBlock className="h-4 w-24" />
                          <SkeletonBlock className="h-3 w-56" />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <SkeletonBlock className="h-4 w-24" />
                    </td>
                    <td className="px-5 py-4">
                      <SkeletonBlock className="h-6 w-14" />
                    </td>
                    <td className="px-5 py-4">
                      <SkeletonBlock className="h-6 w-16" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        <SkeletonBlock className="h-6 w-20" />
                        <SkeletonBlock className="h-6 w-16" />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <SkeletonBlock className="h-4 w-20" />
                        <SkeletonBlock className="h-3 w-14" />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <SkeletonBlock className="h-4 w-16" />
                        <SkeletonBlock className="h-3 w-12" />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <SkeletonBlock className="h-4 w-20" />
                    </td>
                    <td className="px-5 py-4 text-right lg:sticky lg:right-0 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]">
                      <div className="flex justify-end">
                        <SkeletonBlock className="h-8 w-20" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="tabular-nums">
                第 1 / 1 页
              </Badge>
              <SkeletonBlock className="h-4 w-32" />
            </div>
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
