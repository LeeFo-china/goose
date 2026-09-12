import { beforeAll, describe, expect, test } from "bun:test";
import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type ServiceConstructor = typeof import("./quota").CustomerRenderingQuotaService;
let Service: ServiceConstructor;

beforeAll(async () => {
  ({ CustomerRenderingQuotaService: Service } = await import("./quota"));
});

type TestActor = {
  tenantId: string;
  channel: "wechat" | "douyin";
  subject: string;
  applicationId: string | null;
  installationId: string | null;
  verifiedPhone: string | null;
};

const actor: TestActor = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  channel: "wechat" as const,
  subject: "wx-openid-sensitive",
  applicationId: null,
  installationId: null,
  verifiedPhone: null as string | null,
};
const subjectDigest = { keyVersion: 2, digest: "a".repeat(64) };
const phoneDigest = { keyVersion: 2, digest: "b".repeat(64) };

type TestLedger<D extends "ok" | "bound" | "existing"> = {
  decision: D;
  account_id: string | null;
  phone_verified: boolean;
  consumed: number;
  reserved: number;
  active_job_id: string | null;
  reservation_status: "reserved" | "consumed" | "released" | null;
};

function ledger<D extends "ok" | "bound" | "existing">(decision: D): TestLedger<D> {
  return {
    decision,
    account_id: "22222222-2222-4222-8222-222222222222",
    phone_verified: false,
    consumed: 0,
    reserved: 0,
    active_job_id: null,
    reservation_status: null,
  };
}

function createHarness(options: {
  resolvedActor?: TestActor;
  readResult?: TestLedger<"ok">;
  bindResult?: TestLedger<"bound" | "existing"> | { decision: "idempotency_conflict" };
} = {}) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const resolvedActor = options.resolvedActor ?? actor;
  const service = new Service({
    contextService: {
      async resolveWechat() { calls.push({ operation: "resolveWechat" }); return resolvedActor; },
      async resolveDouyin() { calls.push({ operation: "resolveDouyin" }); return resolvedActor; },
    },
    digestService: {
      subject(input) { calls.push({ operation: "subjectDigest", input }); return subjectDigest; },
      phone(input) { calls.push({ operation: "phoneDigest", input }); return phoneDigest; },
    },
    quotaRepository: {
      async read(input) { calls.push({ operation: "read", input }); return options.readResult ?? ledger("ok"); },
      async bindPhone(input) {
        calls.push({ operation: "bindPhone", input });
        return options.bindResult ?? ledger("bound");
      },
    },
  });
  return { service, calls };
}

describe("customer rendering quota service", () => {
  test("reads and projects an unverified WeChat actor without creating an account", async () => {
    const { service, calls } = createHarness({
      readResult: {
        ...ledger("ok"),
        account_id: null,
        consumed: 1,
      },
    });

    const result = await service.getQuota(undefined, "wechat");

    expect(result).toEqual({
      trial_used: true,
      phone_verified: false,
      consumed: 1,
      reserved: 0,
      remaining: 0,
      active_job_id: null,
      can_generate: false,
      blocked_reason: "phone_required",
    });
    expect(calls.map((call) => call.operation)).toEqual([
      "resolveWechat",
      "subjectDigest",
      "read",
    ]);
    expect(calls.find((call) => call.operation === "read")?.input).toMatchObject({
      phoneKeyVersion: null,
      phoneDigest: null,
    });
  });

  test("synchronizes a verified Douyin identity before returning cross-channel quota", async () => {
    const douyinActor = {
      ...actor,
      channel: "douyin" as const,
      subject: "c".repeat(64),
      applicationId: "tt-app",
      installationId: "33333333-3333-4333-8333-333333333333",
      verifiedPhone: "138 0000 0000",
    };
    const { service, calls } = createHarness({
      resolvedActor: douyinActor,
      bindResult: {
        ...ledger("existing"),
        phone_verified: true,
        consumed: 2,
      },
    });

    const result = await service.getQuota(undefined, "douyin");

    expect(result.phone_verified).toBe(true);
    expect(result.remaining).toBe(3);
    expect(calls.map((call) => call.operation)).toEqual([
      "resolveDouyin",
      "subjectDigest",
      "phoneDigest",
      "bindPhone",
    ]);
    const serialized = JSON.stringify(calls.find((call) => call.operation === "bindPhone")?.input);
    expect(serialized).not.toContain("138");
    expect(serialized).not.toContain(douyinActor.subject);
    expect(serialized).toContain(phoneDigest.digest);
  });

  test("requires a signed verified phone for explicit binding", async () => {
    const { service } = createHarness();

    try {
      await service.bindPhone(undefined, "wechat", {
        idempotency_key: "44444444-4444-4444-8444-444444444444",
      });
      throw new Error("expected bindPhone to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
      expect((error as AppError).code).toBe("RENDERING_PHONE_REQUIRED");
    }
  });

  test("uses stable opaque hashes for an explicit phone bind", async () => {
    const verifiedActor = { ...actor, verifiedPhone: "+86 138-0000-0000" };
    const first = createHarness({ resolvedActor: verifiedActor });
    const second = createHarness({ resolvedActor: verifiedActor });
    const command = { idempotency_key: "44444444-4444-4444-8444-444444444444" };

    await first.service.bindPhone(undefined, "wechat", command);
    await second.service.bindPhone(undefined, "wechat", command);

    const firstInput = first.calls.find((call) => call.operation === "bindPhone")?.input as Record<string, unknown>;
    const secondInput = second.calls.find((call) => call.operation === "bindPhone")?.input as Record<string, unknown>;
    expect(firstInput.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(firstInput.requestHash).toBe(secondInput.requestHash);
    expect(firstInput).toMatchObject({
      subjectDigest: subjectDigest.digest,
      phoneDigest: phoneDigest.digest,
      idempotencyKey: command.idempotency_key,
    });
    expect(JSON.stringify(firstInput)).not.toContain(verifiedActor.verifiedPhone);
    expect(JSON.stringify(firstInput)).not.toContain(actor.subject);
  });

  test("maps an idempotency conflict to a stable public error", async () => {
    const { service } = createHarness({
      resolvedActor: { ...actor, verifiedPhone: "13800000000" },
      bindResult: { decision: "idempotency_conflict" },
    });

    try {
      await service.bindPhone(undefined, "wechat", {
        idempotency_key: "44444444-4444-4444-8444-444444444444",
      });
      throw new Error("expected bindPhone to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
      expect((error as AppError).code).toBe("RENDERING_IDEMPOTENCY_CONFLICT");
      expect((error as AppError).details).toBeUndefined();
    }
  });
});
