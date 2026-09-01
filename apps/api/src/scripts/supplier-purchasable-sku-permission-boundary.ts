export async function assertSupplierPurchasableSkuPermissionBoundary(
  attempt: () => Promise<unknown>,
  readRepositoryReads: () => number,
): Promise<void> {
  let failure: unknown;
  try {
    await attempt();
  } catch (error) {
    failure = error;
  }
  const accessFailure = failure as {
    code?: unknown;
    statusCode?: unknown;
  } | undefined;
  if (
    accessFailure?.code !== "FORBIDDEN" ||
    accessFailure.statusCode !== 403 ||
    readRepositoryReads() !== 0
  ) {
    throw new Error("SMOKE_PERMISSION_BOUNDARY_INVALID");
  }
}
