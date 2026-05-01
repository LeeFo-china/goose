import { Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={[
        "animate-pulse rounded-md bg-muted",
        className,
      ].join(" ")}
    />
  );
}

export function EmployeeListSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">员工管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            正在加载员工档案、登录绑定和状态信息。
          </p>
        </div>
        <Button disabled>
          <UserRound />
          新增员工
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {["全部", "在职", "待入职", "已封禁", "已离职"].map((item, index) => (
                <div
                  key={item}
                  className={[
                    "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium",
                    index === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-slate-700",
                  ].join(" ")}
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="flex w-full gap-2 xl:w-[360px]">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input disabled placeholder="搜索姓名或手机号" className="pl-9" />
              </div>
              <Button type="button" variant="outline" disabled>搜索</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>员工列表</CardTitle>
          <Badge variant="outline">加载中</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-t text-sm">
              <thead className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">员工</th>
                  <th className="px-5 py-3">手机号</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">登录绑定</th>
                  <th className="px-5 py-3">部门</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <SkeletonBlock className="h-9 w-9" />
                        <div className="space-y-2">
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
                      <SkeletonBlock className="h-4 w-16" />
                    </td>
                    <td className="px-5 py-4">
                      <SkeletonBlock className="h-4 w-20" />
                    </td>
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

      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-4 w-32" />
        <div className="flex gap-2">
          <Button variant="outline" disabled>上一页</Button>
          <Button variant="outline" disabled>下一页</Button>
        </div>
      </div>
    </div>
  );
}
