import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkAdminSession } from "./admin-session-guard";

describe("admin session guard", () => {
  test("reports only 401 responses as expired", async () => {
    expect(await checkAdminSession({
      fetchSession: mock(async () => new Response(null, { status: 401 })),
    })).toBe("expired");
    expect(await checkAdminSession({
      fetchSession: mock(async () => new Response(null, { status: 403 })),
    })).toBe("unavailable");
    expect(await checkAdminSession({
      fetchSession: mock(async () => new Response(null, { status: 503 })),
    })).toBe("unavailable");
    expect(await checkAdminSession({
      fetchSession: mock(async () => new Response(null, { status: 200 })),
    })).toBe("active");
  });

  test("treats network failures as unavailable instead of expired", async () => {
    expect(await checkAdminSession({
      fetchSession: mock(async () => {
        throw new TypeError("network unavailable");
      }),
    })).toBe("unavailable");
  });

  test("is mounted once inside the session and service access providers", () => {
    const source = readFileSync(new URL("./admin-shell.tsx", import.meta.url), "utf8");
    const sessionProviderStart = source.indexOf("<AdminSessionScopeProvider");
    const serviceAccessProviderStart = source.indexOf("<ServiceAccessProvider");
    const guard = source.indexOf("<AdminSessionGuard />");
    const serviceAccessProviderEnd = source.indexOf("</ServiceAccessProvider>");
    const sessionProviderEnd = source.indexOf("</AdminSessionScopeProvider>");

    expect(source.match(/<AdminSessionGuard\s*\/>/g)?.length).toBe(1);
    expect(source.match(/<ServiceAccessProvider\b/g)?.length).toBe(1);
    expect(source).toContain(
      "key={getServiceAccessProviderKey(serviceAccess)}",
    );
    expect(serviceAccessProviderStart).toBeGreaterThan(sessionProviderStart);
    expect(guard).toBeGreaterThan(serviceAccessProviderStart);
    expect(serviceAccessProviderEnd).toBeGreaterThan(guard);
    expect(sessionProviderEnd).toBeGreaterThan(serviceAccessProviderEnd);
  });
});
