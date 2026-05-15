import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ApprovalTimelineItem = {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  status?: string;
};

const statusLabel: Record<string, string> = {
  approved: "已通过",
  current: "当前",
  pending: "待处理",
  rejected: "已驳回",
  skipped: "已跳过",
};

function getVariant(status?: string) {
  if (status === "approved") return "success";
  if (status === "current" || status === "pending") return "warning";
  if (status === "rejected") return "danger";
  return "outline";
}

export function ApprovalTimeline({
  items,
  emptyText = "暂无流程记录",
  className,
}: {
  items: ApprovalTimelineItem[];
  emptyText?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => (
        <div key={item.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate font-medium">{item.title}</div>
            <div className="flex shrink-0 items-center gap-2">
              {item.meta ? (
                <span className="text-xs text-muted-foreground">{item.meta}</span>
              ) : null}
              {item.status ? (
                <Badge variant={getVariant(item.status)}>
                  {statusLabel[item.status] || item.status}
                </Badge>
              ) : null}
            </div>
          </div>
          {item.description ? (
            <div className="mt-1 text-muted-foreground">{item.description}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
