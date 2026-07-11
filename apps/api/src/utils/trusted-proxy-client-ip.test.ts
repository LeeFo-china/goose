import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { resolveTrustedClientIp, verifySignedClientIp } from "./trusted-proxy-client-ip";

const secret = "test-shared-secret-with-enough-entropy";
const now = 1_720_000_000_000;

function signedHeaders(ip: string, timestamp = Math.floor(now / 1000).toString()) {
  return {
    "x-gooes-client-ip": ip,
    "x-gooes-client-ip-timestamp": timestamp,
    "x-gooes-client-ip-signature": createHmac("sha256", secret)
      .update(`${timestamp}.${ip}`)
      .digest("hex"),
  };
}

describe("trusted Web proxy client IP", () => {
  test.each(["203.0.113.8", "2001:db8::8"])("accepts signed %s", (ip) => {
    expect(verifySignedClientIp(signedHeaders(ip), secret, now)).toBe(ip);
  });

  test("rejects forged and expired signatures", () => {
    expect(verifySignedClientIp({ ...signedHeaders("203.0.113.8"), "x-gooes-client-ip-signature": "00" }, secret, now)).toBeNull();
    expect(verifySignedClientIp(signedHeaders("203.0.113.8", "1719999000"), secret, now)).toBeNull();
  });

  test("falls back to Fastify request IP instead of trusting raw forwarding headers", () => {
    expect(resolveTrustedClientIp({ ip: "127.0.0.1", headers: { "x-forwarded-for": "203.0.113.99" } }, secret, now)).toBe("127.0.0.1");
  });
});
