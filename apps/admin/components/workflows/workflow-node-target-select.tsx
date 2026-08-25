"use client";

import type { WorkflowNode } from "@/components/workflows/workflow-types";
import { getWorkflowNodeDisplayLabels } from "@/components/workflows/workflow-node-capabilities";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_TARGET_VALUE = "__none__";

export function WorkflowNodeTargetSelect({
  disabled,
  nodes,
  placeholder = "选择节点",
  value,
  onChange,
}: {
  disabled?: boolean;
  nodes: WorkflowNode[];
  placeholder?: string;
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const selectedValue = value || EMPTY_TARGET_VALUE;
  const hasSelectedNode = nodes.some((node) => node.node_key === value);

  return (
    <Select
      disabled={disabled}
      value={selectedValue}
      onValueChange={(nextValue) =>
        onChange(nextValue === EMPTY_TARGET_VALUE ? null : nextValue)
      }
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY_TARGET_VALUE}>无回退节点</SelectItem>
        {value && !hasSelectedNode ? (
          <SelectItem value={value}>未知节点</SelectItem>
        ) : null}
        {nodes.map((node) => {
          const labels = getWorkflowNodeDisplayLabels(node);
          return (
            <SelectItem key={node.id} value={node.node_key}>
              {labels.specificLabel} · {labels.capabilityLabel}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
