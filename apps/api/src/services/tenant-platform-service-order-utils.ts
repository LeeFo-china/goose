import { randomUUID } from "node:crypto";

import { Errors } from "@/errors/error-factory";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export const SERVICE_PAYMENT_WINDOW_MS = 5 * 60 * 1000;

export function normalizeServiceOrderPage(value: number | undefined) {
  return normalizePositiveInteger(value, DEFAULT_PAGE);
}

export function normalizeServiceOrderPageSize(value: number | undefined) {
  return Math.min(
    normalizePositiveInteger(value, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
}

export function createServiceTradeNo() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
  const nonce = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `TSO${timestamp}${nonce}`;
}

export function assertSameTrialSourceIntent(
  existingSourceTrialId: string | null | undefined,
  requestedSourceTrialId: string | null | undefined,
) {
  if ((existingSourceTrialId ?? null) === (requestedSourceTrialId ?? null)) {
    return;
  }
  throw Errors.business(
    409,
    "试用来源与原订单不一致",
    "SERVICE_TRIAL_ORDER_SOURCE_INVALID",
  );
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
