import { describe, expect, mock, test } from "bun:test";
import { SupabaseDB } from "@/utils/supabase";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { ProjectAcceptanceRepository } from "../legacy-repository";

const input = {
  tenantId: "tenant-1",
  customerId: "customer-1",
  projectId: "project-1",
  page: 1,
  pageSize: 20,
};

describe("customer acceptance summary RPC cancellation", () => {
  test("cancels direct SQL without fallback or permanent disablement", async () => {
    const controller = new AbortController();
    let rejectQuery: ((reason: unknown) => void) | undefined;
    const query = Object.assign(
      new Promise<never>((_resolve, reject) => { rejectQuery = reject; }),
      { cancel: mock(() => rejectQuery?.(controller.signal.reason)) },
    );
    const directSql = mock(() => query);
    const rpc = mock(() => Promise.resolve({ data: [], error: null }));
    const repository = new ProjectAcceptanceRepository({
      getDirectSql: () => directSql as unknown as NonNullable<ReturnType<typeof getDirectPostgresSql>>,
      getAdminClient: () => ({ rpc }) as unknown as ReturnType<typeof SupabaseDB.getAdminClient>,
    });

    const loaded = repository.listCustomerProjectAcceptanceSummaries({
      ...input,
      signal: controller.signal,
    });
    controller.abort("deadline");

    await expect(loaded).rejects.toBe("deadline");
    expect(query.cancel).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    await repository.listCustomerProjectAcceptanceSummaries(input).catch(() => undefined);
    expect(directSql).toHaveBeenCalledTimes(2);
  });

  test("passes the signal to the Supabase RPC fallback", async () => {
    const signal = new AbortController().signal;
    const abortSignal = mock(() => rpcQuery);
    const rpcQuery = Object.assign(
      Promise.resolve({ data: [{ project_valid: true, id: null }], error: null }),
      { abortSignal },
    );
    const rpc = mock(() => rpcQuery);
    const repository = new ProjectAcceptanceRepository({
      getDirectSql: () => null,
      getAdminClient: () => ({ rpc }) as unknown as ReturnType<typeof SupabaseDB.getAdminClient>,
    });

    await repository.listCustomerProjectAcceptanceSummaries({ ...input, signal });

    expect(abortSignal).toHaveBeenCalledWith(signal);
  });
});
