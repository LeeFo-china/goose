import { describe, expect, test } from "bun:test";

import {
  getAdminSidebarScrollKey,
  readAdminSidebarScrollTop,
  writeAdminSidebarScrollTop,
} from "./admin-sidebar-scroll-area";
import { clearAdminSessionScopedStorage } from "./admin-session-scope";
import type { AdminSession } from "@/lib/backend";

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createSession(userId: string, tenantId: string | null): AdminSession {
  return {
    user_id: userId,
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
    tenant: tenantId
      ? { id: tenantId, name: "测试租户", slug: "test", status: "active" }
      : null,
    roles: tenantId ? ["tenant_admin"] : ["platform_admin"],
    permissions: [],
    is_platform_staff: tenantId === null,
  };
}

describe("admin sidebar scroll state", () => {
  test("treats missing or invalid persisted positions as unavailable", () => {
    const storage = createMemoryStorage({
      invalid: "not-a-number",
      negative: "-10",
    });

    expect(readAdminSidebarScrollTop(storage, "missing")).toBeNull();
    expect(readAdminSidebarScrollTop(storage, "invalid")).toBeNull();
    expect(readAdminSidebarScrollTop(storage, "negative")).toBeNull();
  });

  test("stores a normalized non-negative integer position", () => {
    const storage = createMemoryStorage();

    writeAdminSidebarScrollTop(storage, "sidebar", 128.6);
    expect(storage.getItem("sidebar")).toBe("129");

    writeAdminSidebarScrollTop(storage, "sidebar", -8);
    expect(storage.getItem("sidebar")).toBe("0");
  });

  test("isolates positions by session scope and clears them on logout", () => {
    const storage = createMemoryStorage();
    const tenantAKey = getAdminSidebarScrollKey(createSession("user-1", "tenant-a"));
    const tenantBKey = getAdminSidebarScrollKey(createSession("user-1", "tenant-b"));

    expect(tenantAKey).not.toBe(tenantBKey);
    writeAdminSidebarScrollTop(storage, tenantAKey, 120);
    writeAdminSidebarScrollTop(storage, tenantBKey, 240);

    clearAdminSessionScopedStorage(storage);

    expect(storage.getItem(tenantAKey)).toBeNull();
    expect(storage.getItem(tenantBKey)).toBeNull();
  });
});
