import { clampZoom } from "@/components/workflows/workflow-canvas-geometry";

export function readStoredCanvasZoom(viewStorageKey: string) {
  try {
    const value = window.localStorage.getItem(viewStorageKey);
    if (!value) return null;
    const zoom = Number(value);
    return Number.isFinite(zoom) ? clampZoom(zoom) : null;
  } catch {
    return null;
  }
}

export function writeStoredCanvasZoom(viewStorageKey: string, zoom: number) {
  try {
    window.localStorage.setItem(viewStorageKey, String(clampZoom(zoom)));
  } catch {
    // Ignore unavailable storage; canvas remains usable with in-memory zoom.
  }
}
