import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const TenantOnboardingShareTokenSchema = z
  .string()
  .trim()
  .regex(/^tnob_[A-Za-z0-9_-]{24,96}$/, "装企入驻分享 token 格式不正确");

export const TenantOnboardingShareTokenParamSchema = z
  .object({ token: TenantOnboardingShareTokenSchema })
  .strict();

export const TenantOnboardingShareLinkIdParamSchema = z
  .object({ id: z.uuid("无效的装企入驻分享链接 ID") })
  .strict();

export const TenantOnboardingShareLinkCreateSchema = z.object({}).strict();

export const TenantOnboardingShareLinkIdempotencyKeySchema = z
  .uuid("Idempotency-Key 必须为 UUID");

export const TenantOnboardingShareLinkListQuerySchema =
  PaginationQuerySchema.extend({});
