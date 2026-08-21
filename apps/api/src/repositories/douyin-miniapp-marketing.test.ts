import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  DouyinMiniappMarketingDatabaseClient,
  DouyinMiniappMarketingDatabaseResult,
  DouyinMiniappMarketingQuery,
} from "./douyin-miniapp-marketing";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinMiniappMarketingRepository:
  typeof import("./douyin-miniapp-marketing").DouyinMiniappMarketingRepository;

beforeAll(async () => {
  ({ DouyinMiniappMarketingRepository } = await import("./douyin-miniapp-marketing"));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };

function createClient(results: DouyinMiniappMarketingDatabaseResult[]) {
  const calls: Call[] = [];
  let index = 0;

  class Query implements DouyinMiniappMarketingQuery {
    insert(rows: readonly Record<string, unknown>[]) {
      calls.push({ method: "insert", args: [rows] });
      return this;
    }

    select(columns: string) {
      calls.push({ method: "select", args: [columns] });
      return this;
    }

    then<TResult1 = DouyinMiniappMarketingDatabaseResult, TResult2 = never>(
      onfulfilled?: (
        (value: DouyinMiniappMarketingDatabaseResult) => TResult1 | PromiseLike<TResult1>
      ) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      const result = results[index++] ?? { data: null, error: null };
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }

  const client: DouyinMiniappMarketingDatabaseClient = {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query();
    }),
    rpc: mock((name: string, args: Record<string, unknown>) => {
      calls.push({ method: "rpc", args: [name, args] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }),
  };

  return { client, calls };
}

const leadInput = {
  installationId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  phone: "13800000000",
  name: "李先生",
  community: "示例花园",
  preferredVisitDate: "2026-07-20",
  preferredVisitPeriod: "afternoon" as const,
  budgetEstimateId: "88888888-8888-4888-8888-888888888888",
  demand: "旧房改造",
  smsCode: "123456",
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
  subjectHash: "b".repeat(64),
  requestIp: "192.0.2.10",
  userAgent: "Douyin Miniapp",
  privacyPolicyVersion: "2026-07-19",
  consentedAt: "2026-07-19T10:00:00.000Z",
  attribution: {
    source_type: "short_video",
    entry_path: "pages/home/index",
    scene: "021036",
    campaign_code: "summer",
    content_id: "video-1",
  },
};

const leadResult = {
  lead_id: "44444444-4444-4444-8444-444444444444",
  appointment_id: "55555555-5555-4555-8555-555555555555",
  appointment_no: "DYLF-20260719-000001",
  status: "pending_confirmation",
  already_submitted: false,
  updated_existing: false,
  existing_customer_linked: false,
  recent_pending_appointment_exists: false,
} as const;

describe("DouyinMiniappMarketingRepository.submitMeasurementAppointment", () => {
  test("calls the appointment RPC once with the exact server-owned parameters", async () => {
    const { client, calls } = createClient([{ data: { data: leadResult }, error: null }]);
    const repository = new DouyinMiniappMarketingRepository(client);

    await expect(repository.submitMeasurementAppointment(leadInput)).resolves.toEqual(leadResult);

    expect(calls).toEqual([{
      method: "rpc",
      args: ["submit_douyin_measurement_appointment", {
        p_douyin_miniapp_installation_id: leadInput.installationId,
        p_tenant_id: leadInput.tenantId,
        p_phone: leadInput.phone,
        p_name: leadInput.name,
        p_community: leadInput.community,
        p_preferred_visit_date: leadInput.preferredVisitDate,
        p_preferred_visit_period: leadInput.preferredVisitPeriod,
        p_budget_estimate_id: leadInput.budgetEstimateId,
        p_demand: leadInput.demand,
        p_sms_code: leadInput.smsCode,
        p_idempotency_key: leadInput.idempotencyKey,
        p_subject_hash: leadInput.subjectHash,
        p_request_ip: leadInput.requestIp,
        p_user_agent: leadInput.userAgent,
        p_privacy_policy_version: leadInput.privacyPolicyVersion,
        p_consented_at: leadInput.consentedAt,
        p_attribution: leadInput.attribution,
      }],
    }]);
  });

  test("requires one strict appointment result envelope", async () => {
    const invalidResults = [
      null,
      leadResult,
      { data: { ...leadResult, lead_id: "not-a-uuid" } },
      { data: { ...leadResult, status: "confirmed" } },
      { data: { ...leadResult, appointment_no: "bad" } },
      { data: { ...leadResult, already_submitted: "false" } },
      { data: { ...leadResult, extra: "unexpected" } },
      { data: leadResult, extra: "unexpected" },
      { error: { status_code: 400, code: "UNKNOWN_COMMAND_ERROR" } },
      { error: { status_code: 500, code: "DOUYIN_MEASUREMENT_SMS_INVALID" } },
    ];

    for (const data of invalidResults) {
      const { client } = createClient([{ data, error: null }]);
      await expect(new DouyinMiniappMarketingRepository(client)
        .submitMeasurementAppointment(leadInput))
        .rejects.toMatchObject({
          statusCode: 500,
          code: "DOUYIN_MARKETING_REPOSITORY_RESPONSE_INVALID",
        });
    }
  });

  test("preserves replay and lead/customer duplicate flags from the command", async () => {
    const replay = {
      ...leadResult,
      already_submitted: true,
      updated_existing: true,
      existing_customer_linked: true,
      recent_pending_appointment_exists: true,
    };
    const { client } = createClient([{ data: { data: replay }, error: null }]);

    await expect(new DouyinMiniappMarketingRepository(client)
      .submitMeasurementAppointment(leadInput)).resolves.toEqual(replay);
  });

  test("maps known SQL markers to stable safe business errors", async () => {
    const markers = [
      ["DOUYIN_MEASUREMENT_COMMAND_INVALID", 400],
      ["DOUYIN_MEASUREMENT_ATTRIBUTION_INVALID", 400],
      ["DOUYIN_MEASUREMENT_INSTALLATION_UNSUPPORTED", 409],
      ["DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH", 409],
      ["DOUYIN_MEASUREMENT_IDEMPOTENCY_CONFLICT", 409],
      ["DOUYIN_MEASUREMENT_SMS_INVALID", 400],
      ["DOUYIN_MEASUREMENT_SMS_EXPIRED", 400],
      ["DOUYIN_MEASUREMENT_ESTIMATE_NOT_FOUND", 404],
      ["DOUYIN_MEASUREMENT_SNAPSHOT_TOO_LARGE", 400],
      ["DOUYIN_MEASUREMENT_NUMBER_EXHAUSTED", 409],
      ["DOUYIN_MEASUREMENT_SMS_CONSUME_CONFLICT", 409],
      ["DOUYIN_MEASUREMENT_VISIT_DATE_INVALID", 400],
    ] as const;

    for (const [marker, statusCode] of markers) {
      const sensitive = `postgres detail phone=13800000000 ${marker}`;
      const { client } = createClient([{
        error: null,
        data: { error: { status_code: statusCode, code: marker } },
      }]);
      let caught: unknown;
      try {
        await new DouyinMiniappMarketingRepository(client)
          .submitMeasurementAppointment(leadInput);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ statusCode, code: marker });
      expect(JSON.stringify(caught)).not.toContain(sensitive);
      expect(JSON.stringify(caught)).not.toContain(leadInput.phone);
    }
  });

  test("wraps unknown and rejected database failures without PostgreSQL text", async () => {
    const sensitive = "duplicate key phone=13800000000";
    for (const message of [sensitive, "DOUYIN_MEASUREMENT_SMS_INVALID: extra", "toString"]) {
      const unknown = createClient([{
        data: null,
        error: { code: "23505", message, details: sensitive },
      }]);
      let caught: unknown;
      try {
        await new DouyinMiniappMarketingRepository(unknown.client)
          .submitMeasurementAppointment(leadInput);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ statusCode: 500, code: "DB_ERROR" });
      expect(JSON.stringify(caught)).not.toContain(sensitive);
    }

    const rejectedClient: DouyinMiniappMarketingDatabaseClient = {
      from: () => { throw new TypeError(sensitive); },
      rpc: () => Promise.reject(new TypeError(sensitive)),
    };
    let caught: unknown;
    try {
      await new DouyinMiniappMarketingRepository(rejectedClient)
        .submitMeasurementAppointment(leadInput);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    expect(JSON.stringify(caught)).not.toContain(sensitive);

    const synchronousClient: DouyinMiniappMarketingDatabaseClient = {
      from: () => { throw new TypeError(sensitive); },
      rpc: () => { throw new TypeError(sensitive); },
    };
    await expect(new DouyinMiniappMarketingRepository(synchronousClient)
      .submitMeasurementAppointment(leadInput)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });
});

describe("DouyinMiniappMarketingRepository.insertEvents", () => {
  const eventContext = {
    tenantId: leadInput.tenantId,
    installationId: leadInput.installationId,
    subjectHash: leadInput.subjectHash,
    requestIp: leadInput.requestIp,
    userAgent: leadInput.userAgent,
    events: [
      {
        eventName: "app_launch" as const,
        occurredAt: "2026-07-19T10:00:01.000Z",
        attribution: { entry_path: "pages/home/index", scene: "021036" },
        entityId: null,
      },
      {
        eventName: "case_view" as const,
        occurredAt: "2026-07-19T10:00:02.000Z",
        attribution: { source_type: "search", content_id: "case-1" },
        entityId: "55555555-5555-4555-8555-555555555555",
        payload: { arbitrary: "must-not-persist" },
      },
    ],
  };

  test("performs one bounded batch insert with only fixed safe fields", async () => {
    const inserted = [
      { id: "66666666-6666-4666-8666-666666666666",
        event_name: "app_launch" as const, created_at: "2026-07-19T10:00:03.000Z" },
      { id: "77777777-7777-4777-8777-777777777777",
        event_name: "case_view" as const, created_at: "2026-07-19T10:00:03.001Z" },
    ];
    const { client, calls } = createClient([{ data: inserted, error: null }]);
    const repository = new DouyinMiniappMarketingRepository(client);

    await expect(repository.insertEvents(eventContext)).resolves.toEqual(inserted);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({ method: "from", args: ["marketing_events"] });
    expect(calls[1]).toEqual({ method: "insert", args: [[
      {
        tenant_id: eventContext.tenantId,
        douyin_miniapp_installation_id: eventContext.installationId,
        source: "douyin_miniapp",
        subject_hash: eventContext.subjectHash,
        event_name: "app_launch",
        payload: {
          entry_path: "pages/home/index",
          scene: "021036",
          occurred_at: eventContext.events[0]!.occurredAt,
        },
        request_ip: eventContext.requestIp,
        user_agent: eventContext.userAgent,
      },
      {
        tenant_id: eventContext.tenantId,
        douyin_miniapp_installation_id: eventContext.installationId,
        source: "douyin_miniapp",
        subject_hash: eventContext.subjectHash,
        event_name: "case_view",
        payload: {
          source_type: "search",
          content_id: "case-1",
          entity_id: eventContext.events[1]!.entityId,
          occurred_at: eventContext.events[1]!.occurredAt,
        },
        request_ip: eventContext.requestIp,
        user_agent: eventContext.userAgent,
      },
    ]] });
    expect(calls[2]).toEqual({ method: "select", args: ["id,event_name,created_at"] });
    expect(JSON.stringify(calls)).not.toContain("must-not-persist");
  });

  test("rejects empty and over-20 batches before database access", async () => {
    for (const events of [[], Array.from({ length: 21 }, () => eventContext.events[0]!)]) {
      const { client, calls } = createClient([]);
      await expect(new DouyinMiniappMarketingRepository(client).insertEvents({
        ...eventContext,
        events,
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "DOUYIN_MARKETING_EVENT_BATCH_INVALID",
      });
      expect(calls).toHaveLength(0);
    }
  });

  test("validates the selected insert rows and safely wraps database errors", async () => {
    const invalid = createClient([{ data: [{ id: "bad" }], error: null }]);
    await expect(new DouyinMiniappMarketingRepository(invalid.client).insertEvents({
      ...eventContext,
      events: [eventContext.events[0]!],
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DOUYIN_MARKETING_REPOSITORY_RESPONSE_INVALID",
    });

    const sensitive = "marketing_events constraint payload secret";
    const failed = createClient([{ data: null, error: { message: sensitive } }]);
    let caught: unknown;
    try {
      await new DouyinMiniappMarketingRepository(failed.client).insertEvents({
        ...eventContext,
        events: [eventContext.events[0]!],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    expect(JSON.stringify(caught)).not.toContain(sensitive);
  });
});
