import { beforeAll, describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./tenant-douyin-leads")
  .TenantDouyinLeadsRepository;

beforeAll(async () => {
  ({ TenantDouyinLeadsRepository: Repository } = await import(
    "./tenant-douyin-leads"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const IDEMPOTENCY_KEY = "66666666-6666-4666-8666-666666666666";

class RejectedQuery implements PromiseLike<never> {
  constructor(private readonly error: Error) {}
  select() { return this; }
  eq() { return this; }
  gte() { return this; }
  lt() { return this; }
  lte() { return this; }
  or() { return this; }
  in() { return this; }
  order() { return this; }
  range() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.reject(this.error); }
  then<TResult1 = never, TResult2 = never>(
    onfulfilled?: ((value: never) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.reject(this.error).then(onfulfilled, onrejected);
  }
}

describe("TenantDouyinLeadsRepository database failures", () => {
  test("accepts the stable assignee scope conflict envelope", async () => {
    const repository = new Repository({
      from: mock(() => new RejectedQuery(new Error())),
      rpc: mock(async () => ({ data: { error: { status_code: 409,
        code: "DOUYIN_LEAD_ASSIGNEE_SCOPE_CONFLICT" } }, error: null })),
    } as never);
    await expect(repository.assign(assignInput())).resolves.toEqual({
      ok: false,
      error: { status_code: 409, code: "DOUYIN_LEAD_ASSIGNEE_SCOPE_CONFLICT" },
    });
  });

  test("sanitizes synchronous throws and promise rejections for query and RPC", async () => {
    const failures = [
      {
        secret: "sync-query-secret", message: "查询抖音线索失败",
        run: () => new Repository({
          from: mock(() => { throw new Error("sync-query-secret"); }),
          rpc: mock(async () => ({ data: null, error: null })),
        } as never).listLeads({ tenantId: TENANT_ID, page: 1, pageSize: 20,
          visibleAssigneeIds: null }),
      },
      {
        secret: "async-query-secret", message: "查询抖音线索失败",
        run: () => new Repository({
          from: mock(() => new RejectedQuery(new Error("async-query-secret"))),
          rpc: mock(async () => ({ data: null, error: null })),
        } as never).listLeads({ tenantId: TENANT_ID, page: 1, pageSize: 20,
          visibleAssigneeIds: null }),
      },
      {
        secret: "sync-rpc-secret", message: "执行抖音线索命令失败",
        run: () => new Repository({ from: mock(() => new RejectedQuery(new Error())),
          rpc: mock(() => { throw new Error("sync-rpc-secret"); }) } as never)
          .assign(assignInput()),
      },
      {
        secret: "async-rpc-secret", message: "执行抖音线索命令失败",
        run: () => new Repository({ from: mock(() => new RejectedQuery(new Error())),
          rpc: mock(() => Promise.reject(new Error("async-rpc-secret"))) } as never)
          .assign(assignInput()),
      },
      {
        secret: "sync-query-app-error", message: "查询抖音线索失败",
        run: () => new Repository({
          from: mock(() => { throw rawAppError("sync-query-app-error"); }),
          rpc: mock(async () => ({ data: null, error: null })),
        } as never).listLeads({ tenantId: TENANT_ID, page: 1, pageSize: 20,
          visibleAssigneeIds: null }),
      },
      {
        secret: "async-query-app-error", message: "查询抖音线索失败",
        run: () => new Repository({
          from: mock(() => new RejectedQuery(rawAppError("async-query-app-error"))),
          rpc: mock(async () => ({ data: null, error: null })),
        } as never).listLeads({ tenantId: TENANT_ID, page: 1, pageSize: 20,
          visibleAssigneeIds: null }),
      },
      {
        secret: "sync-rpc-app-error", message: "执行抖音线索命令失败",
        run: () => new Repository({ from: mock(() => new RejectedQuery(new Error())),
          rpc: mock(() => { throw rawAppError("sync-rpc-app-error"); }) } as never)
          .assign(assignInput()),
      },
      {
        secret: "async-rpc-app-error", message: "执行抖音线索命令失败",
        run: () => new Repository({ from: mock(() => new RejectedQuery(new Error())),
          rpc: mock(() => Promise.reject(rawAppError("async-rpc-app-error"))) } as never)
          .assign(assignInput()),
      },
    ];

    for (const failure of failures) {
      const error = await failure.run().catch((caught) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 500, code: "DB_ERROR",
        message: failure.message, details: undefined });
      expect(String(error)).not.toContain(failure.secret);
    }
  });
});

function assignInput() {
  return { tenantId: TENANT_ID, leadId: LEAD_ID,
    actorEmployeeId: EMPLOYEE_ID, assignedEmployeeId: EMPLOYEE_ID,
    expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
    expectedAssigneeDepartmentId: null };
}

function rawAppError(secret: string) {
  return new AppError(418, secret, "RAW_CODE", { raw: secret });
}
