"use client";

import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import {
  formatWorkflowDate,
  workflowCategoryLabel,
  workflowStatusLabel,
  workflowStatusVariant,
} from "@/components/workflows/workflow-labels";
import type { WorkflowDefinition } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getWorkflowRuntimeIntegrationHint } from "@/components/workflows/workflow-business-track";

function WorkflowIdentityCell({ workflow }: { workflow: WorkflowDefinition }) {
  const integrationHint = getWorkflowRuntimeIntegrationHint(workflow);

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="min-w-0 cursor-default border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="w-[15em] truncate font-semibold">
          {workflow.name}
        </div>
        <div className="w-[15em] truncate text-xs text-muted-foreground">
          {workflow.workflow_key}
        </div>
        {integrationHint ? (
          <Badge variant="secondary" className="mt-1 w-fit">
            {integrationHint.badge}
          </Badge>
        ) : null}
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[320px]">
        <div className="flex flex-col gap-1">
          <div className="break-all font-semibold">{workflow.name}</div>
          <div className="break-all text-xs opacity-90">编码：{workflow.workflow_key}</div>
          {integrationHint ? (
            <div className="text-xs opacity-90">
              {integrationHint.tooltip}
            </div>
          ) : null}
          <div className="break-all text-xs tabular-nums opacity-90">流程 ID：{workflow.id}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function WorkflowDescription({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-muted-foreground">未填写说明</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="block max-w-full cursor-default truncate border-0 bg-transparent p-0 text-left text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {value}
      </TooltipTrigger>
      <TooltipContent align="start" className="max-w-[360px]">
        <p className="text-sm leading-6">{value}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function WorkflowTable({
  workflows,
}: {
  workflows: WorkflowDefinition[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] table-fixed text-sm">
        <colgroup>
          <col className="w-[270px]" />
          <col className="w-[120px]" />
          <col className="w-[110px]" />
          <col className="w-[130px]" />
          <col className="w-[170px]" />
          <col className="w-[240px]" />
          <col className="w-[120px]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-card text-left text-xs font-medium text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
          <tr>
            <th className="whitespace-nowrap px-4 py-3">流程</th>
            <th className="whitespace-nowrap px-4 py-3">分类</th>
            <th className="whitespace-nowrap px-4 py-3">状态</th>
            <th className="whitespace-nowrap px-4 py-3">当前版本</th>
            <th className="whitespace-nowrap px-4 py-3">更新时间</th>
            <th className="whitespace-nowrap px-4 py-3">说明</th>
            <th className="sticky right-0 whitespace-nowrap bg-card px-4 py-3 text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {workflows.length > 0 ? (
            workflows.map((workflow) => (
              <tr
                key={workflow.id}
                className="group border-t transition-colors hover:bg-muted/40"
              >
                <td className="px-4 py-4">
                  <WorkflowIdentityCell workflow={workflow} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                  {workflowCategoryLabel(workflow.category)}
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <Badge
                    className="whitespace-nowrap"
                    variant={workflowStatusVariant(workflow.status)}
                  >
                    {workflowStatusLabel(workflow.status)}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                  {workflow.active_version_id ? "已绑定" : "未发布"}
                </td>
                <td className="whitespace-nowrap px-4 py-4 tabular-nums text-muted-foreground">
                  {formatWorkflowDate(workflow.updated_at)}
                </td>
                <td className="px-4 py-4">
                  <WorkflowDescription value={workflow.description} />
                </td>
                <td className="sticky right-0 whitespace-nowrap bg-card px-4 py-4 text-right shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)] transition-colors group-hover:bg-muted/40">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/workflows/${workflow.id}`}>
                      打开
                      <ArrowRight data-icon="inline-end" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-5 py-12 text-center text-muted-foreground" colSpan={7}>
                <div className="flex flex-col items-center gap-2">
                  <FileText className="size-8 text-muted-foreground/70" />
                  <div className="font-medium text-foreground">没有符合条件的流程</div>
                  <div className="text-sm">调整筛选条件，或新建流程后再编排节点。</div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
