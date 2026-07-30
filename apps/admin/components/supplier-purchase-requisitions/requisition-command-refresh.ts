export type RequisitionRefreshResult<Value> =
  | { status: "refreshed"; value: Value }
  | { status: "refresh_failed"; error: unknown };

export async function refreshRequisitionAfterCommand<Value>(
  refresh: () => Promise<Value>,
): Promise<RequisitionRefreshResult<Value>> {
  try {
    return { status: "refreshed", value: await refresh() };
  } catch (error) {
    return { status: "refresh_failed", error };
  }
}
