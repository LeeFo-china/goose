import { z } from "zod";
import { MarketingPageSlugSchema, TenantSlugSchema } from "@/schema/marketing-pages";
import { userIdentityService } from "@/services/user-identities";

export type WeChatSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export type WechatAuthResolution =
  | {
    kind: "auth_user";
    userId: string;
    isNewUser: boolean;
  }
  | {
    kind: "visitor_session";
    visitorId: string;
    isNewUser: true;
  };

export type ActiveBusinessMembership = Awaited<
  ReturnType<typeof userIdentityService.listActiveBusinessMemberships>
>[number];

export const WeChatAuthBodySchema = z.object({
  code: z.string().trim().min(1, "缺少 code"),
});

export const VISITOR_ONLY_AUTH_USER_CACHE_TTL_MS = 60_000;

export const CustomerTenantSelectBodySchema = z.object({
  tenant_id: z.uuid("无效的租户 ID"),
  customer_id: z.uuid("无效的客户 ID"),
});

export const H5MarketingSessionBodySchema = z.object({
  slug: MarketingPageSlugSchema,
  tenant_slug: TenantSlugSchema
    .nullable()
    .optional(),
  scene: z.string().trim().max(80, "场景值过长").nullable().optional(),
});
