import { Errors } from "@/errors/error-factory";

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const ONE_HUNDRED = BigInt(100);

export type FixedPointMoneyContext = {
  parseErrorMessage: string;
  overflowMessage: string;
  details: unknown;
};

export function addMoneyCents(
  current: bigint,
  value: unknown,
  context: FixedPointMoneyContext,
): bigint {
  return current + parseMoneyCents(value, context);
}

export function moneyCentsToSafeNumber(
  cents: bigint,
  context: FixedPointMoneyContext,
): number {
  if (cents > MAX_SAFE_CENTS || cents < -MAX_SAFE_CENTS) {
    throw Errors.business(
      422,
      context.overflowMessage,
      "FINANCE_MONEY_EXCEEDS_SAFE_RANGE",
    );
  }
  return Number(cents) / 100;
}

function parseMoneyCents(
  value: unknown,
  context: FixedPointMoneyContext,
): bigint {
  if (typeof value !== "string" && typeof value !== "number") {
    throw Errors.dbError(context.parseErrorMessage, context.details);
  }
  const normalized = String(value).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    throw Errors.dbError(context.parseErrorMessage, context.details);
  }
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return whole * ONE_HUNDRED + fraction;
}
