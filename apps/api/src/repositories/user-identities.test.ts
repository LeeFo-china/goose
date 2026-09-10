import { describe, expect, test } from "bun:test";

import type { OAuthPlatform } from "./user-identities";

describe("user identity platforms", () => {
  test("allows Douyin mini-program OAuth identities", () => {
    const platform: OAuthPlatform = "douyin_mini";

    expect(platform).toBe("douyin_mini");
  });
});
