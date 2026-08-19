import { describe, expect, test } from "bun:test";

import type { AdminSession } from "@/lib/backend";

import { isPlatformOnlySession } from "./session-mode";

function createSession(input: Partial<AdminSession> = {}): AdminSession {
  return {
    user_id: "user-1",
    login_channel: "admin_web",
    employee: {
      id: "employee-1",
      name: "测试员工",
      status: "active",
      tenant_department_id: null,
      department_name: null,
      post_id: null,
      post_name: null,
      avatar: null,
    },
    tenant: null,
    roles: [],
    permissions: [],
    ...input,
  };
}

describe("isPlatformOnlySession", () => {
  test("recognizes authenticated platform staff without the legacy admin role", () => {
    expect(isPlatformOnlySession(createSession({
      roles: ["platform_staff"],
      is_platform_staff: true,
    }))).toBe(true);
  });

  test("preserves the legacy platform admin identity", () => {
    expect(isPlatformOnlySession(createSession({
      roles: ["platform_admin"],
    }))).toBe(true);
  });

  test("never promotes a tenant-bound session to platform-only mode", () => {
    expect(isPlatformOnlySession(createSession({
      tenant: {
        id: "tenant-1",
        name: "测试租户",
        slug: "test",
        status: "active",
      },
      roles: ["platform_staff"],
      is_platform_staff: true,
    }))).toBe(false);
  });
});
