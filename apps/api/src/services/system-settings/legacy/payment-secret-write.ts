import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { PlatformSecretSettingSnapshot } from "@/repositories/system-settings";

import { decryptSecretValue, normalizeStoredValue } from "./crypto";
import { WECHAT_VIRTUAL_PAYMENT_SECRET_SETTING_KEYS } from "./definitions";

type VirtualSecretBundle = {
  appKey: string;
  revision: number;
};

export function resolvePaymentSecretWrite(
  snapshot: PlatformSecretSettingSnapshot | null,
  key: string,
  requestedValue: string,
): "noop" | "write" {
  const storedValue = snapshot?.is_secret
    ? normalizeStoredValue(snapshot.value_text)
    : null;
  if (!storedValue) return "write";

  const currentValue = decryptStoredPaymentSecret(storedValue);
  const isActive = snapshot?.status === "active";
  if (!WECHAT_VIRTUAL_PAYMENT_SECRET_SETTING_KEYS.has(key)) {
    return isActive && currentValue === requestedValue ? "noop" : "write";
  }

  const currentBundle = parseVirtualSecretBundle(currentValue);
  const requestedBundle = parseVirtualSecretBundle(requestedValue);
  if (!currentBundle || !requestedBundle) throwVirtualRevisionConflict();
  if (
    currentBundle.appKey === requestedBundle.appKey &&
    currentBundle.revision === requestedBundle.revision
  ) {
    return isActive ? "noop" : "write";
  }
  if (
    requestedBundle.revision < currentBundle.revision ||
    requestedBundle.revision === currentBundle.revision
  ) {
    throwVirtualRevisionConflict();
  }
  return "write";
}

function decryptStoredPaymentSecret(value: string): string {
  try {
    return normalizeStoredValue(decryptSecretValue(value)) ?? "";
  } catch (error) {
    if (error instanceof AppError) {
      throw Errors.business(error.statusCode, error.message, error.code);
    }
    throw Errors.dbError("读取平台支付密钥配置失败");
  }
}

function parseVirtualSecretBundle(value: string): VirtualSecretBundle | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const bundle = parsed as { appKey?: unknown; revision?: unknown };
    if (
      typeof bundle.appKey !== "string" || !bundle.appKey.trim() ||
      !Number.isSafeInteger(bundle.revision) || Number(bundle.revision) <= 0
    ) {
      return null;
    }
    return { appKey: bundle.appKey, revision: Number(bundle.revision) };
  } catch {
    return null;
  }
}

function throwVirtualRevisionConflict(): never {
  throw Errors.business(
    409,
    "虚拟支付密钥版本冲突，请递增版本后重试",
    "WECHAT_VIRTUAL_PAYMENT_SECRET_REVISION_CONFLICT",
  );
}
