import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { SupabaseDB } from "@/utils/supabase";
import { ProjectLogProjectCommentsRepository } from "./project-log-project-comments";

const payload = {
  tenant_id: "tenant-1", log_id: "log-1", parent_id: null,
  author_type: "customer" as const, employee_author_id: null, customer_author_id: "customer-1",
  content: "项目沟通", moderation_status: "approved" as const,
  moderation_trace_id: "trace", moderated_at: "2026-10-10T00:00:00Z", content_sha256: "a".repeat(64),
};
const row = {
  id: "comment-1", log_id: payload.log_id, parent_id: payload.parent_id,
  author_type: payload.author_type, employee_author_id: payload.employee_author_id,
  customer_author_id: payload.customer_author_id, content: payload.content,
  moderation_status: payload.moderation_status, created_at: "2026-10-10T00:00:00Z",
};
const repository = new ProjectLogProjectCommentsRepository();
const restorers: Array<() => void> = [];
afterEach(() => restorers.splice(0).forEach((restore) => restore()));

function stubDatabase(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const client = createClient("http://127.0.0.1:1", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      requests.push(request);
      return respond(request);
    }, { preconnect: () => undefined }) },
  });
  const getter = spyOn(SupabaseDB, "getAdminClient").mockReturnValue(client);
  restorers.push(() => getter.mockRestore());
  return requests;
}

describe("ProjectLogProjectCommentsRepository", () => {
  test("findLog returns the nullable tenant and project using a scoped singular lookup", async () => {
    const log = { id: "log-1", tenant_id: null, project_id: "project-1" };
    const requests = stubDatabase(() => Response.json(log));
    expect(await repository.findLog("log-1")).toEqual(log);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toEndWith("/project_logs");
    expect(url.searchParams.get("select")).toBe("id,tenant_id,project_id");
    expect(url.searchParams.get("id")).toBe("eq.log-1");
  });

  test("findLog and findApprovedParent return null for missing rows", async () => {
    stubDatabase(() => Response.json([]));
    expect(await repository.findLog("missing")).toBeNull();
    expect(await repository.findApprovedParent({ parentId: "missing", tenantId: "t", logId: "l" })).toBeNull();
  });

  test("create preserves raw author columns and moderation metadata", async () => {
    const requests = stubDatabase(() => Response.json(row, { status: 201 }));
    expect(await repository.create(payload)).toEqual(row);
    expect(requests[0]!.method).toBe("POST");
    expect(await requests[0]!.json()).toEqual(payload);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toEndWith("/project_log_project_comments");
    const fields = url.searchParams.get("select")!.split(",");
    expect(fields).toContain("author_type");
    expect(fields).toContain("employee_author_id");
    expect(fields).toContain("customer_author_id");
    expect(fields).not.toContain("author_id");
    expect(fields).not.toContain("*");
    for (const field of ["tenant_id", "moderation_trace_id", "moderated_at", "content_sha256"]) {
      expect(fields).not.toContain(field);
    }
  });

  test("parent lookup requires approved status and matching tenant/log", async () => {
    const requests = stubDatabase(() => Response.json({ id: "parent" }));
    expect(await repository.findApprovedParent({ parentId: "parent", tenantId: "t", logId: "l" })).toEqual({ id: "parent" });
    const params = new URL(requests[0]!.url).searchParams;
    expect(params.get("select")).toBe("id");
    expect(params.get("id")).toBe("eq.parent");
    expect(params.get("tenant_id")).toBe("eq.t");
    expect(params.get("log_id")).toBe("eq.l");
    expect(params.get("moderation_status")).toBe("eq.approved");
  });

  test("approved page uses tenant/log filters, stable ordering, exact total and inclusive bounds", async () => {
    const requests = stubDatabase(() => Response.json([row], { headers: { "content-range": "20-20/42" } }));
    expect(await repository.listApproved({ tenantId: "t", logId: "l", from: 20, to: 39 })).toEqual({ list: [row], total: 42 });
    const params = new URL(requests[0]!.url).searchParams;
    expect(params.get("tenant_id")).toBe("eq.t");
    expect(params.get("log_id")).toBe("eq.l");
    expect(params.get("moderation_status")).toBe("eq.approved");
    expect(params.get("order")).toBe("created_at.asc,id.asc");
    expect(params.get("offset")).toBe("20");
    expect(params.get("limit")).toBe("20");
    expect(requests[0]!.headers.get("prefer")).toContain("count=exact");
  });

  test("invalid or over-100 page ranges fail before any query", async () => {
    const requests = stubDatabase(() => Response.json([]));
    for (const [from, to] of [[-1, 19], [20, 19], [0, 100], [0.5, 20], [0, Infinity]]) {
      await expect(repository.listApproved({ tenantId: "t", logId: "l", from: from!, to: to! }))
        .rejects.toMatchObject({ statusCode: 400 });
    }
    expect(requests).toHaveLength(0);
  });

  test("author lookup batches both types, deduplicates IDs and keeps identical IDs distinct by type", async () => {
    const requests = stubDatabase((request) => Response.json([
      { id: "shared", name: request.url.includes("/employees?") ? "员工" : null },
    ]));
    expect(await repository.listAuthors({ tenantId: "t", employeeIds: ["shared", "shared"], customerIds: ["shared"] }))
      .toEqual([{ id: "shared", name: "员工", type: "employee" }, { id: "shared", name: null, type: "customer" }]);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const params = new URL(request.url).searchParams;
      expect(params.get("select")).toBe("id,name");
      expect(params.get("tenant_id")).toBe("eq.t");
      expect(params.get("id")).toBe("in.(shared)");
      expect(params.get("limit")).toBe("100");
    }
  });

  test("empty author batches skip queries, each populated type permits up to 100 IDs", async () => {
    const requests = stubDatabase(() => Response.json([]));
    expect(await repository.listAuthors({ tenantId: "t", employeeIds: [], customerIds: [] })).toEqual([]);
    expect(requests).toHaveLength(0);
    const ids = Array.from({ length: 100 }, (_, index) => `id-${index}`);
    await repository.listAuthors({ tenantId: "t", employeeIds: ids, customerIds: ids });
    expect(requests).toHaveLength(2);
    await repository.listAuthors({ tenantId: "t", employeeIds: [], customerIds: ["c"] });
    expect(requests).toHaveLength(3);
  });

  test("oversized author batches fail instead of silently dropping names", async () => {
    const requests = stubDatabase(() => Response.json([]));
    const ids = Array.from({ length: 101 }, (_, index) => `id-${index}`);
    await expect(repository.listAuthors({ tenantId: "t", employeeIds: ids, customerIds: [] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(repository.listAuthors({ tenantId: "t", employeeIds: [], customerIds: ids })).rejects.toMatchObject({ statusCode: 400 });
    expect(requests).toHaveLength(0);
  });

  test("database failures are wrapped for every method", async () => {
    stubDatabase(() => Response.json({ message: "database failure", code: "23514" }, { status: 400 }));
    const actions = [
      () => repository.findLog("l"),
      () => repository.create(payload),
      () => repository.findApprovedParent({ parentId: "p", tenantId: "t", logId: "l" }),
      () => repository.listApproved({ tenantId: "t", logId: "l", from: 0, to: 19 }),
      () => repository.listAuthors({ tenantId: "t", employeeIds: ["e"], customerIds: [] }),
      () => repository.listAuthors({ tenantId: "t", employeeIds: [], customerIds: ["c"] }),
    ];
    for (const action of actions) await expect(action()).rejects.toMatchObject({ statusCode: 500 });
  });
});
