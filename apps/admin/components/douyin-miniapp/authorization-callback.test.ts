import { describe, expect, mock, test } from "bun:test";

import {
  exchangeAuthorizationCallback,
  parseAuthorizationCallbackSearch,
} from "./authorization-callback";

describe("Douyin authorization callback query", () => {
  test("returns the validated exchange payload", () => {
    expect(parseAuthorizationCallbackSearch(
      "?intent=opaque-intent-opaque-intent-opaque-intent"
        + "&authorization_code=authorization-code"
        + "&expires_in=600",
    )).toEqual({
      ok: true,
      payload: {
        intent: "opaque-intent-opaque-intent-opaque-intent",
        authorization_code: "authorization-code",
        expires_in: 600,
      },
    });
  });

  test("reports a safe error without exposing the authorization code", () => {
    const result = parseAuthorizationCallbackSearch(
      "?intent=short&authorization_code=secret-authorization-code&expires_in=0",
    );

    expect(result).toEqual({
      ok: false,
      message: "授权回调参数无效，请返回工作台重新发起授权。",
    });
    expect(JSON.stringify(result)).not.toContain("secret-authorization-code");
  });

  test("removes the query before exchanging the authorization code", async () => {
    const events: string[] = [];
    const request = mock(async () => {
      events.push("request");
    });

    await exchangeAuthorizationCallback({
      search: "?intent=opaque-intent-opaque-intent-opaque-intent"
        + "&authorization_code=authorization-code"
        + "&expires_in=600",
      replaceHistory: () => events.push("replace-history"),
      request,
      redirect: () => events.push("redirect"),
    });

    expect(events).toEqual(["replace-history", "request", "redirect"]);
    expect(request).toHaveBeenCalledWith({
      intent: "opaque-intent-opaque-intent-opaque-intent",
      authorization_code: "authorization-code",
      expires_in: 600,
    });
  });
});
