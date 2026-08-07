import { describe, expect, mock, test } from "bun:test";
import { ADMIN_SESSION_STORAGE_PREFIX } from "@/components/layout/admin-session-scope";
import { createAdminSessionExpiryHandler } from "./admin-session-expiry";

function createStorage(entries: Record<string, string>) {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    has(key: string) {
      return values.has(key);
    },
  };
}

describe("admin session expiry handler", () => {
  test("clears only admin session state and redirects once for repeated 401 responses", () => {
    const storage = createStorage({
      [`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`]: "cached",
      "unrelated-setting": "preserved",
    });
    const replace = mock(() => undefined);
    const handleExpiry = createAdminSessionExpiryHandler({
      storage,
      replace,
    });

    expect(handleExpiry({ status: 401, code: "TOKEN_EXPIRED" })).toBe(true);
    expect(handleExpiry({ status: 401, code: "TOKEN_INVALID" })).toBe(true);

    expect(storage.has(`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`)).toBe(false);
    expect(storage.has("unrelated-setting")).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login?reason=session_expired");
  });

  test("does not clear state or redirect for permission denials", () => {
    const storage = createStorage({
      [`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`]: "cached",
    });
    const replace = mock(() => undefined);
    const handleExpiry = createAdminSessionExpiryHandler({ storage, replace });

    expect(handleExpiry({ status: 403, code: "FORBIDDEN" })).toBe(false);
    expect(storage.has(`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`)).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });
});
