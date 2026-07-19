import type { BootstrapData } from "../models";
import { ApiClient, ApiRequestError } from "./request";

export async function fetchBootstrap(client: ApiClient): Promise<BootstrapData> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/bootstrap",
    method: "GET",
  });
  if (!isBootstrap(value)) {
    throw new ApiRequestError(502, "INVALID_API_RESPONSE", "服务返回数据无效");
  }
  return value;
}

function isBootstrap(value: unknown): value is BootstrapData {
  if (!isRecord(value) || !isRecord(value.installation) || !isRecord(value.company)
    || !isRecord(value.theme) || !isRecord(value.features) || !isRecord(value.content)) {
    return false;
  }
  return value.installation.status === "active"
    && typeof value.company.name === "string"
    && typeof value.company.service_phone === "string"
    && typeof value.theme.primary_color === "string"
    && (value.theme.navigation_text_color === "black"
      || value.theme.navigation_text_color === "white")
    && Object.values(value.features).every((feature) =>
      typeof feature === "boolean" || typeof feature === "string")
    && typeof value.privacy_policy_version === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
