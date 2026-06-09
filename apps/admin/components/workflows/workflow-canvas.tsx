"use client";

import { WorkflowNodeTypeConfig } from "@gooes/domain";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";

export function WorkflowCanvas({
  nodes,
  edges,
  selectedNodeKey,
  onSelectNode,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeKey: string | null;
  onSelectNode: (nodeKey: string) => void;
}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="relative min-h-0 overflow-auto bg-muted/30">
      <svg className="absolute inset-0 h-[900px] w-[1300px]" aria-hidden="true">
        <defs>
          <marker
            id="workflow-arrow"
            markerHeight="10"
            markerUnits="strokeWidth"
            markerWidth="10"
            orient="auto"
            refX="8"
            refY="3"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const source = nodeById.get(edge.source_node_id);
          const target = nodeById.get(edge.target_node_id);
          if (!source || !target) return null;

          return (
            <line
              key={edge.id}
              markerEnd="url(#workflow-arrow)"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="2"
              x1={source.position.x + 180}
              x2={target.position.x}
              y1={source.position.y + 36}
              y2={target.position.y + 36}
            />
          );
        })}
      </svg>
      <div className="relative h-[900px] w-[1300px]">
        {nodes.map((node) => {
          const selected = node.node_key === selectedNodeKey;
          return (
            <button
              key={node.id}
              type="button"
              className={[
                "absolute flex h-[72px] w-[180px] flex-col items-start",
                "justify-center rounded-md border bg-background px-3 text-left",
                "shadow-sm transition focus-visible:outline-none focus-visible:ring-2",
                selected
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/60",
              ].join(" ")}
              style={{ left: node.position.x, top: node.position.y }}
              onClick={() => onSelectNode(node.node_key)}
            >
              <span className="max-w-full truncate text-sm font-medium">
                {node.title}
              </span>
              <Badge variant="outline" className="mt-1">
                {WorkflowNodeTypeConfig[node.node_type]?.label || node.node_type}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
