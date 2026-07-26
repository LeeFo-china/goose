import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SafeDouyinLogIdSchema } from "./release-client";

const InvalidAuthorizationCodeSchema = z.looseObject({
  err_no: z.literal(40_018),
  log_id: SafeDouyinLogIdSchema.optional(),
});

export function assertAuthorizationCodeUsable(
  body: Record<string, unknown>,
  grantType: string,
): void {
  if (grantType !== "app_to_tp_authorization_code") return;
  const parsed = InvalidAuthorizationCodeSchema.safeParse(body);
  if (!parsed.success) return;
  throw Errors.business(
    502,
    "抖音授权码无效或已使用",
    "DOUYIN_AUTHORIZATION_CODE_INVALID_OR_CONSUMED",
    parsed.data.log_id ? { log_id: parsed.data.log_id } : undefined,
  );
}
