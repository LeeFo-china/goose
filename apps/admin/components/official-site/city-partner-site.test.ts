import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Official city partner recruitment site", () => {
  test("publishes a public partner recruitment landing page", () => {
    const pageUrl = new URL("../../app/(site)/partners/page.tsx", import.meta.url);
    expect(existsSync(pageUrl)).toBe(true);

    const source = readFileSync(pageUrl, "utf8");
    expect(source).toContain("metadata");
    expect(source).toContain("城市合伙人招募");
    expect(source).toContain("只参与平台收入分成");
    expect(source).toContain("装修公司自己的业务收支独立");
    expect(source).toContain("线索服务费默认 2.5%");
    expect(source).toContain("月结");
    expect(source).toContain("PartnerApplicationForm");
    expect(source).toContain("partner-hero-renovation.png");
    expect(source).not.toContain('redirect("/dashboard")');
  });

  test("submits official website applications through a public proxy", () => {
    const formUrl = new URL("./partner-application-form.tsx", import.meta.url);
    expect(existsSync(formUrl)).toBe(true);

    const source = readFileSync(formUrl, "utf8");
    expect(source).toContain('"use client"');
    expect(source).toContain('fetch("/api/public/partner-applications"');
    expect(source).toContain('name="applicant_name"');
    expect(source).toContain('name="subject_type"');
    expect(source).toContain('name="contact_name"');
    expect(source).toContain('name="phone"');
    expect(source).toContain('name="region_name"');
    expect(source).toContain('agree_privacy');
    expect(source).toContain("FieldGroup");
    expect(source).toContain("Checkbox");
    expect(source).not.toContain("requestBackendJson");
  });

  test("proxies only the public partner application endpoint without admin token", () => {
    const routeUrl = new URL(
      "../../app/api/public/partner-applications/route.ts",
      import.meta.url,
    );
    expect(existsSync(routeUrl)).toBe(true);

    const source = readFileSync(routeUrl, "utf8");
    expect(source).toContain("export async function POST");
    expect(source).toContain('buildBackendUrl("/public/partner-applications")');
    expect(source).toContain("BACKEND_UNAVAILABLE");
    expect(source).not.toContain("getAdminToken");
    expect(source).not.toContain("authorization");
  });
});
