import { describe, expect, mock, test } from "bun:test";
import { CustomerProjectDetailService } from "./customer-project-detail";

const project = (id = "project-1") => ({
  id,
  tenant_id: "tenant-1",
  name: "测试项目",
  status: "constructing",
  budget: null,
  address: null,
  property_id: null,
  start_date: null,
  style_tags: [],
  designer: null,
  property: null,
});

function createService(options: { detailCacheTtlMs?: number } = {}) {
  const findOwnedProject = mock(
    async (): Promise<ReturnType<typeof project> | null> => project(),
  );
  const repository = {
    findOwnedProject,
    findOwnedProjectAccess: mock(async () => ({
      id: "project-1",
      tenant_id: "tenant-1",
    })),
  };
  return {
    repository,
    service: new CustomerProjectDetailService({
      repository,
      detailCacheTtlMs: options.detailCacheTtlMs,
    }),
  };
}

const input = {
  tenantId: "tenant-1",
  customerId: "customer-1",
  projectId: "project-1",
};

describe("CustomerProjectDetailService", () => {
  test("deduplicates concurrent owned project reads", async () => {
    const { repository, service } = createService();
    let release: ((value: ReturnType<typeof project>) => void) | undefined;
    repository.findOwnedProject.mockImplementation(() =>
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const firstPromise = service.getOwnedProject(input);
    const secondPromise = service.getOwnedProject(input);
    await Promise.resolve();
    release?.(project());
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(repository.findOwnedProject).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  test("reuses a successful detail until its ttl expires", async () => {
    const { repository, service } = createService({ detailCacheTtlMs: 5 });

    const first = await service.getOwnedProject(input);
    const cached = await service.getOwnedProject(input);
    await Bun.sleep(10);
    const refreshed = await service.getOwnedProject(input);

    expect(cached).toBe(first);
    expect(refreshed).not.toBe(first);
    expect(repository.findOwnedProject).toHaveBeenCalledTimes(2);
  });

  test("isolates tenant customer and project cache keys", async () => {
    const { repository, service } = createService();

    await service.getOwnedProject(input);
    await service.getOwnedProject({ ...input, tenantId: "tenant-2" });
    await service.getOwnedProject({ ...input, customerId: "customer-2" });
    await service.getOwnedProject({ ...input, projectId: "project-2" });

    expect(repository.findOwnedProject).toHaveBeenCalledTimes(4);
  });

  test("does not cache a missing project", async () => {
    const { repository, service } = createService();
    repository.findOwnedProject.mockResolvedValue(null);

    await expect(service.getOwnedProject(input)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.getOwnedProject(input)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(repository.findOwnedProject).toHaveBeenCalledTimes(2);
  });

  test("retries after a repository failure", async () => {
    const { repository, service } = createService();
    repository.findOwnedProject.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.getOwnedProject(input)).rejects.toThrow("database unavailable");
    const retried = await service.getOwnedProject(input);

    expect(retried.id).toBe("project-1");
    expect(repository.findOwnedProject).toHaveBeenCalledTimes(2);
  });

  test("warms the lightweight access cache after loading detail", async () => {
    const { repository, service } = createService();

    await service.getOwnedProject(input);
    const access = await service.getOwnedProjectAccess(input);

    expect(access.id).toBe("project-1");
    expect(repository.findOwnedProjectAccess).not.toHaveBeenCalled();
  });
});
