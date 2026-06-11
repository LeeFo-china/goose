import type { PointerEvent, RefObject } from "react";

export type WorkflowCanvasPanState = {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  scrollLeft: number;
  scrollTop: number;
};

function isCanvasPanTarget(target: EventTarget) {
  if (!(target instanceof Element)) return false;
  if (!target.closest("[data-workflow-canvas='true']")) return false;
  return !target.closest(
    "button, [data-workflow-node], [data-edge-action], [data-node-port]",
  );
}

export function createWorkflowCanvasPan(
  panRef: RefObject<WorkflowCanvasPanState | null>,
  scrollRef: RefObject<HTMLDivElement | null>,
  disabled?: boolean,
) {
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || !isCanvasPanTarget(event.target)) {
      return false;
    }
    const scrollElement = scrollRef.current;
    if (!scrollElement) return false;

    panRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: scrollElement.scrollLeft,
      scrollTop: scrollElement.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    return true;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const scrollElement = scrollRef.current;
    if (!pan || !scrollElement || pan.pointerId !== event.pointerId) return false;

    scrollElement.scrollLeft = pan.scrollLeft - (event.clientX - pan.pointerX);
    scrollElement.scrollTop = pan.scrollTop - (event.clientY - pan.pointerY);
    event.preventDefault();
    return true;
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return false;
    panRef.current = null;
    return true;
  }

  return { begin, move, end };
}
