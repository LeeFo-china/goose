import { describe, expect, test } from "bun:test";

import { buildSignedClientIpHeaders } from "../lib/proxy-client-ip";

describe("Web BFF signed client IP", () => {
  test.each(["203.0.113.9", "2001:db8::9"])("signs trusted %s", (ip) => {
    const headers = buildSignedClientIpHeaders(ip, "secret", 1_720_000_000_000);
    expect(headers.get("x-gooes-client-ip")).toBe(ip);
    expect(headers.get("x-gooes-client-ip-timestamp")).toBe("1720000000");
    expect(headers.get("x-gooes-client-ip-signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  test("ignores invalid input instead of signing it", () => {
    expect([...buildSignedClientIpHeaders("forged, 203.0.113.9", "secret")]).toHaveLength(0);
  });
});
