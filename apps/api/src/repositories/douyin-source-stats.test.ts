import { expect, mock, test } from "bun:test";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const result = {
  window_start: "2026-09-09T00:00:00+08:00",
  window_end: "2026-09-16T00:00:00+08:00",
  first_captured_at: "2026-09-15T16:00:00+08:00",
  overview: { entries: 1, visitors: 1, page_views: 2,
    lead_clicks: 1, appointments: 1, lead_people: 1 },
  daily: [{ date: "2026-09-15", entries: 1, visitors: 1,
    page_views: 2, lead_clicks: 1, appointments: 1 }],
  source_types: [{ basis: "official_video" as const, entries: 1, visitors: 1,
    page_views: 2, lead_clicks: 1, appointments: 1 }],
  sources: { list: [{ source_key: "video:encrypted-1", basis: "official_video" as const,
    source_type: "short_video" as const, account_id: "brand_01",
    video_id: "encrypted-1", live_room_id: null, entries: 1, visitors: 1,
    page_views: 2, lead_clicks: 1, appointments: 1 }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
};

test("loads one tenant-scoped paginated aggregate and rejects raw event payloads", async () => {
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISH ??= "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  const module = await import("./douyin-source-stats").catch(() => ({
    DouyinSourceStatsRepository: undefined,
  }));
  const Repository = module.DouyinSourceStatsRepository;
  expect(Repository).toBeDefined();
  if (!Repository) return;
  const rpc = mock(async () => ({ data: result, error: null }));
  const repository = new Repository({ rpc });
  await expect(repository.load({ tenantId: TENANT_ID, days: 7,
    groupBy: "content", page: 1, pageSize: 20 })).resolves.toEqual(result);
  expect(rpc).toHaveBeenCalledWith("get_tenant_douyin_source_stats", {
    p_tenant_id: TENANT_ID, p_days: 7, p_group_by: "content",
    p_page: 1, p_page_size: 20,
  });
  rpc.mockImplementationOnce(async () => ({ data: { ...result,
    raw_subject_hash: "must-not-leak" }, error: null }));
  await expect(repository.load({ tenantId: TENANT_ID, days: 7,
    groupBy: "content", page: 1, pageSize: 20 }))
    .rejects.toMatchObject({ statusCode: 500 });
});
