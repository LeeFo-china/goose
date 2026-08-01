import { Errors } from "@/errors/error-factory";

// Internal defensive limit for the small XPay JSON/empty responses; not an
// upstream-documented protocol limit.
export const MAX_WECHAT_VIRTUAL_PAYMENT_RESPONSE_BYTES = 64 * 1_024;

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,128}$/;

type ResponseMetadata = {
  httpStatus: number;
  wechatErrcode: null;
  requestId: string | null;
};

export async function readWechatVirtualPaymentResponseBody(
  response: Response,
  requestId: string | null,
): Promise<string> {
  const declaredBytes = parseContentLength(
    response.headers.get("content-length"),
  );
  if (
    declaredBytes !== null &&
    declaredBytes > MAX_WECHAT_VIRTUAL_PAYMENT_RESPONSE_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    throwResponseTooLarge(response.status, requestId);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_WECHAT_VIRTUAL_PAYMENT_RESPONSE_BYTES) {
        exceededLimit = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throwResponseReadFailure(error, response.status, requestId);
  } finally {
    releaseReaderLock(reader);
  }
  if (exceededLimit) throwResponseTooLarge(response.status, requestId);

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function normalizeWechatVirtualPaymentRequestId(
  value: string | null | undefined,
): string | null {
  return value && SAFE_REQUEST_ID_PATTERN.test(value) ? value : null;
}

function parseContentLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function releaseReaderLock(
  reader: { releaseLock(): void },
): void {
  // Reader cleanup is best-effort and must not replace a classified gateway
  // failure or turn an otherwise valid bounded response into an error.
  try {
    reader.releaseLock();
  } catch {
    // No sensitive upstream diagnostics are retained from cleanup failures.
  }
}

function throwResponseReadFailure(
  error: unknown,
  httpStatus: number,
  requestId: string | null,
): never {
  const details = responseMetadata(httpStatus, requestId);
  if (isTimeoutError(error)) {
    throw Errors.business(
      504,
      "微信虚拟支付接口请求超时",
      "WECHAT_VIRTUAL_PAYMENT_GATEWAY_TIMEOUT",
      details,
    );
  }
  throw Errors.business(
    502,
    "微信虚拟支付接口响应读取失败",
    "WECHAT_VIRTUAL_PAYMENT_TRANSPORT_FAILED",
    details,
  );
}

function throwResponseTooLarge(
  httpStatus: number,
  requestId: string | null,
): never {
  throw Errors.business(
    502,
    "微信虚拟支付接口响应过大",
    "WECHAT_VIRTUAL_PAYMENT_RESPONSE_TOO_LARGE",
    responseMetadata(httpStatus, requestId),
  );
}

function responseMetadata(
  httpStatus: number,
  requestId: string | null,
): ResponseMetadata {
  return { httpStatus, wechatErrcode: null, requestId };
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError";
}
