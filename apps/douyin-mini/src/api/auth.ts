import type { SessionExchangeInput, SessionExchangeResult } from "../models";
import { ApiRequestError, type RequestTransport } from "./request";

export async function exchangeDouyinSession(
  transport: RequestTransport,
  input: SessionExchangeInput,
): Promise<SessionExchangeResult> {
  const value = await transport.send({
    path: "/douyin-mini/auth/session",
    method: "POST",
    data: input,
  });
  if (!isRecord(value)
    || typeof value.access_token !== "string"
    || !value.access_token
    || value.access_token.length > 8_192
    || typeof value.expires_in !== "number"
    || !Number.isFinite(value.expires_in)
    || !Number.isInteger(value.expires_in)
    || value.expires_in <= 0
    || value.expires_in > 86_400) {
    throw new ApiRequestError(
      502,
      "DOUYIN_SESSION_EXCHANGE_FAILED",
      "抖音会话初始化失败",
    );
  }
  return { accessToken: value.access_token, expiresIn: value.expires_in };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
