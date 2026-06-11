"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  WORKFLOW_FLOW_BRANCH_NODE_HEIGHT,
  WORKFLOW_FLOW_BRANCH_NODE_WIDTH,
  type WorkflowFlowBranchNodeData,
} from "@/components/workflows/workflow-flow-types";

type WorkflowFlowBranchNodeProps = NodeProps<Node<WorkflowFlowBranchNodeData, "workflowBranch">>;

export function WorkflowFlowBranchNode({ data }: WorkflowFlowBranchNodeProps) {
  const { branchNode } = data;
  const [primary, secondary] = branchNode.outcomes;

  return (
    <div
      data-workflow-branch-source-key={branchNode.sourceNodeKey}
      className={[
        "relative flex cursor-move items-center justify-center text-xs font-medium text-foreground",
        data.connecting ? "z-30" : "z-20",
      ].join(" ")}
      style={{
        width: WORKFLOW_FLOW_BRANCH_NODE_WIDTH,
        height: WORKFLOW_FLOW_BRANCH_NODE_HEIGHT,
      }}
    >
      <svg
        data-workflow-branch-diamond="true"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-visible"
        viewBox={`0 0 ${WORKFLOW_FLOW_BRANCH_NODE_WIDTH} ${WORKFLOW_FLOW_BRANCH_NODE_HEIGHT}`}
      >
        <path
          d={[
            `M ${WORKFLOW_FLOW_BRANCH_NODE_WIDTH / 2} 4`,
            `L ${WORKFLOW_FLOW_BRANCH_NODE_WIDTH - 4} ${WORKFLOW_FLOW_BRANCH_NODE_HEIGHT / 2}`,
            `L ${WORKFLOW_FLOW_BRANCH_NODE_WIDTH / 2} ${WORKFLOW_FLOW_BRANCH_NODE_HEIGHT - 4}`,
            `L 4 ${WORKFLOW_FLOW_BRANCH_NODE_HEIGHT / 2}`,
            "Z",
          ].join(" ")}
          className="fill-background stroke-warning/70 drop-shadow-[0_10px_18px_hsl(var(--foreground)/0.10)]"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="pointer-events-none relative z-10 max-w-16 text-center leading-4">
        {branchNode.title}
      </div>
      <Handle
        id="branch-input"
        type="target"
        position={Position.Left}
        className="!size-3 !border !border-border !bg-background"
        isConnectable={!data.disabled}
      />
      {primary ? (
        <Handle
          id={primary.key}
          type="source"
          position={Position.Right}
          data-workflow-branch-output={primary.key}
          data-workflow-branch-output-tone="success"
          aria-label={`${branchNode.title}${primary.label}出口`}
          className="!size-3.5 !border !border-emerald-600 !bg-emerald-500"
          isConnectable={!data.disabled}
        />
      ) : null}
      {secondary ? (
        <Handle
          id={secondary.key}
          type="source"
          position={Position.Bottom}
          data-workflow-branch-output={secondary.key}
          data-workflow-branch-output-tone="failure"
          aria-label={`${branchNode.title}${secondary.label}出口`}
          className="!size-3.5 !border !border-destructive !bg-destructive"
          isConnectable={!data.disabled}
        />
      ) : null}
    </div>
  );
}
