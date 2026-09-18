import { describe, expect, test } from "bun:test";
import { resolveDouyinBootstrapFeatureContract } from "./bootstrap-client-contract";

const APP_ID = "ttd033a68e4e56ccd301";

describe("resolveDouyinBootstrapFeatureContract", () => {
  test("selects the legacy contract only for the authenticated 0.1.10 app", () => {
    expect(resolveDouyinBootstrapFeatureContract(
      `https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`,
      APP_ID,
    )).toBe("legacy_0_1_10");
  });

  test.each([
    [`https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.39`, APP_ID],
    [`https://tmaservice.developer.toutiao.com/?appid=tt-other&version=0.1.10`, APP_ID],
    [`https://example.com/?appid=${APP_ID}&version=0.1.10`, APP_ID],
    [`http://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`, APP_ID],
    [`https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`, "tt-other"],
    ["not-a-url", APP_ID],
    [undefined, APP_ID],
    [[`https://tmaservice.developer.toutiao.com/?appid=${APP_ID}&version=0.1.10`], APP_ID],
  ] as const)("keeps the runtime contract for %p", (referer, authenticatedAppId) => {
    expect(resolveDouyinBootstrapFeatureContract(referer, authenticatedAppId))
      .toBe("runtime");
  });
});
