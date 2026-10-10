import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import {
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from "@/services/wechat-miniprogram-access-token";

const ResultSchema = z.object({
  errcode: z.literal(0),
  trace_id: z.string().trim().min(1).max(256),
  result: z.object({ suggest: z.enum(["pass", "risky", "review"]) }),
});
export type ContentSafetyResult = {
  status: "approved" | "rejected" | "pending";
  traceId: string;
};
type Dependencies = {
  accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export function contentCheckUnavailable() {
  return Errors.business(503, "暂时无法审核，请稍后重试", "CONTENT_CHECK_UNAVAILABLE");
}

/** Only an explicit, valid WeChat pass allows publication. Never log provider payloads. */
export class WechatContentSafetyGateway {
  private readonly tokens: WechatMiniProgramAccessTokenPort;
  private readonly fetchImpl: NonNullable<Dependencies["fetchImpl"]>;

  constructor(dependencies: Dependencies = {}) {
    this.tokens = dependencies.accessTokenProvider ?? wechatMiniProgramAccessTokenProvider;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
  }

  async checkText(input: { openid: string; content: string }): Promise<ContentSafetyResult> {
    try {
      const token = await this.tokens.getAccessToken();
      const url = new URL("https://api.weixin.qq.com/wxa/msg_sec_check");
      url.searchParams.set("access_token", token);
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, version: 2, scene: 2 }),
        signal: AbortSignal.timeout(8_000),
      });
      const result = ResultSchema.safeParse(await response.json());
      if (!response.ok || !result.success) throw contentCheckUnavailable();
      const statuses = { pass: "approved", risky: "rejected", review: "pending" } as const;
      return { status: statuses[result.data.result.suggest], traceId: result.data.trace_id };
    } catch {
      // Network/configuration/credential errors all fail closed with a neutral public contract.
      throw contentCheckUnavailable();
    }
  }
}
export const wechatContentSafetyGateway = new WechatContentSafetyGateway();
