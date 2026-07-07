import { z } from "zod";

export const PlatformPartnerPhoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");
