import type { OcrDocumentType } from "@gooes/domain";

import type { systemSettingsService } from "@/services/system-settings";
import type { ocrTenantPolicyService } from "./tenant-policy";

type SettingsPort = Pick<typeof systemSettingsService, "getNumber">;
type TenantPolicyPort = Pick<typeof ocrTenantPolicyService, "getRuntimePolicy">;

export async function loadOcrRuntimePolicy(input: {
  settings: SettingsPort;
  tenantPolicy: TenantPolicyPort;
  tenantId: string;
}) {
  const platformDailyLimit = await input.settings.getNumber(
    "TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT",
    100,
  );
  return input.tenantPolicy.getRuntimePolicy(
    input.tenantId,
    platformDailyLimit,
  );
}

export function allowsOcrDocument(
  policy: Awaited<ReturnType<TenantPolicyPort["getRuntimePolicy"]>>,
  documentType: OcrDocumentType,
) {
  return policy.allowedDocumentTypes.some((allowed) => allowed === documentType);
}
