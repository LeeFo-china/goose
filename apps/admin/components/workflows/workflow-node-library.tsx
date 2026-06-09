"use client";

import {
  WorkflowNodeTypeConfig,
  type WorkflowNodeType,
} from "@gooes/domain";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const nodeTypes: WorkflowNodeType[] = [
  "start",
  "business",
  "construction_stage",
  "procedure",
  "approval",
  "confirmation",
  "notification",
  "automation",
  "subflow",
  "end",
];

export function WorkflowNodeLibrary({
  disabled,
  onAddNode,
}: {
  disabled?: boolean;
  onAddNode: (nodeType: WorkflowNodeType) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-3 border-r bg-muted/20 p-3">
      <div>
        <h2 className="text-sm font-semibold">节点库</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          点击添加节点，节点属性可在右侧编辑。
        </p>
      </div>
      <div className="grid gap-2 overflow-auto">
        {nodeTypes.map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            className="justify-start"
            disabled={disabled}
            onClick={() => onAddNode(type)}
          >
            <Plus data-icon="inline-start" />
            {WorkflowNodeTypeConfig[type].label}
          </Button>
        ))}
      </div>
    </aside>
  );
}
