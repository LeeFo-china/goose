"use client";

import {
  Background,
  ConnectionMode,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnNodeDrag,
  type OnConnectStartParams,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { Layers3, LayoutDashboard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getWorkflowFlowConnectionSource,
  getWorkflowFlowConnectionTarget,
  toWorkflowFlowEdges,
  toWorkflowFlowNodes,
} from "@/components/workflows/workflow-flow-adapter";
import { WorkflowFlowEdge } from "@/components/workflows/workflow-flow-edge";
import { arrangeWorkflowFlowNodes } from "@/components/workflows/workflow-flow-layout";
import { WorkflowFlowNode } from "@/components/workflows/workflow-flow-node";
import {
  WORKFLOW_FLOW_ARRANGE_ZOOM,
  WORKFLOW_FLOW_MAX_ZOOM,
  WORKFLOW_FLOW_MIN_ZOOM,
  type WorkflowFlowConnectionSource,
  type WorkflowFlowEdge as WorkflowFlowEdgeType,
  type WorkflowFlowNode as WorkflowFlowNodeType,
} from "@/components/workflows/workflow-flow-types";
import { WORKFLOW_NODE_PRESET_DRAG_TYPE } from "@/components/workflows/workflow-node-library";
import type { WorkflowValidationPlaybackSnapshot } from "@/components/workflows/workflow-validation-playback";
import type { WorkflowEdge, WorkflowNode } from "@/components/workflows/workflow-types";

const nodeTypes = {
  workflowNode: WorkflowFlowNode,
};

const edgeTypes = {
  workflowEdge: WorkflowFlowEdge,
};

const nodeExtent: [[number, number], [number, number]] = [
  [0, 0],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
];

const workflowFlowAriaLabels = {
  "controls.ariaLabel": "画布操作",
  "controls.zoomIn.ariaLabel": "放大画布",
  "controls.zoomOut.ariaLabel": "缩小画布",
  "controls.fitView.ariaLabel": "全部显示",
  "controls.interactive.ariaLabel": "锁定画布",
};

export function WorkflowCanvas(props: {
  connectingNodeId: string | null;
  disabled?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onBeginConnect: (source: WorkflowFlowConnectionSource) => void;
  onCancelConnect: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onDropNodePreset: (presetKey: string, position: WorkflowNode["position"]) => void;
  onFinishConnect: (source: WorkflowFlowConnectionSource, targetNodeId: string) => void;
  onArrangeNodes: (nodes: WorkflowNode[]) => void;
  onMoveNode: (nodeId: string, position: WorkflowNode["position"]) => void;
  onOpenNodeLibrary: () => void;
  onSelectNode: (nodeId: string) => void;
  validationPlayback?: WorkflowValidationPlaybackSnapshot;
  viewStorageKey?: string;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner({
  connectingNodeId,
  disabled,
  edges,
  nodes,
  onArrangeNodes,
  onBeginConnect,
  onCancelConnect,
  onDeleteEdge,
  onDropNodePreset,
  onFinishConnect,
  onMoveNode,
  onOpenNodeLibrary,
  onSelectNode,
  selectedNodeId,
  validationPlayback,
  viewStorageKey,
}: Parameters<typeof WorkflowCanvas>[0]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onDeleteEdgeRef = useRef(onDeleteEdge);
  const reactFlow = useReactFlow<WorkflowFlowNodeType, WorkflowFlowEdgeType>();
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState<WorkflowFlowNodeType>([]);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState<WorkflowFlowEdgeType>([]);
  const [zoom, setZoom] = useState(1);
  const [canvasViewReady, setCanvasViewReady] = useState(!viewStorageKey);
  const activeValidationNodeIds = useMemo(
    () => new Set(validationPlayback?.activeNodeIds || []),
    [validationPlayback?.activeNodeIds],
  );
  const activeValidationEdgeIds = useMemo(
    () => new Set(validationPlayback?.activeEdgeIds || []),
    [validationPlayback?.activeEdgeIds],
  );
  const errorValidationNodeIds = useMemo(
    () => new Set(validationPlayback?.errorNodeIds || []),
    [validationPlayback?.errorNodeIds],
  );
  const successValidationNodeIds = useMemo(
    () => new Set(validationPlayback?.successNodeIds || []),
    [validationPlayback?.successNodeIds],
  );
  useEffect(() => {
    onDeleteEdgeRef.current = onDeleteEdge;
  }, [onDeleteEdge]);
  const handleDeleteEdge = useCallback((edgeId: string) => {
    onDeleteEdgeRef.current(edgeId);
  }, []);

  useEffect(() => {
    setFlowNodes(toWorkflowFlowNodes({
      activeValidationEdgeIds,
      activeValidationNodeIds,
      connectingNodeId,
      disabled,
      edges,
      errorValidationNodeIds,
      nodes,
      onDeleteEdge: handleDeleteEdge,
      selectedNodeId,
      successValidationNodeIds,
    }));
  }, [
    activeValidationEdgeIds,
    activeValidationNodeIds,
    connectingNodeId,
    disabled,
    edges,
    errorValidationNodeIds,
    handleDeleteEdge,
    nodes,
    selectedNodeId,
    setFlowNodes,
    successValidationNodeIds,
  ]);

  useEffect(() => {
    setFlowEdges(toWorkflowFlowEdges({
      activeValidationEdgeIds,
      disabled,
      edges,
      nodes,
      onDeleteEdge: handleDeleteEdge,
    }));
  }, [
    activeValidationEdgeIds,
    disabled,
    edges,
    handleDeleteEdge,
    nodes,
    setFlowEdges,
  ]);

  const handleInit = useCallback((instance: ReactFlowInstance<WorkflowFlowNodeType, WorkflowFlowEdgeType>) => {
    const storedZoom = viewStorageKey ? readStoredCanvasZoom(viewStorageKey) : null;
    const nextZoom = storedZoom ?? 1;
    instance.setViewport({ x: 0, y: 0, zoom: nextZoom });
    setZoom(nextZoom);
    setCanvasViewReady(true);
  }, [viewStorageKey]);

  useEffect(() => {
    if (!viewStorageKey || !canvasViewReady) return;
    writeStoredCanvasZoom(viewStorageKey, zoom);
  }, [canvasViewReady, viewStorageKey, zoom]);

  const handleNodeDragStop = useCallback<OnNodeDrag<WorkflowFlowNodeType>>((
    _event,
    node,
  ) => {
    onMoveNode(node.id, node.position);
  }, [onMoveNode]);

  const handleConnect = useCallback((connection: Connection) => {
    const source = getWorkflowFlowConnectionSource(connection);
    const targetNodeId = getWorkflowFlowConnectionTarget(connection);
    if (!source || !targetNodeId) {
      onCancelConnect();
      return;
    }
    onFinishConnect(source, targetNodeId);
    onCancelConnect();
  }, [onCancelConnect, onFinishConnect]);

  const handleConnectStart = useCallback((
    _event: MouseEvent | TouchEvent,
    params: OnConnectStartParams,
  ) => {
    const source = getWorkflowFlowConnectionSource({
      source: params.nodeId || "",
      sourceHandle: params.handleId,
      target: "",
      targetHandle: "",
    });
    if (source) onBeginConnect(source);
  }, [onBeginConnect]);

  const handleArrange = useCallback(async () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const arranged = await arrangeWorkflowFlowNodes(nodes, edges, {
      width: rect?.width || 0,
      height: rect?.height || 0,
    });
    onCancelConnect();
    onArrangeNodes(arranged.nodes);
    requestAnimationFrame(() => {
      reactFlow.setViewport({ x: 0, y: 0, zoom: WORKFLOW_FLOW_ARRANGE_ZOOM });
      setZoom(WORKFLOW_FLOW_ARRANGE_ZOOM);
    });
  }, [edges, nodes, onArrangeNodes, onCancelConnect, reactFlow]);

  return (
    <div
      ref={containerRef}
      data-workflow-canvas="true"
      data-workflow-canvas-view-ready={canvasViewReady ? "true" : "false"}
      data-workflow-validation-playback={validationPlayback?.status || "idle"}
      className="relative h-full min-h-0 bg-muted/30"
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (disabled) return;
        const presetKey = event.dataTransfer.getData(WORKFLOW_NODE_PRESET_DRAG_TYPE) ||
          event.dataTransfer.getData("text/plain");
        if (!presetKey) return;
        event.preventDefault();
        const position = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        onDropNodePreset(presetKey, {
          x: Math.max(0, position.x),
          y: Math.max(0, position.y),
        });
      }}
    >
      <span data-workflow-canvas-zoom="true" className="sr-only">
        {Math.round(zoom * 100)}%
      </span>
      <div className="pointer-events-none absolute left-0 right-0 top-3 z-30 h-0 px-3">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-events-auto h-9 bg-background/95 text-muted-foreground shadow-sm backdrop-blur"
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpenNodeLibrary();
            }}
          >
            <Layers3 data-icon="inline-start" />
            节点库
          </Button>
        </div>
      </div>
      <ReactFlow
        colorMode="light"
        ariaLabelConfig={workflowFlowAriaLabels}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed },
          type: "workflowEdge",
        }}
        edges={flowEdges}
        edgeTypes={edgeTypes}
        fitView={false}
        maxZoom={WORKFLOW_FLOW_MAX_ZOOM}
        minZoom={WORKFLOW_FLOW_MIN_ZOOM}
        nodeExtent={nodeExtent}
        nodes={flowNodes}
        nodesDraggable={disabled ? false : undefined}
        nodesConnectable={disabled ? false : undefined}
        nodeTypes={nodeTypes}
        elementsSelectable={disabled ? false : undefined}
        panOnDrag
        panOnScroll
        proOptions={{ hideAttribution: true }}
        selectNodesOnDrag={false}
        onConnect={handleConnect}
        onConnectEnd={onCancelConnect}
        onConnectStart={handleConnectStart}
        onInit={handleInit}
        onMove={(_event, viewport: Viewport) => setZoom(viewport.zoom)}
        onNodeClick={(_event, node) => {
          if (node.type === "workflowNode") onSelectNode(node.id);
        }}
        onNodeDragStop={handleNodeDragStop}
        onEdgesChange={onFlowEdgesChange}
        onNodesChange={onFlowNodesChange}
        onPaneClick={onCancelConnect}
      >
        <Controls
          aria-label="画布操作"
          className="workflow-flow-controls"
          fitViewOptions={{ duration: 240, padding: 0.24 }}
          position="top-left"
        >
          <ControlButton
            aria-label="整理画布"
            title="整理画布"
            disabled={disabled || nodes.length === 0}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleArrange}
          >
            <LayoutDashboard className="size-4" />
          </ControlButton>
        </Controls>
        <Background color="hsl(var(--border) / 0.65)" gap={32} />
      </ReactFlow>
    </div>
  );
}

function clampWorkflowFlowZoom(value: number) {
  return Math.max(WORKFLOW_FLOW_MIN_ZOOM, Math.min(WORKFLOW_FLOW_MAX_ZOOM, value));
}

function readStoredCanvasZoom(storageKey: string) {
  if (typeof window === "undefined") return null;
  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) return null;
  const zoom = Number(rawValue);
  return Number.isFinite(zoom) ? clampWorkflowFlowZoom(zoom) : null;
}

function writeStoredCanvasZoom(storageKey: string, zoom: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, String(clampWorkflowFlowZoom(zoom)));
}
