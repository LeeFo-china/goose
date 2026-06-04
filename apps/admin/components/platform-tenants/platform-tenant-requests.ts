import { requestBackendJson } from "@/lib/backend-client";

export async function requestPlatformTenantJson<T>(
  path: string,
  init?: Parameters<typeof requestBackendJson>[1],
) {
  return requestBackendJson<T>(path, init);
}
