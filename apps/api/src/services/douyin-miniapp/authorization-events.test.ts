import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createCipheriv, createHash, createHmac, createSecretKey } from "node:crypto";
import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./authorization-events").DouyinAuthorizationEventsService;
beforeAll(async () => {
  ({ DouyinAuthorizationEventsService: Service } = await import("./authorization-events"));
});

const NOW_MS = Date.parse("2026-07-20T08:00:00.000Z");
const NOW_SECONDS = String(NOW_MS / 1000);
const COMPONENT_APP_ID = "tt-component-1";
const AUTHORIZER_APP_ID = "tt-authorizer-1";
const TOKEN = "callback-token";
const AES_KEY = Buffer.alloc(32, 0x5a);
const ENCODING_AES_KEY = AES_KEY.toString("base64").slice(0, -1);
const CREDENTIAL_KEY = createSecretKey(Buffer.alloc(32, 0x31));
const CLAIM_TOKEN = "11111111-1111-4111-8111-111111111111";

type CallbackMessage = Record<string, unknown>;
type ClaimResult =
  | { readonly state: "claimed" | "reclaimed"; readonly claimToken: string;
    readonly claimExpiresAt: string }
  | { readonly state: "completed" | "busy" };
type EventState = "processing" | "completed" | null;

function callback(message: CallbackMessage, options: {
  timestamp?: string;
  encryptedComponentAppId?: string;
} = {}) {
  const timestamp = options.timestamp ?? NOW_SECONDS;
  const encrypted = encryptMessage(
    message,
    options.encryptedComponentAppId ?? COMPONENT_APP_ID,
  );
  return {
    Nonce: "nonce-1",
    TimeStamp: timestamp,
    Encrypt: encrypted,
    MsgSignature: createHash("sha1")
      .update([TOKEN, timestamp, "nonce-1", encrypted].sort().join(""))
      .digest("hex"),
  };
}

function encryptMessage(message: CallbackMessage, componentAppId: string): string {
  const messageBytes = Buffer.from(JSON.stringify(message));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBytes.length);
  const plaintext = Buffer.concat([
    Buffer.from("fedcba9876543210"),
    length,
    messageBytes,
    Buffer.from(componentAppId),
  ]);
  const paddingLength = 32 - (plaintext.length % 32 || 32) || 32;
  const cipher = createCipheriv("aes-256-cbc", AES_KEY, Buffer.from("0123456789abcdef"));
  cipher.setAutoPadding(false);
  return Buffer.concat([
    Buffer.from("0123456789abcdef"),
    cipher.update(Buffer.concat([plaintext, Buffer.alloc(paddingLength, paddingLength)])),
    cipher.final(),
  ]).toString("base64");
}

function authorizationMessage(event: "AUTHORIZED" | "UPDATE_AUTHORIZED" = "AUTHORIZED") {
  return {
    AppId: AUTHORIZER_APP_ID,
    TpAppId: COMPONENT_APP_ID,
    Event: event,
    AuthorizationCode: "callback-auth-code",
    AuthorizationCodeExpiresIn: 3600,
  };
}

function expectedEventKey(eventName: string, authorizerAppId: string, occurredAt: string) {
  const hmac = createHmac("sha256", "subject-hash-key-at-least-32-bytes");
  for (const value of [
    "gooes:douyin:authorization-event:v1",
    COMPONENT_APP_ID,
    eventName,
    authorizerAppId,
    occurredAt,
  ]) {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    hmac.update(length).update(bytes);
  }
  return hmac.digest("hex");
}

