import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { H5MarketingLeadsTable } from "./h5-leads-table";
import type { H5MarketingLeadRecord } from "./marketing-types";

test("legacy H5 table keeps data and links the original ID into unified handling", () => {
  const lead: H5MarketingLeadRecord = {
    id: "11111111-1111-4111-8111-111111111111", page_id: null, page_version_id: null,
    name: "活动客户", phone: null, community: null, city: null, form_data: {}, source: "h5",
    lead_status: "contacted", follow_remark: "原有摘要", followed_by: null, followed_at: null,
    wx_openid: null, customer_id: null, request_ip: null, user_agent: null,
    created_at: "2026-09-06T00:00:00Z",
  };
  const html = renderToStaticMarkup(<H5MarketingLeadsTable leads={[lead]} />);
  expect(html).toContain("活动客户");
  expect(html).toContain("原有摘要");
  expect(html).toContain(`/customer-leads?source=h5&amp;leadId=${lead.id}`);
  expect(html).toContain("查看客户线索");
  expect(html).not.toContain("转客户</button>");
  expect(html).not.toContain("跟进</button>");
});
