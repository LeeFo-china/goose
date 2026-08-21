import { describe, expect, test } from "bun:test";
import type { BootstrapData } from "../models";
import { fetchBootstrap } from "./bootstrap";
import { DOUYIN_DEFAULT_CONTACT_SLA_TEXT } from "./content-validation";
import { ApiClient } from "./request";

const bootstrap = {
  installation: { status: "active", template_version: "1.0.0" },
  company: {
    name: "示例装修公司",
    logo_url: null,
    summary: null,
    service_phone: "0371-00000000",
    public_address: null,
    address_region: { province: null, city: "郑州市", district: null },
    service_regions: [],
    qualifications: [],
  },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false,
    phone_capture_mode: "sms",
  },
  content: {
    home_banners: [],
    trust_metrics: [],
    featured_projects: [],
    featured_cases: [],
    active_sites: [],
  },
  privacy_policy_version: "2026-07-19",
  contact_sla_text: DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
} satisfies BootstrapData;

function clientWith(value: unknown): ApiClient {
  return new ApiClient(
    { send: async () => value },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

describe("Douyin bootstrap response validation", () => {
  test("accepts a six-digit hexadecimal tenant theme color", async () => {
    await expect(fetchBootstrap(clientWith(bootstrap))).resolves.toEqual(bootstrap);
  });

  test("normalizes old backend responses and trims configured SLA copy", async () => {
    const { contact_sla_text: _, ...legacyBootstrap } = bootstrap;
    await expect(fetchBootstrap(clientWith(legacyBootstrap))).resolves.toEqual(
      bootstrap,
    );
    await expect(fetchBootstrap(clientWith({
      ...bootstrap,
      contact_sla_text: "  工作人员将在今天与你联系  ",
    }))).resolves.toMatchObject({
      contact_sla_text: "工作人员将在今天与你联系",
    });
  });

  test("rejects invalid configured SLA copy", async () => {
    for (const contactSlaText of ["", "   ", "x".repeat(81)]) {
      await expect(fetchBootstrap(clientWith({
        ...bootstrap,
        contact_sla_text: contactSlaText,
      }))).rejects.toMatchObject({
        statusCode: 502,
        code: "INVALID_API_RESPONSE",
      });
    }
  });

  test("rejects undocumented top-level bootstrap fields", async () => {
    await expect(fetchBootstrap(clientWith({
      ...bootstrap,
      internal_tenant_id: "must-not-leak",
    }))).rejects.toMatchObject({
      statusCode: 502,
      code: "INVALID_API_RESPONSE",
    });
  });

  test("rejects a theme value that could escape an inline color declaration", async () => {
    const unsafe = {
      ...bootstrap,
      theme: { ...bootstrap.theme, primary_color: "red; display: none" },
    };

    await expect(fetchBootstrap(clientWith(unsafe))).rejects.toMatchObject({
      statusCode: 502,
      code: "INVALID_API_RESPONSE",
    });
  });
});
