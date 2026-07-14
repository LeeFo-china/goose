import { AlertTriangle, CircleAlert, ClipboardList, FolderKanban } from "lucide-react";
import type { ProjectOperationalRiskDisplayPage } from "@gooes/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectHealthSummaryCards({
  data,
}: {
  data: ProjectOperationalRiskDisplayPage | null;
}) {
  const items = data
    ? [
      { label: "风险总数", value: data.summary.total, icon: CircleAlert, hint: "当前筛选命中" },
      { label: "严重风险", value: data.summary.danger, icon: AlertTriangle, hint: "高风险优先处理" },
      { label: "受影响项目", value: data.summary.affected_projects, icon: FolderKanban, hint: "涉及项目数" },
      { label: "高优先级工单", value: data.summary.by_type.service_ticket, icon: ClipboardList, hint: "客服问题风险" },
    ]
    : null;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {(items ?? Array.from({ length: 4 })).map((item, index) => {
        const Icon = item && "icon" in item ? item.icon : CircleAlert;
        return (
          <Card key={item && "label" in item ? item.label : index} className="shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2">
              {item && "label" in item ? (
                <>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {item.label}
                  </CardTitle>
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                </>
              ) : (
                <Skeleton className="h-4 w-20" />
              )}
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {item && "value" in item ? (
                <>
                  <div className="text-2xl font-semibold tabular-nums">{item.value}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                </>
              ) : (
                <Skeleton className="h-8 w-16" />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