function fixture(overrides: Record<string, unknown> = {}) {
  const eventRepository = {
    claimEvent: mock(async (_input: unknown): Promise<ClaimResult> => ({
      state: "claimed" as const,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: new Date(NOW_MS + 60_000).toISOString(),
    })),
    findEventState: mock(async (_eventKey: string): Promise<EventState> => "completed"),
    completeTicketEvent: mock(async (_input: unknown) => true),
    completeAuthorizationEvent: mock(async (_input: unknown) => true),
    completeRevocationEvent: mock(async (_input: unknown) => true),
    completeUnsupportedEvent: mock(async (_input: unknown) => true),
  };
  const openPlatform = {
    retrieveAuthorizationCode: mock(async () => "retrieved-auth-code"),
    exchangeAuthorizationCode: mock(async () => ({
      accessToken: "authorizer-access-token",
      authorizerAppId: AUTHORIZER_APP_ID,
      refreshToken: "authorizer-refresh-token",
      expiresIn: 7200,
      refreshExpiresIn: 2_592_000,
      permissions: [{ id: 1 }],
    })),
  };
  const accessTokens = { getComponentAccessToken: mock(async () => "component-access-token") };
  const componentRepository = {
    findActive: mock(async () => ({ component_appid: COMPONENT_APP_ID })),
  };
  const log = { info: mock((_metadata: unknown, _message: string) => undefined) };
  let currentNow = NOW_MS;
  const options = {
    componentAppId: COMPONENT_APP_ID,
    componentMessageToken: TOKEN,
    componentMessageAesKey: ENCODING_AES_KEY,
    credentialKeyring: { activeKeyVersion: "v1", keys: { v1: CREDENTIAL_KEY } },
    subjectHashKey: "subject-hash-key-at-least-32-bytes",
    eventRepository,
    componentRepository,
    accessTokens,
    openPlatform,
    log,
    now: () => currentNow,
    sleep: mock(async (milliseconds: number) => { currentNow += milliseconds; }),
    ...overrides,
  };
  return {
    service: new Service(options),
    eventRepository,
    openPlatform,
    accessTokens,
    componentRepository,
    log,
  };
}

