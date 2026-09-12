import { beforeAll, describe, expect, test } from "bun:test";
import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
type RepositoryConstructor = typeof import("@/repositories/customer-rendering-quota").CustomerRenderingQuotaRepository;
let Repository: RepositoryConstructor;

beforeAll(async () => {
  ({ CustomerRenderingQuotaRepository: Repository } =
    await import("@/repositories/customer-rendering-quota"));
});

const tenantId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const digest = "a".repeat(64);
const phoneDigest = "b".repeat(64);
const requestHash = "c".repeat(64);

function snapshot(decision: string) {
  return {
    decision,
    account_id: "55555555-5555-4555-8555-555555555555",
    phone_verified: true,
    consumed: 1,
    reserved: 0,
    active_job_id: null,
    reservation_status: null,
  };
}

function createHarness(result: { data: unknown; error: unknown } = {
  data: snapshot("ok"),
  error: null,
}) {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client: RpcClient = {
    async rpc(name, params) {
      calls.push({ name, params });
      return result;
    },
  };
  return { repository: new Repository(client), calls };
}

const identity = {
  tenantId,
  channel: "douyin" as const,
  subjectKeyVersion: 1,
  subjectDigest: digest,
  applicationId: "tt-app",
  installationId,
};

describe("customer rendering quota repository", () => {
  test("reads a quota snapshot with an optional verified phone digest", async () => {
    const { repository, calls } = createHarness();

    const result = await repository.read({
      ...identity,
      phoneKeyVersion: 1,
      phoneDigest,
    });

    expect(result.decision).toBe("ok");
    expect(calls).toEqual([{
      name: "get_customer_rendering_quota",
      params: {
        p_tenant_id: tenantId,
        p_channel: "douyin",
        p_subject_key_version: 1,
        p_subject_digest: digest,
        p_phone_key_version: 1,
        p_phone_digest: phoneDigest,
      },
    }]);
  });

  test("binds a verified phone through the idempotent RPC", async () => {
    const { repository, calls } = createHarness({
      data: snapshot("bound"),
      error: null,
    });

    const result = await repository.bindPhone({
      ...identity,
      phoneKeyVersion: 1,
      phoneDigest,
      idempotencyKey,
      requestHash,
    });

    expect(result.decision).toBe("bound");
    expect(calls[0]).toEqual({
      name: "bind_customer_rendering_phone",
      params: {
        p_tenant_id: tenantId,
        p_channel: "douyin",
        p_subject_key_version: 1,
        p_subject_digest: digest,
        p_application_id: "tt-app",
        p_installation_id: installationId,
        p_phone_key_version: 1,
        p_phone_digest: phoneDigest,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
      },
    });
  });

  test("reserves and settles one job with exact RPC parameters", async () => {
    const reserveHarness = createHarness({
      data: { ...snapshot("reserved"), reserved: 1, active_job_id: jobId, reservation_status: "reserved" },
      error: null,
    });
    const reserveResult = await reserveHarness.repository.reserve({
      ...identity,
      phoneKeyVersion: null,
      phoneDigest: null,
      jobId,
      idempotencyKey,
      requestHash,
    });
    expect(reserveResult.decision).toBe("reserved");
    expect(reserveHarness.calls[0]?.name).toBe("reserve_customer_rendering_quota");
    expect(reserveHarness.calls[0]?.params).toMatchObject({
      p_job_id: jobId,
      p_idempotency_key: idempotencyKey,
      p_phone_key_version: null,
      p_phone_digest: null,
    });

    const settleHarness = createHarness({
      data: { ...snapshot("consume"), consumed: 2, reservation_status: "consumed" },
      error: null,
    });
    const settleResult = await settleHarness.repository.settle({ tenantId, jobId, outcome: "consume" });
    expect(settleResult.decision).toBe("consume");
    expect(settleHarness.calls).toEqual([{
      name: "settle_customer_rendering_quota",
      params: { p_tenant_id: tenantId, p_job_id: jobId, p_outcome: "consume" },
    }]);
  });

  test("accepts decision-only conflict results but rejects malformed payloads", async () => {
    const conflict = createHarness({ data: { decision: "idempotency_conflict" }, error: null });
    expect((await conflict.repository.bindPhone({
      ...identity,
      phoneKeyVersion: 1,
      phoneDigest,
      idempotencyKey,
      requestHash,
    })).decision).toBe("idempotency_conflict");

    const malformed = createHarness({ data: { ...snapshot("ok"), leaked_phone: "13800000000" }, error: null });
    try {
      await malformed.repository.read({ ...identity, phoneKeyVersion: null, phoneDigest: null });
      throw new Error("expected malformed payload to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details).toBeUndefined();
    }
  });

  test("wraps RPC failures with the shared database error", async () => {
    const { repository } = createHarness({ data: null, error: { message: "database unavailable" } });
    try {
      await repository.read({ ...identity, phoneKeyVersion: null, phoneDigest: null });
      throw new Error("expected repository.read to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(500);
      expect((error as AppError).message).toBe("读取客户生图额度失败");
      expect((error as AppError).details).toBeUndefined();
    }
  });
});
