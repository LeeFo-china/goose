import type { BootstrapData } from "../models";
import { parseBootstrap } from "./content-validation";
import { ApiClient, ApiRequestError } from "./request";

export async function fetchBootstrap(client: ApiClient): Promise<BootstrapData> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/bootstrap",
    method: "GET",
  });
  const bootstrap = parseBootstrap(value);
  if (!bootstrap) {
    throw new ApiRequestError(502, "INVALID_API_RESPONSE", "服务返回数据无效");
  }
  return bootstrap;
}
