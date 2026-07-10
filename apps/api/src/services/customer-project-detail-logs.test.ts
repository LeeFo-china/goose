import { describe, expect, mock, test } from "bun:test";
import { CustomerProjectDetailLogsService } from "./customer-project-detail-logs";

describe("CustomerProjectDetailLogsService", () => {
  test("forwards the request abort signal to the repository", async () => {
    const listLogs = mock(async () => []);
    const service = new CustomerProjectDetailLogsService({ listLogs });
    const signal = new AbortController().signal;

    await service.listLogs({
      tenantId: "tenant-1",
      customerId: "customer-1",
      projectId: "project-1",
      pageSize: 10,
      signal,
    });

    expect(listLogs).toHaveBeenCalledWith(expect.objectContaining({ signal }));
  });
});
