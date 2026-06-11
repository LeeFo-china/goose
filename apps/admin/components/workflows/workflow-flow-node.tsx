"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Settings } from "lucide-react";
import {
  getWorkflowBranchOutcomes,
  getWorkflowBranchSourceKind,
} from "@/components/workflows/workflow-branch-projection";
import {
  WORKFLOW_FLOW_DECISION_NODE_HEIGHT,
  WORKFLOW_FLOW_DECISION_NODE_WIDTH,
  WORKFLOW_FLOW_NODE_HEIGHT,
  WORKFLOW_FLOW_NODE_WIDTH,
  type WorkflowFlowNodeData,
} from "@/components/workflows/workflow-flow-types";
import {
  getWorkflowNodeCapability,
  getWorkflowNodeDisplayLabels,
  type WorkflowNodeCapability,
} from "@/components/workflows/workflow-node-capabilities";

type WorkflowFlowNodeProps = NodeProps<Node<WorkflowFlowNodeData, "workflowNode">>;

type WorkflowNodeVisualStyle = {
  accent: string;
  badge: string;
  dot: string;
};

const WORKFLOW_NODE_VISUAL_STYLES: Record<WorkflowNodeCapability, WorkflowNodeVisualStyle> = {
  business: {
    accent: "bg-sky-500",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  construction: {
    accent: "bg-indigo-500",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
  },
  procedure: {
    accent: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  finance: {
    accent: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
  },
  approval: {
    accent: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
  notification: {
    accent: "bg-cyan-500",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
    dot: "bg-cyan-500",
  },
  automation: {
    accent: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  subflow: {
    accent: "bg-slate-500",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-500",
  },
};

export function WorkflowFlowNode({ data }: WorkflowFlowNodeProps) {
  const { node } = data;
  const branchKind = getWorkflowBranchSourceKind(node);
  const branchOutcomes = branchKind ? getWorkflowBranchOutcomes(branchKind) : [];
  const [primaryOutcome, secondaryOutcome] = branchOutcomes;
  const isDecisionNode = Boolean(branchKind);
  const capability = getWorkflowNodeCapability(node);
  const displayLabels = getWorkflowNodeDisplayLabels(node);
  const visualStyle = WORKFLOW_NODE_VISUAL_STYLES[capability];
  const validationActive = data.validationState === "active";
  const validationError = data.validationState === "error";
  const validationSuccess = data.validationState === "success";
  const selected = data.selected;
  const isTerminalControlNode = node.node_type === "start" || node.node_type === "end";
  const nodeWidth = isDecisionNode ? WORKFLOW_FLOW_DECISION_NODE_WIDTH : WORKFLOW_FLOW_NODE_WIDTH;
  const nodeHeight = isDecisionNode ? WORKFLOW_FLOW_DECISION_NODE_HEIGHT : WORKFLOW_FLOW_NODE_HEIGHT;
  const activeBorderRadius = isTerminalControlNode ? (nodeHeight - 3) / 2 : 8;
  const decisionStrokeClass = validationError
    ? "stroke-destructive"
    : validationActive || selected || data.connecting
      ? "stroke-primary"
      : validationSuccess
        ? "stroke-success"
        : "stroke-warning/70";
  const validationChromeClass = validationActive
    ? "border-primary bg-primary/5 ring-4 ring-primary/20 shadow-[0_18px_42px_hsl(var(--primary)/0.20)]"
    : validationError
      ? "border-destructive/55 bg-destructive/5 ring-4 ring-destructive/15"
      : validationSuccess
        ? "border-success/45 bg-success/5 ring-2 ring-success/15"
        : null;

  return (
    <div
      data-workflow-node="true"
      data-workflow-decision-node={isDecisionNode ? node.node_key : undefined}
      data-workflow-node-key={node.node_key}
      data-workflow-validation-state={data.validationState}
      className={[
        "group relative overflow-visible text-left",
        isDecisionNode
          ? "bg-transparent"
          : [
              "border bg-background",
              isTerminalControlNode ? "rounded-full" : "rounded-lg",
              "shadow-[0_8px_20px_hsl(var(--foreground)/0.06)]",
            ].join(" "),
        "transition-[transform,box-shadow,border-color,background-color] duration-150",
        validationActive ? "scale-[1.08]" : selected ? "scale-[1.08]" : "scale-100",
        data.disabled ? "cursor-not-allowed opacity-70" : "cursor-move",
        isDecisionNode
          ? ""
          : validationChromeClass ||
            (data.connecting
              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
              : selected
                ? "border-primary bg-background ring-4 ring-primary/20 shadow-[0_18px_42px_hsl(var(--primary)/0.18)]"
                : "border-border hover:border-primary/45 hover:shadow-md"),
      ].join(" ")}
      style={{ width: nodeWidth, height: nodeHeight }}
    >
      {isDecisionNode ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-visible"
          viewBox={`0 0 ${nodeWidth} ${nodeHeight}`}
        >
          <path
            data-workflow-decision-diamond="true"
            d={getDecisionDiamondPath(nodeWidth, nodeHeight, 4)}
            className={[
              "fill-background drop-shadow-[0_10px_18px_hsl(var(--foreground)/0.10)]",
              decisionStrokeClass,
            ].join(" ")}
            strokeWidth={validationActive || selected ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
          />
          {validationActive ? (
            <path
              data-workflow-active-border="true"
              d={getDecisionDiamondPath(nodeWidth, nodeHeight, 8)}
              className="workflow-node-active-border-path fill-none stroke-primary"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
      ) : null}
      {validationActive ? (
        isDecisionNode ? null : (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[3px] z-10 overflow-visible"
            viewBox={`0 0 ${nodeWidth} ${nodeHeight}`}
          >
            <rect
              data-workflow-active-border="true"
              x="1.5"
              y="1.5"
              width={nodeWidth - 3}
              height={nodeHeight - 3}
              rx={activeBorderRadius}
              ry={activeBorderRadius}
              className="workflow-node-active-border-path fill-none stroke-primary"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )
      ) : null}
      <Handle
        id="input"
        type="target"
        position={Position.Left}
        data-node-input="true"
        data-node-id={node.id}
        aria-label={`${displayLabels.specificLabel} 输入端口`}
        className="!size-2.5 !border !border-border !bg-background"
        isConnectable={!data.disabled}
      />
      {isTerminalControlNode || isDecisionNode ? null : (
        <span
          aria-hidden="true"
          className={[
            "absolute inset-y-2 left-2 w-1 rounded-full transition-opacity",
            validationError ? "bg-destructive" : visualStyle.accent,
            selected || data.connecting || validationActive || validationSuccess || validationError ? "opacity-100" : "opacity-70",
          ].join(" ")}
        />
      )}
      <div
        className={[
          "relative z-10 flex h-full min-w-0 flex-col",
          isDecisionNode
            ? "items-center justify-center gap-2 px-7 py-0 text-center"
            : isTerminalControlNode
            ? "items-center justify-center gap-2 px-8 py-0 text-center"
            : "justify-between py-3 pl-5 pr-3 text-left",
        ].join(" ")}
      >
        <span
          className={[
            "inline-flex h-5 max-w-full items-center gap-1.5 self-start rounded-full border px-2 text-[11px] font-medium leading-none",
            isTerminalControlNode || isDecisionNode ? "self-center" : "",
            visualStyle.badge,
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={["size-1.5 rounded-full", visualStyle.dot].join(" ")}
          />
          <span className="truncate">{displayLabels.capabilityLabel}</span>
        </span>
        <span className="block w-full truncate text-[15px] font-semibold leading-5 text-foreground">
          {displayLabels.specificLabel}
        </span>
      </div>
      {selected ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 right-2 z-20 flex size-6 items-center justify-center rounded-full border border-primary/25 bg-primary/8 text-primary shadow-sm"
        >
          <Settings className="size-3.5" />
        </span>
      ) : null}
      {isDecisionNode ? (
        <>
          {primaryOutcome ? (
            <Handle
              id={primaryOutcome.key}
              type="source"
              position={Position.Right}
              data-node-action="output"
              data-node-port="output"
              data-node-id={node.id}
              data-workflow-branch-output={primaryOutcome.key}
              data-workflow-branch-output-tone="success"
              aria-label={`${displayLabels.specificLabel}${primaryOutcome.label}出口`}
              className="!size-3.5 !border !border-emerald-600 !bg-emerald-500"
              isConnectable={!data.disabled}
            />
          ) : null}
          {secondaryOutcome ? (
            <Handle
              id={secondaryOutcome.key}
              type="source"
              position={Position.Bottom}
              data-node-id={node.id}
              data-workflow-branch-output={secondaryOutcome.key}
              data-workflow-branch-output-tone="failure"
              aria-label={`${displayLabels.specificLabel}${secondaryOutcome.label}出口`}
              className="!size-3.5 !border !border-destructive !bg-destructive"
              isConnectable={!data.disabled}
            />
          ) : null}
        </>
      ) : (
        <Handle
          id="output"
          type="source"
          position={Position.Right}
          data-node-action="output"
          data-node-port="output"
          data-node-id={node.id}
          aria-label={`${displayLabels.specificLabel} 输出端口`}
          className="!size-2.5 !border !border-border !bg-background"
          isConnectable={!data.disabled}
        />
      )}
    </div>
  );
}

function getDecisionDiamondPath(width: number, height: number, inset: number) {
  return [
    `M ${width / 2} ${inset}`,
    `L ${width - inset} ${height / 2}`,
    `L ${width / 2} ${height - inset}`,
    `L ${inset} ${height / 2}`,
    "Z",
  ].join(" ");
}
