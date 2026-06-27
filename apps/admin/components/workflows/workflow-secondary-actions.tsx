"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, CircleMinus, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/admin/action-dialogs";
import { canRemoveProjectConstructionCandidateWorkflow } from "@/components/workflows/workflow-project-construction-default";
import {
  archiveWorkflowDefinition,
  removeProjectConstructionCandidateWorkflow,
} from "@/components/workflows/workflow-requests";
import type { WorkflowDefinition } from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type WorkflowSecondaryAction = "removeCandidate" | "archive";

export function WorkflowSecondaryActions({
  workflow,
}: {
  workflow: WorkflowDefinition;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogAction, setDialogAction] = useState<WorkflowSecondaryAction | null>(null);
  const canRemoveCandidate = canRemoveProjectConstructionCandidateWorkflow(workflow);
  const canArchive = workflow.status !== "archived";

  if (!canRemoveCandidate && !canArchive) return null;

  const isRemoveCandidate = dialogAction === "removeCandidate";
  const dialogTitle = isRemoveCandidate ? "移出施工候选" : "归档流程";
  const dialogDescription = isRemoveCandidate
    ? `${workflow.name} 将不再出现在创建项目的施工流程候选中，已创建项目不受影响。`
    : `${workflow.name} 归档后将不再用于新项目；已创建项目仍按原绑定流程执行。`;
  const confirmLabel = isRemoveCandidate ? "移出候选" : "归档";

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                disabled={pending}
                aria-label="更多操作"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>更多操作</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={6} className="w-40">
          {canRemoveCandidate ? (
            <DropdownMenuItem
              disabled={pending}
              className="text-destructive focus:text-destructive"
              onSelect={() => setDialogAction("removeCandidate")}
            >
              <CircleMinus />
              移出候选
            </DropdownMenuItem>
          ) : null}
          {canRemoveCandidate && canArchive ? <DropdownMenuSeparator /> : null}
          {canArchive ? (
            <DropdownMenuItem
              disabled={pending}
              className="text-destructive focus:text-destructive"
              onSelect={() => setDialogAction("archive")}
            >
              <Archive />
              归档
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmActionDialog
        open={dialogAction !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDialogAction(null);
        }}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={confirmLabel}
        pending={pending}
        destructive
        onConfirm={() => {
          if (!dialogAction) return;

          startTransition(async () => {
            try {
              if (dialogAction === "removeCandidate") {
                await removeProjectConstructionCandidateWorkflow(workflow.id);
                toast.success("已移出施工候选");
              } else {
                await archiveWorkflowDefinition(workflow.id);
                toast.success("已归档流程");
              }
              setDialogAction(null);
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "操作失败");
            }
          });
        }}
      />
    </>
  );
}
