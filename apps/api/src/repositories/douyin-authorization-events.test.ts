import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { DouyinCredentialEnvelope } from "@/services/douyin-miniapp/credential-envelope";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./douyin-authorization-events").DouyinAuthorizationEventsRepository;
beforeAll(async () => {
  ({ DouyinAuthorizationEventsRepository: Repository } = await import("./douyin-authorization-events"));
});

const EVENT_KEY = "a".repeat(64);
const CLAIM_TOKEN = "11111111-1111-4111-8111-111111111111";
const OCCURRED_AT = "2026-07-20T00:00:00.000Z";
const envelope: DouyinCredentialEnvelope = {
  ciphertext: "ciphertext", iv: "aXYtaXotaXY=", tag: "dGFnLXRhZy10YWctdGFnMQ==", keyVersion: "v1",
};

function client(data: unknown = true, error: unknown = null) {
  const rpc = mock(async (_name: string, _args: Record<string, unknown>) => ({ data, error }));
  return { rpc, client: { rpc } };
}

describe("DouyinAuthorizationEventsRepository", () => {
  test.each([
    ["claimed", CLAIM_TOKEN, "2026-07-20T00:01:00.000Z"],
    ["reclaimed", CLAIM_TOKEN, "2026-07-20T00:01:00.000Z"],
    ["completed", null, null],
    ["busy", null, null],
  ] as const)("parses the %s claim state", async (state, token, expiresAt) => {
    const fixture = client([{ claim_state: state, claim_token: token, claim_expires_at: expiresAt }]);
    const result = await new Repository(fixture.client).claimEvent({
      eventKey: EVENT_KEY, componentAppId: "tt-component-1", eventName: "AUTHORIZED",
      authorizerAppId: "tt-authorizer-1", occurredAt: OCCURRED_AT,
    });
    if (state === "claimed" || state === "reclaimed") {
      expect(result).toEqual({
        state,
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: "2026-07-20T00:01:00.000Z",
      });
    } else {
      expect(result).toEqual({ state });
    }
    expect(fixture.rpc).toHaveBeenCalledWith("claim_douyin_authorization_event", {
      p_event_key: EVENT_KEY,
      p_component_appid: "tt-component-1",
      p_event_name: "AUTHORIZED",
      p_authorizer_appid: "tt-authorizer-1",
      p_occurred_at: OCCURRED_AT,
    });
  });

  test("preserves inactive-component claim errors without leaking database details", async () => {
    const fixture = client(null, {
      message: "DOUYIN_COMPONENT_NOT_ACTIVE",
      details: "component-secret",
    });
    let caught: unknown;
    try {
      await new Repository(fixture.client).claimEvent({
        eventKey: EVENT_KEY,
        componentAppId: "tt-component-1",
        eventName: "PUSH",
        authorizerAppId: null,
        occurredAt: OCCURRED_AT,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 503,
      code: "DOUYIN_COMPONENT_NOT_ACTIVE",
    });
    expect(JSON.stringify(caught)).not.toContain("component-secret");
  });

  test("reads only the stable processing state", async () => {
    const fixture = client("completed");
    await expect(new Repository(fixture.client).findEventState(EVENT_KEY))
      .resolves.toBe("completed");
    expect(fixture.rpc).toHaveBeenCalledWith("get_douyin_authorization_event_state", {
      p_event_key: EVENT_KEY,
    });
  });

  test("passes distinct event keys and authorizers independently to the atomic claim RPC", async () => {
    const fixture = client([{
      claim_state: "busy", claim_token: null, claim_expires_at: null,
    }]);
    const repository = new Repository(fixture.client);
    for (const [eventKey, authorizerAppId] of [
      ["b".repeat(64), "tt-authorizer-1"],
      ["c".repeat(64), "tt-authorizer-2"],
    ] as const) {
      await repository.claimEvent({
        eventKey, componentAppId: "tt-component-1", eventName: "AUTHORIZED",
        authorizerAppId, occurredAt: OCCURRED_AT,
      });
    }
    expect(fixture.rpc.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        p_event_key: "b".repeat(64), p_authorizer_appid: "tt-authorizer-1",
      }),
      expect.objectContaining({
        p_event_key: "c".repeat(64), p_authorizer_appid: "tt-authorizer-2",
      }),
    ]);
  });

  test("maps encrypted ticket completion without plaintext", async () => {
    const fixture = client(true);
    await expect(new Repository(fixture.client).completeTicketEvent({
      eventKey: EVENT_KEY, claimToken: CLAIM_TOKEN, componentAppId: "tt-component-1",
      ticket: envelope, receivedAt: OCCURRED_AT,
    })).resolves.toBe(true);
    expect(fixture.rpc).toHaveBeenCalledWith("complete_douyin_ticket_event", {
      p_event_key: EVENT_KEY, p_claim_token: CLAIM_TOKEN,
      p_component_appid: "tt-component-1",
      p_ticket_ciphertext: envelope.ciphertext, p_ticket_iv: envelope.iv,
      p_ticket_tag: envelope.tag, p_ticket_key_version: envelope.keyVersion,
      p_received_at: OCCURRED_AT,
    });
  });

  test("maps encrypted authorization completion and lifecycle timestamp", async () => {
    const fixture = client(true);
    await expect(new Repository(fixture.client).completeAuthorizationEvent({
      eventKey: EVENT_KEY, claimToken: CLAIM_TOKEN, componentAppId: "tt-component-1",
      authorizerAppId: "tt-authorizer-1", eventName: "UPDATE_AUTHORIZED",
      occurredAt: OCCURRED_AT,
      accessToken: { ...envelope, expiresAt: "2026-07-20T02:00:00.000Z" },
      refreshToken: { ...envelope, expiresAt: "2026-08-20T00:00:00.000Z" },
      permissions: [{ id: 1 }],
    })).resolves.toBe(true);
    expect(fixture.rpc).toHaveBeenCalledWith("complete_douyin_authorization_event", {
      p_event_key: EVENT_KEY, p_claim_token: CLAIM_TOKEN,
      p_component_appid: "tt-component-1", p_authorizer_appid: "tt-authorizer-1",
      p_event_name: "UPDATE_AUTHORIZED", p_occurred_at: OCCURRED_AT,
      p_access_token_ciphertext: envelope.ciphertext, p_access_token_iv: envelope.iv,
      p_access_token_tag: envelope.tag, p_access_token_key_version: envelope.keyVersion,
      p_access_token_expires_at: "2026-07-20T02:00:00.000Z",
      p_refresh_token_ciphertext: envelope.ciphertext, p_refresh_token_iv: envelope.iv,
      p_refresh_token_tag: envelope.tag, p_refresh_token_key_version: envelope.keyVersion,
      p_refresh_token_expires_at: "2026-08-20T00:00:00.000Z",
      p_permissions: [{ id: 1 }],
    });
  });

  test("maps revocation and unsupported-event completion", async () => {
    const fixture = client(true);
    const repository = new Repository(fixture.client);
    await repository.completeRevocationEvent({
      eventKey: EVENT_KEY, claimToken: CLAIM_TOKEN,
      componentAppId: "tt-component-1", authorizerAppId: "tt-authorizer-1",
      occurredAt: OCCURRED_AT,
    });
    await repository.completeUnsupportedEvent({ eventKey: EVENT_KEY, claimToken: CLAIM_TOKEN });
    expect(fixture.rpc.mock.calls[0]).toEqual(["complete_douyin_revocation_event", {
      p_event_key: EVENT_KEY, p_claim_token: CLAIM_TOKEN,
      p_component_appid: "tt-component-1", p_authorizer_appid: "tt-authorizer-1",
      p_occurred_at: OCCURRED_AT,
    }]);
    expect(fixture.rpc.mock.calls[1]).toEqual(["complete_douyin_unsupported_event", {
      p_event_key: EVENT_KEY, p_claim_token: CLAIM_TOKEN,
    }]);
  });

  test("fails closed on malformed RPC data and wraps database errors", async () => {
    await expect(new Repository(client([{ claim_state: "claimed", claim_token: null,
      claim_expires_at: null }]).client).claimEvent({
      eventKey: EVENT_KEY, componentAppId: "tt-component-1", eventName: "PUSH",
      authorizerAppId: null, occurredAt: OCCURRED_AT,
    })).rejects.toMatchObject({ code: "DOUYIN_AUTHORIZATION_EVENT_REPOSITORY_RESPONSE_INVALID" });
    await expect(new Repository(client(null, { message: "secret db detail" }).client)
      .findEventState(EVENT_KEY))
      .rejects.toMatchObject({ code: "DOUYIN_AUTHORIZATION_EVENT_REPOSITORY_ERROR" });
  });

  test("rejects a claimed lease with a non-ISO expiry", async () => {
    const malformed = client([{
      claim_state: "claimed",
      claim_token: CLAIM_TOKEN,
      claim_expires_at: "tomorrow",
    }]);
    await expect(new Repository(malformed.client).claimEvent({
      eventKey: EVENT_KEY,
      componentAppId: "tt-component-1",
      eventName: "AUTHORIZED",
      authorizerAppId: "tt-authorizer-1",
      occurredAt: OCCURRED_AT,
    })).rejects.toMatchObject({
      code: "DOUYIN_AUTHORIZATION_EVENT_REPOSITORY_RESPONSE_INVALID",
    });
  });
});
