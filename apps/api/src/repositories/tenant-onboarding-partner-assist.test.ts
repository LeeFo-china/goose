import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PARTNER_ID = "00000000-0000-4000-8000-000000000201";
const CUTOFF = "2026-07-14T12:00:00.000Z";

describe("TenantOnboardingPartnerAssistRepository", () => {
  test("builds the partner queue filter with an ISO cutoff through Supabase/PostgREST", async () => {
    const urls: URL[] = [];
    const fetchStub = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      urls.push(url);
      return new Response(JSON.stringify([taskRow]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-range": "0-0/1",
        },
      });
    }) as typeof fetch;
    const supabase = createClient("http://127.0.0.1:54321", "test-key", {
      global: { fetch: fetchStub },
    });
    const { TenantOnboardingPartnerAssistRepository } = await import(
      "./tenant-onboarding-partner-assist"
    );
    const repository = new TenantOnboardingPartnerAssistRepository(
      () => supabase as never,
    );

    const result = await repository.listPartnerAssistTasks({
      partnerId: PARTNER_ID,
      page: 1,
      pageSize: 20,
      cutoff: CUTOFF,
      status: "pending",
    });

    expect(result.list).toHaveLength(1);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.searchParams.get("candidate_partner_id")).toBe(`eq.${PARTNER_ID}`);
    expect(urls[0]?.searchParams.getAll("partner_assist_status")).toEqual([
      "neq.not_applicable",
      "eq.pending",
    ]);
    expect(urls[0]?.searchParams.get("or")).toBe(
      `(partner_assist_status.neq.pending,partner_assist_due_at.gt.${CUTOFF})`,
    );
  });
});

const taskRow = {
  id: "00000000-0000-4000-8000-000000000501",
  company_name: "信阳安心装饰有限公司",
  admin_phone: "13912349000",
  address_city: "信阳市",
  address_district: "浉河区",
  service_region_codes: ["411502"],
  partner_assist_status: "pending",
  partner_assist_requested_at: "2026-07-12T12:00:00.000Z",
  partner_assist_due_at: "2026-07-15T12:00:00.000Z",
  version: 3,
  created_at: "2026-07-12T11:00:00.000Z",
  updated_at: "2026-07-12T12:00:00.000Z",
};
