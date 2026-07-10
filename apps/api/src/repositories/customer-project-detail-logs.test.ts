import { describe, expect, mock, test } from "bun:test";
import { SupabaseDB } from "@/utils/supabase";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { CustomerProjectDetailLogsRepository } from "./customer-project-detail-logs";

const input = {
  tenantId: "tenant-1",
  customerId: "customer-1",
  projectId: "project-1",
  pageSize: 10,
};

describe("CustomerProjectDetailLogsRepository", () => {
  test("cancels direct SQL without falling back or disabling it", async () => {
    const controller = new AbortController();
    let rejectQuery: ((reason: unknown) => void) | undefined;
    const query = Object.assign(
      new Promise<never>((_resolve, reject) => { rejectQuery = reject; }),
      { cancel: mock(() => rejectQuery?.(controller.signal.reason)) },
    );
    const directSql = mock(() => query);
    const rpc = mock(() => Promise.resolve({ data: [], error: null }));
    const repository = new CustomerProjectDetailLogsRepository({
      getDirectSql: () => directSql as unknown as NonNullable<ReturnType<typeof getDirectPostgresSql>>,
      getAdminClient: () => ({ rpc }) as unknown as ReturnType<typeof SupabaseDB.getAdminClient>,
    });

    const result = repository.listLogs({ ...input, signal: controller.signal });
    controller.abort("deadline");

    await expect(result).rejects.toBe("deadline");
    expect(query.cancel).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    await repository.listLogs(input).catch(() => undefined);
    expect(directSql).toHaveBeenCalledTimes(2);
  });

  test("applies the abort signal to the Supabase RPC fallback", async () => {
    const signal = new AbortController().signal;
    const abortSignal = mock(() => rpcQuery);
    const rpcQuery = Object.assign(
      Promise.resolve({ data: [], error: null }),
      { abortSignal },
    );
    const rpc = mock(() => rpcQuery);
    const repository = new CustomerProjectDetailLogsRepository({
      getDirectSql: () => null,
      getAdminClient: () => ({ rpc }) as unknown as ReturnType<typeof SupabaseDB.getAdminClient>,
    });

    await repository.listLogs({ ...input, signal });

    expect(abortSignal).toHaveBeenCalledWith(signal);
  });
});
