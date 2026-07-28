export type LeaseRenewalResult<Value> =
  | { status: "renewed"; value: Value }
  | { status: "lost" }
  | { status: "failed" };

export async function classifyLeaseRenewal<Value>(
  operation: () => Promise<Value | null>,
): Promise<LeaseRenewalResult<Value>> {
  try {
    const value = await operation();
    return value === null
      ? { status: "lost" }
      : { status: "renewed", value };
  } catch {
    return { status: "failed" };
  }
}
