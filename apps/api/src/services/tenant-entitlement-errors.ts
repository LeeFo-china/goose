import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

const ERROR_SEARCH_MAX_DEPTH = 8;
const ERROR_SEARCH_MAX_NODES = 64;
const ERROR_SEARCH_FIELDS = ["code", "message", "details", "hint"] as const;
const ERROR_TOKEN_CHARACTER = /^[A-Za-z0-9_]$/;

export function mapTenantEntitlementActionError(error: unknown): unknown {
  if (containsErrorCode(error, ErrorCodes.TENANT_ENTITLEMENT_NOT_FOUND)) {
    return Errors.business(
      404,
      "租户品牌权益不存在",
      ErrorCodes.TENANT_ENTITLEMENT_NOT_FOUND,
    );
  }
  if (containsErrorCode(
    error,
    ErrorCodes.TENANT_ENTITLEMENT_VERSION_CONFLICT,
  )) {
    return Errors.business(
      409,
      "租户品牌权益版本已变化，请刷新后重试",
      ErrorCodes.TENANT_ENTITLEMENT_VERSION_CONFLICT,
    );
  }
  if (containsErrorCode(
    error,
    ErrorCodes.TENANT_ENTITLEMENT_STATE_CONFLICT,
  )) {
    return Errors.business(
      409,
      "当前租户品牌权益状态不允许该操作",
      ErrorCodes.TENANT_ENTITLEMENT_STATE_CONFLICT,
    );
  }
  if (containsErrorCode(error, ErrorCodes.BRANDING_ENTITLEMENT_EXPIRED)) {
    return Errors.business(
      409,
      "自定义品牌权益已过期",
      ErrorCodes.BRANDING_ENTITLEMENT_EXPIRED,
    );
  }
  return Errors.dbError("租户权益操作失败");
}

function containsErrorCode(value: unknown, expected: string): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{
    value,
    depth: 0,
  }];
  const seen = new WeakSet<object>();
  let visitedNodes = 0;

  while (pending.length > 0 && visitedNodes < ERROR_SEARCH_MAX_NODES) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.value === "string") {
      if (containsExactErrorToken(current.value, expected)) return true;
      continue;
    }
    if (typeof current.value !== "object" || current.value === null) continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    visitedNodes += 1;
    if (current.depth >= ERROR_SEARCH_MAX_DEPTH) continue;

    const values = Array.isArray(current.value)
      ? current.value.slice(0, ERROR_SEARCH_MAX_NODES - visitedNodes)
      : ERROR_SEARCH_FIELDS.map((field) =>
        (current.value as Record<string, unknown>)[field]
      );
    for (const nestedValue of values) {
      pending.push({ value: nestedValue, depth: current.depth + 1 });
    }
  }

  return false;
}

function containsExactErrorToken(value: string, expected: string): boolean {
  let offset = value.indexOf(expected);
  while (offset >= 0) {
    const before = value[offset - 1];
    const after = value[offset + expected.length];
    if (!isErrorTokenCharacter(before) && !isErrorTokenCharacter(after)) {
      return true;
    }
    offset = value.indexOf(expected, offset + 1);
  }
  return false;
}

function isErrorTokenCharacter(value: string | undefined): boolean {
  return value !== undefined && ERROR_TOKEN_CHARACTER.test(value);
}
