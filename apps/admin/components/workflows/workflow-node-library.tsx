"use client";

import { WorkflowNodeTypeConfig } from "@gooes/domain";
import { GripVertical, Plus } from "lucide-react";
import {
  WorkflowNodePresetGroupLabels,
  WorkflowNodePresets,
  type WorkflowNodePresetGroup,
} from "@/components/workflows/workflow-node-presets";
import { Badge } from "@/components/ui/badge";

const nodePresetGroups: WorkflowNodePresetGroup[] = [
  "control",
  "business",
  "construction",
  "procedure",
  "approval",
  "system",
];

export const WORKFLOW_NODE_PRESET_DRAG_TYPE = "application/x-gooes-workflow-node-preset";

export function WorkflowNodeLibrary({
  disabled,
  onAddNode,
}: {
  disabled?: boolean;
  onAddNode: (presetKey: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r bg-muted/20">
      <div>
        <div className="border-b bg-background px-3 py-2">
          <h2 className="text-sm font-semibold">节点库</h2>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {nodePresetGroups.map((group) => {
          const presets = WorkflowNodePresets.filter((preset) => preset.group === group);
          return (
            <div key={group} className="mb-4 last:mb-0">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {WorkflowNodePresetGroupLabels[group]}
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
                      "group rounded-md border bg-background p-2 text-left shadow-sm transition",
                      "hover:border-primary/60 hover:bg-primary/5",
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
                          <Badge variant="outline" className="shrink-0">
                            {WorkflowNodeTypeConfig[preset.nodeType].label}
                          </Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {preset.description}
                        </div>
                      </div>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 group-hover:bg-muted group-hover:opacity-100">
                        <Plus className="size-4" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
