"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WorkflowDesignerGraph,
  WorkflowValidationResult,
} from "@/components/workflows/workflow-designer-types";
import type { WorkflowNode } from "@/components/workflows/workflow-types";

type WorkflowValidationPlaybackStep = {
  nodeIds: string[];
  edgeIds: string[];
};

export type WorkflowValidationPlaybackSnapshot = {
  activeNodeIds: string[];
  activeEdgeIds: string[];
  errorNodeIds: string[];
  successNodeIds: string[];
  status: "idle" | "running" | "success" | "error";
};

export const EMPTY_WORKFLOW_VALIDATION_PLAYBACK: WorkflowValidationPlaybackSnapshot = {
  activeNodeIds: [],
  activeEdgeIds: [],
  errorNodeIds: [],
  successNodeIds: [],
  status: "idle",
};

const PLAYBACK_STEP_MS = 420;

export function useWorkflowValidationPlayback(graph: WorkflowDesignerGraph | null) {
  const timerIdsRef = useRef<number[]>([]);
  const [playback, setPlayback] = useState<WorkflowValidationPlaybackSnapshot>(
    EMPTY_WORKFLOW_VALIDATION_PLAYBACK,
  );

  const stopPlayback = useCallback(() => {
    timerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timerIdsRef.current = [];
  }, []);

  const playValidationPlayback = useCallback((validation: WorkflowValidationResult) => {
    stopPlayback();
    if (!graph) {
      setPlayback(EMPTY_WORKFLOW_VALIDATION_PLAYBACK);
      return;
    }

    const errorNodeId = findValidationIssueNodeId(graph, validation);
    const steps = buildWorkflowValidationPlaybackSteps(graph, errorNodeId);
    if (steps.length === 0) {
      setPlayback({
        ...EMPTY_WORKFLOW_VALIDATION_PLAYBACK,
        status: validation.valid ? "success" : "error",
      });
      return;
    }

    const completedNodeIds = new Set<string>();
    steps.forEach((step, index) => {
      const timerId = window.setTimeout(() => {
        setPlayback({
          activeNodeIds: step.nodeIds,
          activeEdgeIds: step.edgeIds,
          errorNodeIds: [],
          successNodeIds: Array.from(completedNodeIds),
          status: "running",
        });
        step.nodeIds.forEach((nodeId) => completedNodeIds.add(nodeId));
      }, index * PLAYBACK_STEP_MS);
      timerIdsRef.current.push(timerId);
    });

    const finalTimerId = window.setTimeout(() => {
      setPlayback({
        activeNodeIds: [],
        activeEdgeIds: [],
        errorNodeIds: validation.valid || !errorNodeId ? [] : [errorNodeId],
        successNodeIds: validation.valid ? Array.from(completedNodeIds) : [],
        status: validation.valid ? "success" : "error",
      });
    }, steps.length * PLAYBACK_STEP_MS);
    timerIdsRef.current.push(finalTimerId);
  }, [graph, stopPlayback]);

  useEffect(() => {
    setPlayback(EMPTY_WORKFLOW_VALIDATION_PLAYBACK);
    return stopPlayback;
  }, [graph, stopPlayback]);

  return { playback, playValidationPlayback };
}

function buildWorkflowValidationPlaybackSteps(
  graph: WorkflowDesignerGraph,
  stopNodeId: string | null,
): WorkflowValidationPlaybackStep[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoingEdges = new Map<string, typeof graph.edges>();
  graph.edges.forEach((edge) => {
    outgoingEdges.set(edge.source_node_id, [
      ...(outgoingEdges.get(edge.source_node_id) || []),
      edge,
    ]);
  });
  outgoingEdges.forEach((edges) => {
    edges.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  });

  const startNodes = graph.nodes
    .filter((node) => node.node_type === "start")
    .sort(compareWorkflowNodes);
  const queue = startNodes.length > 0 ? [...startNodes] : [...graph.nodes].sort(compareWorkflowNodes);
  const visitedNodeIds = new Set<string>();
  const queuedNodeIds = new Set(queue.map((node) => node.id));
  const steppedNodeIds = new Set<string>();
  const steps: WorkflowValidationPlaybackStep[] = [];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || visitedNodeIds.has(node.id)) continue;
    visitedNodeIds.add(node.id);
    if (!steppedNodeIds.has(node.id)) {
      steps.push({ nodeIds: [node.id], edgeIds: [] });
      steppedNodeIds.add(node.id);
    }
    if (node.id === stopNodeId) break;

    for (const edge of outgoingEdges.get(node.id) || []) {
      const target = nodeById.get(edge.target_node_id);
      if (!target) continue;
      steps.push({ nodeIds: [target.id], edgeIds: [edge.id] });
      steppedNodeIds.add(target.id);
      if (target.id === stopNodeId) return steps;
      if (!queuedNodeIds.has(target.id) && !visitedNodeIds.has(target.id)) {
        queue.push(target);
        queuedNodeIds.add(target.id);
      }
    }
  }

  return steps.length > 0
    ? steps
    : [...graph.nodes].sort(compareWorkflowNodes).map((node) => ({
        nodeIds: [node.id],
        edgeIds: [],
      }));
}

function compareWorkflowNodes(left: WorkflowNode, right: WorkflowNode) {
  return left.sort_order - right.sort_order || left.node_key.localeCompare(right.node_key);
}

function findValidationIssueNodeId(
  graph: WorkflowDesignerGraph,
  validation: WorkflowValidationResult,
) {
  const issueNodeKey = validation.issues.find((issue) => issue.nodeKey)?.nodeKey;
  return graph.nodes.find((node) => node.node_key === issueNodeKey)?.id || null;
}
