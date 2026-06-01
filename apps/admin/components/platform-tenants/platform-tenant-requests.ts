import { requestBackendJson } from "@/lib/backend-client";

export async function requestPlatformTenantJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}
