import { afterEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_SESSION_STORAGE_PREFIX } from "@/components/layout/admin-session-scope";
import { requestBackendJson } from "./backend-client";

const originalFetch = globalThis.fetch;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("requestBackendJson", () => {
  test("preserves the backend error while redirecting an expired browser session", async () => {
    const values = new Map([
      [`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`, "cached"],
      ["unrelated-setting", "preserved"],
    ]);
    const replace = mock(() => undefined);
    const storage = {
      get length() {
        return values.size;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { replace }, localStorage: storage },
    });
    globalThis.fetch = mock(async () => Response.json({
      success: false,
      message: "登录已过期",
      code: "TOKEN_EXPIRED",
      requestId: "req-auth",
    }, { status: 401 })) as unknown as typeof fetch;

    await expect(requestBackendJson("/customers")).rejects.toMatchObject({
      message: "登录已过期",
      status: 401,
      code: "TOKEN_EXPIRED",
      requestId: "req-auth",
    });
    expect(replace).toHaveBeenCalledWith("/login?reason=session_expired");
    expect(values.has(`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`)).toBe(false);
    expect(values.has("unrelated-setting")).toBe(true);
  });
});
