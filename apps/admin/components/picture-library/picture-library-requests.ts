import { requestBackendJson } from "@/lib/backend-client";

export async function requestPictureLibraryJson<T>(
  path: string,
  init?: Parameters<typeof requestBackendJson>[1],
) {
  return requestBackendJson<T>(path, init);
}