async function captureAppError(operation: () => Promise<unknown>): Promise<AppError> {
  try {
    await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("expected AppError");
}

describe("DouyinAuthorizationEventsService trust boundary", () => {
  test("rejects stale timestamps before storage or provider work", async () => {
    const context = fixture();
    const error = await captureAppError(() => context.service.handleCallback(
      callback(authorizationMessage(), { timestamp: String(Number(NOW_SECONDS) - 301) }),
    ));
    expect(error).toMatchObject({ statusCode: 400, code: "DOUYIN_CALLBACK_TIMESTAMP_INVALID" });
    expect(context.eventRepository.claimEvent).not.toHaveBeenCalled();
    expect(context.openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  test("rejects a bad signature and a mismatched encrypted component AppID", async () => {
    const context = fixture();
    await expect(context.service.handleCallback({
      ...callback(authorizationMessage()),
      MsgSignature: "0".repeat(40),
    })).rejects.toMatchObject({ code: "DOUYIN_CALLBACK_SIGNATURE_INVALID" });
    await expect(context.service.handleCallback(callback(authorizationMessage(), {
      encryptedComponentAppId: "tt-other-component",
    }))).rejects.toMatchObject({ code: "DOUYIN_CALLBACK_COMPONENT_APP_ID_MISMATCH" });
    expect(context.eventRepository.claimEvent).not.toHaveBeenCalled();
  });

  test("requires the configured component to be active and match TpAppId", async () => {
    const inactive = fixture({ componentRepository: { findActive: mock(async () => null) } });
    await expect(inactive.service.handleCallback(callback(authorizationMessage())))
      .rejects.toMatchObject({ code: "DOUYIN_COMPONENT_NOT_ACTIVE" });
    const mismatch = fixture();
    await expect(mismatch.service.handleCallback(callback({
      ...authorizationMessage(), TpAppId: "tt-other-component",
    }))).rejects.toMatchObject({ code: "DOUYIN_CALLBACK_COMPONENT_APP_ID_MISMATCH" });
    expect(mismatch.eventRepository.claimEvent).not.toHaveBeenCalled();
  });

  test("rejects malformed decrypted events", async () => {
    const context = fixture();
    await expect(context.service.handleCallback(callback({
      AppId: AUTHORIZER_APP_ID,
      TpAppId: COMPONENT_APP_ID,
      Event: "AUTHORIZED",
    }))).rejects.toMatchObject({ code: "DOUYIN_CALLBACK_MESSAGE_INVALID" });
    expect(context.eventRepository.claimEvent).not.toHaveBeenCalled();
  });
});

describe("DouyinAuthorizationEventsService delivery handling", () => {
  test("encrypts and atomically stores a PUSH ticket without sensitive logs", async () => {
    const context = fixture();
    await context.service.handleCallback(callback({
      Ticket: "ticket-value", MsgType: "Ticket", Event: "PUSH",
    }));
    const claim = context.eventRepository.claimEvent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(claim).toMatchObject({
      componentAppId: COMPONENT_APP_ID,
      eventName: "PUSH",
      authorizerAppId: null,
      occurredAt: "2026-07-20T08:00:00.000Z",
    });
    expect(claim.eventKey).toMatch(/^[0-9a-f]{64}$/);
    const completion = context.eventRepository.completeTicketEvent.mock.calls[0]?.[0] as {
      readonly ticket: { readonly ciphertext: string };
    };
    expect(completion.ticket).not.toMatchObject({ ciphertext: "ticket-value" });
    expect(JSON.stringify([claim, completion])).not.toContain("ticket-value");
    expect(JSON.stringify(context.log.info.mock.calls)).not.toContain("ticket-value");
  });

  test("claims before exchanging AUTHORIZED and stores only encrypted credentials", async () => {
    const order: string[] = [];
    const context = fixture();
    context.eventRepository.claimEvent.mockImplementation(async () => {
      order.push("claim");
      return { state: "claimed", claimToken: CLAIM_TOKEN,
        claimExpiresAt: new Date(NOW_MS + 60_000).toISOString() } as const;
    });
    context.openPlatform.exchangeAuthorizationCode.mockImplementation(async () => {
      order.push("exchange");
      return { accessToken: "authorizer-access-token", authorizerAppId: AUTHORIZER_APP_ID,
        refreshToken: "authorizer-refresh-token", expiresIn: 7200,
        refreshExpiresIn: 2_592_000, permissions: [{ id: 1 }] };
    });
    await context.service.handleCallback(callback(authorizationMessage()));
    expect(order).toEqual(["claim", "exchange"]);
    expect(context.openPlatform.exchangeAuthorizationCode).toHaveBeenCalledWith({
      componentAccessToken: "component-access-token",
      authorizationCode: "callback-auth-code",
    });
    const completion = context.eventRepository.completeAuthorizationEvent.mock.calls[0]?.[0] as {
      readonly eventKey: string;
      readonly accessToken: unknown;
      readonly refreshToken: unknown;
    } & Record<string, unknown>;
    expect(completion).toMatchObject({
      eventName: "AUTHORIZED",
      authorizerAppId: AUTHORIZER_APP_ID,
      occurredAt: "2026-07-20T08:00:00.000Z",
      accessToken: { expiresAt: "2026-07-20T10:00:00.000Z" },
      refreshToken: { expiresAt: "2026-08-19T08:00:00.000Z" },
    });
    expect(completion.eventKey).toBe(expectedEventKey(
      "AUTHORIZED", AUTHORIZER_APP_ID, "2026-07-20T08:00:00.000Z",
    ));
    expect(JSON.stringify(completion)).not.toContain("authorizer-access-token");
    expect(JSON.stringify(completion)).not.toContain("authorizer-refresh-token");
    expect(JSON.stringify(context.log.info.mock.calls)).not.toContain("callback-auth-code");
  });

  test("uses decrypted event time for UPDATE_AUTHORIZED", async () => {
    const context = fixture();
    await context.service.handleCallback(callback({
      ...authorizationMessage("UPDATE_AUTHORIZED"),
      CreateTime: Number(NOW_SECONDS) - 10,
    }));
    expect(context.eventRepository.completeAuthorizationEvent)
      .toHaveBeenCalledWith(expect.objectContaining({
        eventName: "UPDATE_AUTHORIZED",
        occurredAt: "2026-07-20T07:59:50.000Z",
      }));
  });

  test("retrieves a fresh code for a reclaimed authorization lease", async () => {
    const context = fixture();
    context.eventRepository.claimEvent.mockResolvedValue({
      state: "reclaimed", claimToken: CLAIM_TOKEN,
      claimExpiresAt: new Date(NOW_MS + 60_000).toISOString(),
    });
    await context.service.handleCallback(callback(authorizationMessage()));
    expect(context.openPlatform.retrieveAuthorizationCode).toHaveBeenCalledWith({
      componentAccessToken: "component-access-token",
      authorizationAppId: AUTHORIZER_APP_ID,
    });
    expect(context.openPlatform.exchangeAuthorizationCode).toHaveBeenCalledWith({
      componentAccessToken: "component-access-token",
      authorizationCode: "retrieved-auth-code",
    });
  });

  test("acks completed duplicates without provider work", async () => {
    const context = fixture();
    context.eventRepository.claimEvent.mockResolvedValue({ state: "completed" });
    await context.service.handleCallback(callback(authorizationMessage()));
    expect(context.accessTokens.getComponentAccessToken).not.toHaveBeenCalled();
    expect(context.openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  test("short-polls busy deliveries and returns stable 503 while still processing", async () => {
    const context = fixture();
    context.eventRepository.claimEvent.mockResolvedValue({ state: "busy" });
    context.eventRepository.findEventState.mockResolvedValue("processing");
    const error = await captureAppError(() =>
      context.service.handleCallback(callback(authorizationMessage())));
    expect(error).toMatchObject({ statusCode: 503, code: "DOUYIN_AUTHORIZATION_EVENT_BUSY" });
    expect(context.eventRepository.findEventState.mock.calls.length).toBeGreaterThan(0);
    expect(context.openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  test("acks a busy delivery when polling observes completion", async () => {
    const context = fixture();
    context.eventRepository.claimEvent.mockResolvedValue({ state: "busy" });
    context.eventRepository.findEventState
      .mockResolvedValueOnce("processing")
      .mockResolvedValueOnce("completed");
    await context.service.handleCallback(callback(authorizationMessage()));
    expect(context.openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  test("does not start provider work without lease headroom", async () => {
    const context = fixture();
    context.eventRepository.claimEvent.mockResolvedValue({
      state: "claimed", claimToken: CLAIM_TOKEN,
      claimExpiresAt: new Date(NOW_MS + 22_000).toISOString(),
    });
    await expect(context.service.handleCallback(callback(authorizationMessage())))
      .rejects.toMatchObject({
        statusCode: 503,
        code: "DOUYIN_AUTHORIZATION_EVENT_LEASE_INSUFFICIENT",
      });
    expect(context.accessTokens.getComponentAccessToken).not.toHaveBeenCalled();
    expect(context.openPlatform.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  test("returns a retryable error when atomic completion rejects the lease", async () => {
    const context = fixture();
    context.eventRepository.completeAuthorizationEvent.mockResolvedValue(false);
    await expect(context.service.handleCallback(callback(authorizationMessage())))
      .rejects.toMatchObject({
        statusCode: 503,
        code: "DOUYIN_AUTHORIZATION_EVENT_COMPLETION_REJECTED",
      });
  });

  test("rejects provider credentials for another authorizer", async () => {
    const context = fixture();
    context.openPlatform.exchangeAuthorizationCode.mockResolvedValue({
      accessToken: "authorizer-access-token",
      authorizerAppId: "tt-other-authorizer",
      refreshToken: "authorizer-refresh-token",
      expiresIn: 7200,
      refreshExpiresIn: 2_592_000,
      permissions: [],
    });
    await expect(context.service.handleCallback(callback(authorizationMessage())))
      .rejects.toMatchObject({ code: "DOUYIN_AUTHORIZER_APP_ID_MISMATCH" });
    expect(context.eventRepository.completeAuthorizationEvent).not.toHaveBeenCalled();
  });

  test("atomically revokes UNAUTHORIZED without provider work", async () => {
    const context = fixture();
    await context.service.handleCallback(callback({
      AppId: AUTHORIZER_APP_ID,
      TpAppId: COMPONENT_APP_ID,
      Event: "UNAUTHORIZED",
      EventTime: Number(NOW_SECONDS),
    }));
    expect(context.eventRepository.completeRevocationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ authorizerAppId: AUTHORIZER_APP_ID }),
    );
    expect(context.accessTokens.getComponentAccessToken).not.toHaveBeenCalled();
  });

  test("acks unsupported trusted events and logs only their normalized name", async () => {
    const context = fixture();
    await context.service.handleCallback(callback({
      AppId: AUTHORIZER_APP_ID,
      TpAppId: COMPONENT_APP_ID,
      Event: "PERMISSION_CHANGED",
      EventTime: Number(NOW_SECONDS),
    }));
    expect(context.eventRepository.completeUnsupportedEvent).toHaveBeenCalled();
    expect(context.log.info).toHaveBeenCalledWith(
      { eventName: "PERMISSION_CHANGED" },
      "ignored trusted Douyin callback event",
    );
    expect(JSON.stringify(context.log.info.mock.calls)).not.toContain(AUTHORIZER_APP_ID);
  });
});
