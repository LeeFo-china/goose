import { afterEach, expect, mock, spyOn, test } from "bun:test";
import Fastify from "fastify";
import { registerRoutes } from "@/utils/decorators/route";
import type { AuthContext } from "@/services/authorization";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
afterEach(() => mock.restore());
test("tenant channel routes validate pages and register read/write service boundaries", async () => {
  const { default: controller } = await import("./index");
  const { tenantDeviceService } = await import("@/services/tenant-devices");
  const authContext = { tenantId: "tenant", employeeId: "employee" } as AuthContext;
  spyOn(controller as unknown as { getRequiredTenantContext(): Promise<AuthContext> }, "getRequiredTenantContext")
    .mockResolvedValue(authContext);
  const sync = spyOn(tenantDeviceService, "syncTenantDevicePage").mockResolvedValue({
    synced_count: 0, device_id: "cloud", sync: { page: 1, pageSize: 20, total: 0,
      has_more: false, next_page: null, state: "waiting_for_device" },
  });
  const list = spyOn(tenantDeviceService, "listTenantDeviceChannels").mockResolvedValue({
    list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const app = Fastify();
  const boundaries: unknown[] = [];
  app.addHook("onRequest", async request => { boundaries.push(request.routeOptions.config.tenantServiceAccess); });
  registerRoutes(app, controller);
  const id = "00000000-0000-4000-8000-000000000001";
  try {
    expect((await app.inject({ method: "POST", url: `/tenant-devices/${id}/sync` })).json().data.sync.state).toBe("waiting_for_device");
    expect((await app.inject({ method: "GET", url: `/tenant-devices/${id}/channels` })).statusCode).toBe(200);
    expect(boundaries.slice(0,2)).toEqual(["write", "read"]);
    expect(sync).toHaveBeenCalledWith({ authContext, id, query: { page: 1, pageSize: 20 } });
    expect(list).toHaveBeenCalledWith({ authContext, id, query: { page: 1, pageSize: 20 } });
    sync.mockClear(); list.mockClear();
    for (const item of [{ method: "POST" as const, path: `${id}/sync?pageSize=51` },
      { method: "GET" as const, path: `${id}/channels?pageSize=101` },
      { method: "POST" as const, path: "invalid/sync" },
      { method: "GET" as const, path: `${id}/channels?page=0` }]) {
      expect((await app.inject({ method: item.method, url: `/tenant-devices/${item.path}` })).statusCode).toBe(400);
    }
    expect(sync).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
