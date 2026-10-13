import { assertNotAborted, waitForSignal } from "@/utils/abortable-wait";
import { Errors } from "@/errors/error-factory";
import type { SupabaseDB } from "@/utils/supabase";
import type { ProjectCameraRow } from "./legacy/shared";

export type SaveWorkspaceStatusesInput = {
  tenantId: string;
  projectId: string;
  checkedAt: string;
  signal: AbortSignal;
  statuses: Array<{ cameraId: string; status: ProjectCameraRow["status"] }>;
};

/** At most three status batches, independent of the number of page cameras. */
export async function saveWorkspaceStatuses(
  client: ReturnType<typeof SupabaseDB.getAdminClient>, input: SaveWorkspaceStatusesInput,
): Promise<string[]> {
  if (!input.tenantId) throw Errors.forbidden();
  if (input.statuses.length > 20) throw Errors.badRequest("状态刷新每次最多 20 条");
  const accepted: string[] = [];
  const time = Date.parse(input.checkedAt);
  if (!Number.isFinite(time)) throw Errors.badRequest("无效的状态检查时间");
  const checkedAt = new Date(time).toISOString();
  for (const status of ["online", "offline", "unknown"] as const) {
    assertNotAborted(input.signal);
    const cameraIds = input.statuses.filter((item) => item.status === status).map((item) => item.cameraId);
    if (!cameraIds.length) continue;
    const { data, error } = await waitForSignal(client.from("project_cameras").update({
      status, last_status_checked_at: checkedAt, last_status_error: null,
      updated_at: checkedAt,
    }).eq("tenant_id", input.tenantId).eq("project_id", input.projectId)
      .in("id", cameraIds).is("deleted_at", null)
      .or(`last_status_checked_at.is.null,last_status_checked_at.lt.${checkedAt}`)
      .select("id").abortSignal(input.signal), input.signal);
    assertNotAborted(input.signal);
    if (error) throw Errors.dbError("更新项目摄像头状态失败", error);
    const updatedIds = (data || []).map((row: { id: string }) => row.id);
    if (!updatedIds.length) continue;
    const { error: assetError } = await waitForSignal(client.from("tenant_devices").update({
      status, raw_status: null, last_synced_at: checkedAt, updated_at: checkedAt,
    }).eq("tenant_id", input.tenantId).eq("bound_project_id", input.projectId)
      .in("bound_camera_id", updatedIds).is("deleted_at", null)
      .or(`last_synced_at.is.null,last_synced_at.lt.${checkedAt}`)
      .abortSignal(input.signal), input.signal);
    assertNotAborted(input.signal);
    if (assetError) throw Errors.dbError("更新设备资产状态失败", assetError);
    accepted.push(...updatedIds);
  }
  return accepted;
}
