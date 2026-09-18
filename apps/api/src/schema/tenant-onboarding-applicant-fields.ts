import { z } from "zod";

export const UnifiedSocialCreditCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^[0-9A-HJ-NPQRTUWXY]{18}$/,
        "统一社会信用代码格式不正确",
      ),
  );

export const OptionalUnifiedSocialCreditCodeSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  },
  UnifiedSocialCreditCodeSchema.nullable(),
).optional().transform((value) => value ?? null);

export const OptionalLocationTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .optional();

export const OptionalBusinessLicenseFileIdSchema = z.preprocess(
  (value) => {
    if (value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  },
  z.uuid("无效的营业执照文件 ID").nullable().optional(),
);
