import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import Fastify from "fastify";

import {
  parseFastifyTrustProxy,
  resolveTrustedClientIp,
  verifySignedClientIp,
} from "./trusted-proxy-client-ip";

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

  test("fails closed for forged, expired, or secretless internal headers", () => {
    for (const [headers, configuredSecret] of [
      [{ ...signedHeaders("203.0.113.8"), "x-gooes-client-ip-signature": "00" }, secret],
      [signedHeaders("203.0.113.8", "1719999000"), secret],
      [signedHeaders("203.0.113.8"), undefined],
    ] as const) {
      expect(() => resolveTrustedClientIp({ ip: "127.0.0.1", headers }, configuredSecret, now)).toThrow();
    }
  });

  test("does not fall back to a shared proxy peer when one-hop mode lacks XFF", () => {
    expect(resolveTrustedClientIp(
      { ip: "172.20.0.1", headers: {} },
      secret,
      now,
      "1",
    ))
      .toBeNull();
    expect(resolveTrustedClientIp({
      ip: "203.0.113.8",
      headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.8" },
    }, secret, now, "1")).toBe("203.0.113.8");
    expect(resolveTrustedClientIp({
      ip: "172.20.0.1",
      headers: signedHeaders("203.0.113.8"),
    }, secret, now, "1")).toBe("203.0.113.8");
    expect(resolveTrustedClientIp(
      { ip: "127.0.0.1", headers: {} },
      secret,
      now,
      undefined,
    ))
      .toBe("127.0.0.1");
  });
});

describe("Fastify trusted proxy boundary", () => {
  test("parses only the explicitly supported one-hop deployment value", () => {
    expect(parseFastifyTrustProxy("1")).toBe(1);
    for (const value of [undefined, "", "0", "01", "2", "true", " 1 "]) {
      expect(parseFastifyTrustProxy(value)).toBe(false);
    }
  });

  test("uses only the rightmost forwarded address for the configured proxy hop", async () => {
    const app = Fastify({
      logger: false,
      trustProxy: parseFastifyTrustProxy("1"),
    });
    app.get("/ip", async (request) => ({ ip: request.ip, ips: request.ips }));
    try {
      for (const fixture of [
        {
          remoteAddress: "172.20.0.1",
          forwardedFor: "198.51.100.99, 203.0.113.7",
          expectedIp: "203.0.113.7",
        },
        {
          remoteAddress: "::1",
          forwardedFor: "198.51.100.99, 2001:db8::8",
          expectedIp: "2001:db8::8",
        },
      ]) {
        const response = await app.inject({
          method: "GET",
          url: "/ip",
          remoteAddress: fixture.remoteAddress,
          headers: { "x-forwarded-for": fixture.forwardedFor },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json<{ ip: string; ips: string[] }>()).toEqual({
          ip: fixture.expectedIp,
          ips: [fixture.remoteAddress, fixture.expectedIp],
        });
      }
    } finally {
      await app.close();
    }
  });

  test("ignores forged forwarding headers when proxy mode is not configured", async () => {
    const app = Fastify({
      logger: false,
      trustProxy: parseFastifyTrustProxy(undefined),
    });
    app.get("/ip", async (request) => ({ ip: request.ip }));
    try {
      const response = await app.inject({
        method: "GET",
        url: "/ip",
        remoteAddress: "198.51.100.10",
        headers: { "x-forwarded-for": "203.0.113.99" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ ip: string }>()).toEqual({ ip: "198.51.100.10" });
    } finally {
      await app.close();
    }
  });

  test("wires one proxy hop only in loopback-bound deployments", async () => {
    const root = new URL("../../../../", import.meta.url);
    const appSource = await Bun.file(new URL("apps/api/src/app.ts", root)).text();
    expect(appSource).toContain(
      "trustProxy: parseFastifyTrustProxy(process.env.GOOES_TRUST_PROXY_HOPS)",
    );

    for (const composeFile of [
      "deploy/docker-compose.api.yml",
      "deploy/docker-compose.dev.yml",
    ]) {
      const source = await Bun.file(new URL(composeFile, root)).text();
      expect(source).toContain('GOOES_TRUST_PROXY_HOPS: "1"');
      expect(source).toMatch(
        /"\$\{GOOES_API_BIND_HOST:-127\.0\.0\.1\}:\$\{GOOES_API_HOST_PORT:-\d+\}:\$\{GOOES_API_PORT:-3000\}"/,
      );
    }
  });
});
