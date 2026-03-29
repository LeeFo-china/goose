// src/utils/response.ts
export function success(data: unknown, requestId: string) {
  return {
    success: true,
    data,
    requestId,
  };
}

export function fail(
  message: string,
  code: string,
  requestId: string,
  details?: unknown,
) {
  return {
    success: false,
    message,
    code,
    details,
    requestId,
  };
}
