import { assertNotAborted } from "@/utils/abortable-wait";
import { withAbortableModuleTimeout } from "@/utils/abortable-module-timeout";
import { Errors } from "@/errors/error-factory";
import { projectCameraRepository } from "@/repositories/project-cameras";
import type { CameraWorkspaceStatusRow } from "@/repositories/project-cameras/workspace";
import { tencentIotVideoService } from "@/services/tencent-iot-video";
import { buildTencentDeviceChannelKey, serializeCamera } from "./legacy/shared";

// Reuse persisted timestamps; no process cache, background job or new dependency.
export const WORKSPACE_STATUS_CACHE_MS = 30_000;
export type WorkspaceCameraStatusSource = "live" | "cached" | "persisted";

export async function refreshWorkspaceCameraStatuses(
  cameras: CameraWorkspaceStatusRow[], scope: { tenantId: string; projectId: string },
) {
  if (cameras.length > 20) throw Errors.badRequest("状态刷新每次最多 20 条");
  const now = Date.now();
  const sources = new Map<string, WorkspaceCameraStatusSource>();
  const pending = cameras.filter((camera): camera is CameraWorkspaceStatusRow & { vendor_channel_id: string } => {
    sources.set(camera.id, "persisted");
    if (camera.vendor !== "tencent_iotvideo_industry" || !camera.vendor_channel_id) return false;
    const age = now - Date.parse(camera.last_status_checked_at || "");
    if (!camera.last_status_error && age >= 0 && age < WORKSPACE_STATUS_CACHE_MS) {
      sources.set(camera.id, "cached");
      return false;
    }
    return true;
  });
  let refreshed = new Map<string, CameraWorkspaceStatusRow>();
  if (pending.length) {
    try {
      const changed = await withAbortableModuleTimeout({
        module: "摄像头状态刷新", timeoutMs: 8_000, cancelSupported: true,
        load: async (signal) => {
          const statuses = await tencentIotVideoService.getWorkspaceChannelStatuses(pending.map((camera) => ({
            deviceId: camera.vendor_device_serial, channelId: camera.vendor_channel_id,
          })), { signal });
          assertNotAborted(signal);
          const statusMap = new Map(statuses.map((item) => [
            buildTencentDeviceChannelKey(item.deviceId, item.channelId), item.status,
          ]));
          // Observation ordering uses request START, never the late completion time.
          const checkedAt = new Date(now).toISOString();
          const candidates = pending.flatMap((camera) => {
            const status = statusMap.get(buildTencentDeviceChannelKey(camera.vendor_device_serial, camera.vendor_channel_id));
            return status ? [{ ...camera, status, last_status_checked_at: checkedAt, last_status_error: null }] : [];
          });
          if (!candidates.length) return [];
          const accepted = await projectCameraRepository.saveWorkspaceStatuses({ ...scope, checkedAt, signal,
            statuses: candidates.map((camera) => ({ cameraId: camera.id, status: camera.status })),
          });
          assertNotAborted(signal);
          const acceptedIds = new Set(accepted);
          return candidates.filter((camera) => acceptedIds.has(camera.id));
        },
      });
      refreshed = new Map(changed.map((camera) => [camera.id, camera]));
      for (const camera of changed) sources.set(camera.id, "live");
    } catch {
      // Vendor/persistence errors retain the previous record and timestamp;
      // explicit persisted provenance prevents the UI claiming a live result.
    }
  }
  const list = cameras.map((camera) => {
    const row = refreshed.get(camera.id) || camera;
    return { ...serializeCamera(row), status_source: sources.get(camera.id) || "persisted",
      last_status_checked_at: row.last_status_checked_at };
  });
  const sourceSet = new Set(list.map((camera) => camera.status_source));
  const status_source: WorkspaceCameraStatusSource | "mixed" = sourceSet.size > 1
    ? "mixed" : list[0]?.status_source || "persisted";
  return { list, status_source };
}
