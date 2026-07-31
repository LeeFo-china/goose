import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const NOTIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_KEY = "a".repeat(64);
const PAYLOAD_HASH = "b".repeat(64);

const record = {
  id: NOTIFICATION_ID,
  event_key: EVENT_KEY,
  payload_sha256: PAYLOAD_HASH,
  status: "processing" as const,
  order_id: null,
  retry_count: 0,
  result_summary: {},
};

function repositoryWith(input: {
  singleResults?: Array<{ data: unknown; error: unknown }>;
  maybeSingleResult?: { data: unknown; error: unknown };
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const singleResults = [...(input.singleResults ?? [])];
  const query = {
    select(columns: string) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return query;
    },
    neq(column: string, value: unknown) {
      calls.push(["neq", column, value]);
      return query;
    },
    limit(count: number) {
      calls.push(["limit", count]);
      return query;
    },
    insert(values: Record<string, unknown>) {
      calls.push(["insert", values]);
      return query;
    },
    update(values: Record<string, unknown>) {
      calls.push(["update", values]);
      return query;
    },
    single: mock(async () => singleResults.shift() ?? { data: null, error: null }),
    maybeSingle: mock(async () => input.maybeSingleResult ?? {
      data: null,
      error: null,
    }),
  };
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return query;
    },
  };
  return { calls, client };
}

const createInput = {
  eventKey: EVENT_KEY,
  eventType: "xpay_goods_deliver_notify" as const,
  environment: "production" as const,
  outTradeNo: "BV202608010001",
  providerProductId: "branding-annual",
  openidHash: "c".repeat(64),
  normalizedPayload: { transaction_id: "transaction-1" },
  payloadSha256: PAYLOAD_HASH,
  requestId: "request-1",
};

describe("WechatVirtualPaymentNotificationRepository", () => {
  test("persists only authenticated normalized facts and parses the inserted inbox row", async () => {
    const fixture = repositoryWith({
      singleResults: [{ data: record, error: null }],
    });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    expect(await repository.createOrGet(createInput)).toEqual({
      created: true,
      record,
    });
    const insert = fixture.calls.find(([method]) => method === "insert")?.[1];
    expect(insert).toMatchObject({
      authentication_method: "wechat_plaintext_sha1",
      authentication_status: "verified",
      normalized_payload: createInput.normalizedPayload,
      openid_hash: createInput.openidHash,
    });
    expect(JSON.stringify(insert)).not.toContain("payer-openid");
    expect(JSON.stringify(insert)).not.toContain("message-token");
  });

  test("resolves an exact unique-key duplicate through one bounded event lookup", async () => {
    const fixture = repositoryWith({
      singleResults: [{ data: null, error: { code: "23505" } }],
      maybeSingleResult: { data: record, error: null },
    });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    expect(await repository.createOrGet(createInput)).toEqual({
      created: false,
      record,
    });
    expect(fixture.calls).toContainEqual(["eq", "event_key", EVENT_KEY]);
    expect(fixture.calls).toContainEqual(["limit", 1]);
  });

  test("marks completion by notification identity without replacing immutable facts", async () => {
    const fixture = repositoryWith({
      singleResults: [{ data: { id: NOTIFICATION_ID }, error: null }],
    });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    await repository.markProcessed({
      notificationId: NOTIFICATION_ID,
      orderId: ORDER_ID,
      resultSummary: { fulfilled: true },
    });
    const update = fixture.calls.find(([method]) => method === "update")?.[1];
    expect(update).toMatchObject({
      order_id: ORDER_ID,
      status: "processed",
      result_summary: { fulfilled: true },
    });
    expect(update).not.toHaveProperty("event_key");
    expect(update).not.toHaveProperty("normalized_payload");
  });

  test("never downgrades a processed inbox fact while recording a retry", async () => {
    const fixture = repositoryWith({
      maybeSingleResult: { data: null, error: null },
    });
    const { WechatVirtualPaymentNotificationRepository } = await import(
      "./wechat-virtual-payment-notifications"
    );
    const repository = new WechatVirtualPaymentNotificationRepository(
      () => fixture.client,
    );

    await repository.markFailed({
      notificationId: NOTIFICATION_ID,
      orderId: ORDER_ID,
      retryCount: 1,
      errorCode: "DB_ERROR",
      errorSummary: "微信虚拟支付消息等待重试",
    });

    expect(fixture.calls).toContainEqual(["eq", "id", NOTIFICATION_ID]);
    expect(fixture.calls).toContainEqual(["neq", "status", "processed"]);
  });
});
