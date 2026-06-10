"use client";

import { Blocks, GripVertical, Plus } from "lucide-react";
import {
  getWorkflowNodeTypeLabel,
  shouldShowWorkflowNodeTypeBadge,
} from "@/components/workflows/workflow-node-labels";
import {
  WorkflowNodePresetGroupLabels,
  WorkflowNodePresets,
  type WorkflowNodePresetGroup,
} from "@/components/workflows/workflow-node-presets";
import { Badge } from "@/components/ui/badge";

const nodePresetGroups: WorkflowNodePresetGroup[] = [
  "control",
  "common",
  "system",
];

export const WORKFLOW_NODE_PRESET_DRAG_TYPE = "application/x-gooes-workflow-node-preset";

export function WorkflowNodeLibrary({
  disabled,
  onAddNode,
  placement = "left",
}: {
  disabled?: boolean;
  onAddNode: (presetKey: string) => void;
  placement?: "left" | "right";
}) {
  return (
    <aside
      className={[
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        placement === "right" ? "border-l" : "border-r",
      ].join(" ")}
    >
      <div className="border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Blocks className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">节点库</h2>
            <p className="text-xs text-muted-foreground">点击添加，或拖到画布</p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3">
        {nodePresetGroups.map((group) => {
          const presets = WorkflowNodePresets.filter((preset) => preset.group === group);
          return (
            <section key={group} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-foreground">
                  {WorkflowNodePresetGroupLabels[group]}
                </div>
                <Badge variant="outline" className="bg-background text-[11px] text-muted-foreground">
                  {presets.length}
                </Badge>
              </div>
              <div className="grid gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.key}
                    data-workflow-node-preset={preset.key}
                    type="button"
                    draggable={!disabled}
                    disabled={disabled}
                    className={[
                      "group rounded-md border bg-background p-2.5 text-left shadow-sm transition",
                      "hover:-translate-y-px hover:border-primary/60 hover:bg-accent/15",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      disabled ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing",
                    ].join(" ")}
                    onClick={() => onAddNode(preset.key)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData(WORKFLOW_NODE_PRESET_DRAG_TYPE, preset.key);
                      event.dataTransfer.setData("text/plain", preset.key);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{preset.label}</span>
                          {preset.key === "workflow_step" ? (
                            <Badge variant="outline" className="shrink-0">
                              可配置
                            </Badge>
                          ) : shouldShowWorkflowNodeTypeBadge(preset.label, preset.nodeType) ? (
                            <Badge variant="outline" className="shrink-0">
                              {getWorkflowNodeTypeLabel(preset.nodeType)}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {preset.description}
                        </div>
                      </div>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground opacity-70 group-hover:bg-background group-hover:text-foreground group-hover:opacity-100">
                        <Plus className="size-4" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
