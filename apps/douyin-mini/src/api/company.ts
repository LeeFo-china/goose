import type { CompanyData } from "../models";
import { parseCompany } from "./content-validation";
import { ApiClient, ApiRequestError } from "./request";

export async function fetchCompany(client: ApiClient): Promise<CompanyData> {
  const value = await client.request<unknown>({ path: "/douyin-mini/company", method: "GET" });
  const company = parseCompany(value);
  if (!company) throw invalidResponse();
  return company;
}

function invalidResponse() {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "装修公司公开资料无效");
}
