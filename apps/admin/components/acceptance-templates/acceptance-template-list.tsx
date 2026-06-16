"use client";

import { Loader2 } from "lucide-react";
import type { AcceptanceTemplate } from "@/components/projects/project-acceptance-types";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  getAcceptanceTemplateStageLabel,
  getAcceptanceTypeLabel,
} from "@/components/acceptance-templates/acceptance-template-options";
import { cn } from "@/lib/utils";

export function AcceptanceTemplateList({
  templates,
  selectedTemplateId,
  pending,
  disabled,
  onSelect,
}: {
  templates: AcceptanceTemplate[];
  selectedTemplateId: string;
  pending: boolean;
  disabled: boolean;
  onSelect: (templateId: string) => void;
}) {
  return (
    <aside className="flex min-h-[260px] flex-col border-b lg:min-h-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">模板列表</div>
          <div className="text-xs text-muted-foreground">
            当前筛选 {templates.length} 个模板
          </div>
        </div>
        {pending ? (
          <Badge variant="secondary">
            <Loader2 className="animate-spin" data-icon="inline-start" />
            更新中
          </Badge>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {templates.length === 0 ? (
          <Empty className="h-full border-0 p-6">
            <EmptyHeader>
              <EmptyTitle className="text-base">暂无模板</EmptyTitle>
              <EmptyDescription>
                当前筛选条件下没有验收模板。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={cn(
                  "rounded-md border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40",
                  selectedTemplateId === template.id && "border-primary bg-secondary/60",
                )}
                disabled={disabled}
                onClick={() => onSelect(template.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {template.name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {getAcceptanceTypeLabel(template.acceptance_type)}
                      {" · "}
                      {getAcceptanceTemplateStageLabel(template.stage_code)}
                    </div>
                  </div>
                  <Badge
                    variant={template.status === "active" ? "success" : "secondary"}
                    className="shrink-0"
                  >
                    {template.status === "active" ? "启用" : "停用"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">v{template.version}</Badge>
                  <span>{template.sections?.length || 0} 个分组</span>
                  <span>
                    {(template.sections || []).reduce(
                      (sum, section) => sum + section.items.length,
                      0,
                    )} 项
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
