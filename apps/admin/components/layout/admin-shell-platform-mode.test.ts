import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("AdminShell platform mode", () => {
  test("does not render tenant notification menu for platform-only sessions", () => {
    const source = readSource("./admin-shell.tsx");

    expect(source).toContain("isPlatformMode");
    expect(source).toContain("!isPlatformMode ? <NotificationMenu /> : null");
  });

  test("provides the authenticated tenant and user scope to all shell children", () => {
    const source = readSource("./admin-shell.tsx");
    const providerStart = source.indexOf("<AdminSessionScopeProvider");
    const children = source.indexOf("{children}");
    const providerEnd = source.indexOf("</AdminSessionScopeProvider>");

    expect(source).toContain("tenantId={session.tenant?.id ?? null}");
    expect(source).toContain("userId={session.user_id}");
    expect(providerStart).toBeGreaterThan(-1);
    expect(children).toBeGreaterThan(providerStart);
    expect(providerEnd).toBeGreaterThan(children);
  });

  test("clears only admin session storage after logout request and before redirect", () => {
    const source = readSource("./logout-button.tsx");
    const logoutRequest = source.indexOf('fetch("/api/auth/logout"');
    const clearStorage = source.lastIndexOf("clearAdminSessionScopedStorage");
    const redirect = source.indexOf('router.replace("/login")');

    expect(clearStorage).toBeGreaterThan(logoutRequest);
    expect(redirect).toBeGreaterThan(clearStorage);
  });
});
