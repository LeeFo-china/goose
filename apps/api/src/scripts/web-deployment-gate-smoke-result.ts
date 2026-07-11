export interface WebGateSmokeCounts {
  readonly device: number;
  readonly ip: number;
  readonly phone: number;
  readonly single: number;
}

export function evaluateWebGateSmokeCounts(counts: WebGateSmokeCounts) {
  const result = {
    single_reservation_passed: counts.single === 1,
    ip_concurrency_passed: counts.ip === 5,
    phone_concurrency_passed: counts.phone === 1,
    device_concurrency_passed: counts.device === 1,
    single_success_count: counts.single,
    ip_success_count: counts.ip,
    phone_success_count: counts.phone,
    device_success_count: counts.device,
  };

  return {
    ...result,
    passed:
      result.single_reservation_passed &&
      result.ip_concurrency_passed &&
      result.phone_concurrency_passed &&
      result.device_concurrency_passed,
  };
}
