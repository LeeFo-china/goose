"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, History, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/admin/data-table";
import {
  formatWorkflowDate,
  workflowCategoryLabel,
  workflowStatusLabel,
  workflowStatusVariant,
} from "@/components/workflows/workflow-labels";
import { setProjectConstructionDefaultWorkflow } from "@/components/workflows/workflow-requests";
import { WorkflowVersionInlineList } from "@/components/workflows/workflow-version-list-panel";
import type { WorkflowDefinition } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getWorkflowRuntimeIntegrationHint } from "@/components/workflows/workflow-business-track";
import { canSetProjectConstructionDefaultWorkflow } from "@/components/workflows/workflow-project-construction-default";

const WORKFLOW_TABLE_ROW_HEIGHT_CLASS_NAME = "h-[var(--workflow-table-row-height,88px)]";
const WORKFLOW_IDENTITY_COLUMN_CLASS_NAME = "w-[230px] min-w-0";
const WORKFLOW_CATEGORY_COLUMN_CLASS_NAME = "hidden w-[104px] whitespace-nowrap lg:table-cell";
const WORKFLOW_STATUS_COLUMN_CLASS_NAME = "w-[92px] whitespace-nowrap";
const WORKFLOW_VERSION_COLUMN_CLASS_NAME = "hidden w-[92px] whitespace-nowrap md:table-cell";
const WORKFLOW_UPDATED_COLUMN_CLASS_NAME = "hidden w-[118px] whitespace-nowrap xl:table-cell";
const WORKFLOW_DESCRIPTION_COLUMN_CLASS_NAME = "hidden w-[220px] min-w-0 2xl:table-cell";
const WORKFLOW_ACTION_COLUMN_CLASS_NAME = "w-[220px] text-right";

function WorkflowIdentityCell({ workflow }: { workflow: WorkflowDefinition }) {
  const integrationHint = getWorkflowRuntimeIntegrationHint(workflow);
  const isProjectConstructionDefault =
    workflow.project_construction_binding?.is_default === true;

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
        {isProjectConstructionDefault ? (
          <Badge variant="outline" className="mt-1 w-fit">
            默认施工
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

function ProjectConstructionDefaultAction({ workflow }: { workflow: WorkflowDefinition }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isDefault = workflow.project_construction_binding?.is_default === true;
  const canSetDefault = canSetProjectConstructionDefaultWorkflow(workflow);

  if (!canSetDefault) return null;

  if (isDefault) {
    return (
      <Badge variant="secondary" className="h-8 whitespace-nowrap px-2">
        <Star data-icon="inline-start" />
        默认施工
      </Badge>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            await setProjectConstructionDefaultWorkflow(workflow.id);
            toast.success("已设置默认施工流程");
            router.refresh();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "设置默认施工流程失败");
          }
        });
      }}
    >
      {pending ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <Star data-icon="inline-start" />
      )}
      设默认
    </Button>
  );
}

function WorkflowVersionDialogAction({ workflow }: { workflow: WorkflowDefinition }) {
  if (!workflow.active_version_id) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <History data-icon="inline-start" />
          版本
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[86vh] max-w-[880px] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>流程版本</DialogTitle>
          <DialogDescription>
            {workflow.name} 的发布版本和运行中实例影响。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-auto">
          <WorkflowVersionInlineList
            activeVersionId={workflow.active_version_id}
            workflowId={workflow.id}
            className="border-0 shadow-none"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowActionsCell({ workflow }: { workflow: WorkflowDefinition }) {
  return (
    <div className="flex justify-end gap-2">
      <ProjectConstructionDefaultAction workflow={workflow} />
      <WorkflowVersionDialogAction workflow={workflow} />
      <Button asChild variant="outline" size="sm">
        <Link href={`/workflows/${workflow.id}`}>
          打开
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}

export function WorkflowTable({
  workflows,
}: {
  workflows: WorkflowDefinition[];
}) {
  const columns = useMemo<ColumnDef<WorkflowDefinition>[]>(() => [
    {
      id: "workflow",
      header: "流程",
      cell: ({ row }) => <WorkflowIdentityCell workflow={row.original} />,
      meta: {
        headerClassName: WORKFLOW_IDENTITY_COLUMN_CLASS_NAME,
        cellClassName: WORKFLOW_IDENTITY_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "category",
      header: "分类",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {workflowCategoryLabel(row.original.category)}
        </span>
      ),
      meta: {
        headerClassName: WORKFLOW_CATEGORY_COLUMN_CLASS_NAME,
        cellClassName: WORKFLOW_CATEGORY_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "status",
      header: "状态",
      cell: ({ row }) => (
        <Badge
          className="whitespace-nowrap"
          variant={workflowStatusVariant(row.original.status)}
        >
          {workflowStatusLabel(row.original.status)}
        </Badge>
      ),
      meta: {
        headerClassName: WORKFLOW_STATUS_COLUMN_CLASS_NAME,
        cellClassName: WORKFLOW_STATUS_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "version",
      header: "当前版本",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.original.active_version_id ? "已绑定" : "未发布"}
        </span>
      ),
      meta: {
        headerClassName: WORKFLOW_VERSION_COLUMN_CLASS_NAME,
        cellClassName: WORKFLOW_VERSION_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "updatedAt",
      header: "更新时间",
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {formatWorkflowDate(row.original.updated_at)}
        </span>
      ),
      meta: {
        headerClassName: WORKFLOW_UPDATED_COLUMN_CLASS_NAME,
        cellClassName: WORKFLOW_UPDATED_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "description",
      header: "说明",
      cell: ({ row }) => <WorkflowDescription value={row.original.description} />,
      meta: {
        headerClassName: WORKFLOW_DESCRIPTION_COLUMN_CLASS_NAME,
        cellClassName: WORKFLOW_DESCRIPTION_COLUMN_CLASS_NAME,
      },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <WorkflowActionsCell workflow={row.original} />,
      meta: {
        headerClassName: WORKFLOW_ACTION_COLUMN_CLASS_NAME,
        cellClassName: WORKFLOW_ACTION_COLUMN_CLASS_NAME,
      },
    },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={workflows}
      emptyText="调整筛选条件，或新建流程后再编排节点。"
      tableClassName="border-t-0 table-fixed"
      rowClassName={() => WORKFLOW_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
