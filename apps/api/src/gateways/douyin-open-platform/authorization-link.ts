import { z } from "zod";

import { SafeDouyinLogIdSchema } from "./release-client";

export const GENERATE_AUTHORIZATION_LINK_URL =
  "https://open.douyin.com/api/tpapp/v3/auth/gen_link/";

export type GenerateAuthorizationLinkInput = {
  readonly componentAccessToken: string;
  readonly redirectUri: string;
};

export type GenerateAuthorizationLinkResult = {
  readonly link: string;
  readonly logId: string;
};

const SafeAuthorizationLinkSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === "";
  } catch {
    return false;
  }
});

const AuthorizationLinkSuccessSchema = z.strictObject({
  err_no: z.literal(0),
  err_msg: z.string(),
  log_id: SafeDouyinLogIdSchema,
  data: z.strictObject({
    link: SafeAuthorizationLinkSchema,
  }),
});

export function buildAuthorizationLinkRequest(
  input: GenerateAuthorizationLinkInput,
): RequestInit {
  return {
    method: "POST",
    headers: {
      "access-token": input.componentAccessToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      link_type: 1,
      redirect_uri: input.redirectUri,
    }),
  };
}

export function parseAuthorizationLinkResponse(
  body: Record<string, unknown>,
  onInvalid: () => never,
): GenerateAuthorizationLinkResult {
  const parsed = AuthorizationLinkSuccessSchema.safeParse(body);
  if (!parsed.success) return onInvalid();
  return {
    link: parsed.data.data.link,
    logId: parsed.data.log_id,
  };
}
