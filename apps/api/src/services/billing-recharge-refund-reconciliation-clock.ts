import { Errors } from "@/errors/error-factory";

export type RefundReconcileClockObservation = {
  wallTime: Date;
  monotonicMs: number;
};

type Dependencies = {
  wallNowFactory: () => Date;
  monotonicNowFactory: () => number;
  leaseMs: number;
};

export class RefundReconcileLeaseClock {
  readonly claimTime: Date;
  private readonly wallNowFactory: () => Date;
  private readonly monotonicNowFactory: () => number;
  private readonly wallDeadlineMs: number;
  private readonly monotonicDeadlineMs: number;
  private lastWallMs: number;
  private lastMonotonicMs: number;

  private constructor(
    dependencies: Dependencies,
    claimWallMs: number,
    claimMonotonicMs: number,
  ) {
    this.wallNowFactory = dependencies.wallNowFactory;
    this.monotonicNowFactory = dependencies.monotonicNowFactory;
    this.claimTime = new Date(claimWallMs);
    this.wallDeadlineMs = claimWallMs + dependencies.leaseMs;
    this.monotonicDeadlineMs = claimMonotonicMs + dependencies.leaseMs;
    this.lastWallMs = claimWallMs;
    this.lastMonotonicMs = claimMonotonicMs;
  }

  static capture(dependencies: Dependencies): RefundReconcileLeaseClock {
    const claimWallMs = readFiniteWallTime(dependencies.wallNowFactory());
    const claimMonotonicMs = readFiniteMonotonicTime(
      dependencies.monotonicNowFactory(),
    );
    return new RefundReconcileLeaseClock(
      dependencies,
      claimWallMs,
      claimMonotonicMs,
    );
  }

  observe(): RefundReconcileClockObservation {
    const wallMs = readFiniteWallTime(this.wallNowFactory());
    if (wallMs < this.lastWallMs) throwWallClockRollback();
    const monotonicMs = readFiniteMonotonicTime(this.monotonicNowFactory());
    if (monotonicMs < this.lastMonotonicMs) throwMonotonicClockRollback();
    this.lastWallMs = wallMs;
    this.lastMonotonicMs = monotonicMs;
    return { wallTime: new Date(wallMs), monotonicMs };
  }

  hasBudget(
    observation: RefundReconcileClockObservation,
    requiredMs: number,
  ): boolean {
    return this.isBeforeDeadline(observation) &&
      this.monotonicDeadlineMs - observation.monotonicMs >= requiredMs;
  }

  isBeforeDeadline(observation: RefundReconcileClockObservation): boolean {
    return observation.wallTime.getTime() < this.wallDeadlineMs &&
      observation.monotonicMs < this.monotonicDeadlineMs;
  }
}

export function defaultRefundReconcileMonotonicNow(): number {
  return globalThis.performance.now();
}

function readFiniteWallTime(value: unknown): number {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }
  throw Errors.business(
    500,
    "微信退款对账时钟不正确",
    "BILLING_RECHARGE_REFUND_RECONCILE_CLOCK_INVALID",
  );
}

function readFiniteMonotonicTime(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw Errors.business(
    500,
    "微信退款对账单调时钟不正确",
    "BILLING_RECHARGE_REFUND_RECONCILE_MONOTONIC_CLOCK_INVALID",
  );
}

function throwWallClockRollback(): never {
  throw Errors.business(
    500,
    "微信退款对账时钟发生回拨",
    "BILLING_RECHARGE_REFUND_RECONCILE_CLOCK_ROLLBACK",
  );
}

function throwMonotonicClockRollback(): never {
  throw Errors.business(
    500,
    "微信退款对账单调时钟发生回拨",
    "BILLING_RECHARGE_REFUND_RECONCILE_MONOTONIC_CLOCK_ROLLBACK",
  );
}
