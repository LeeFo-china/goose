import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinMiniappController: typeof import(".").DouyinMiniappController;

beforeAll(async () => {
  ({ DouyinMiniappController } = await import("."));
});

describe("DouyinMiniappController bootstrap", () => {
  test("dispatches the 0.1.10 feature contract from the authenticated Referer", async () => {
    const bootstrap = mock(async () => ({}));
    const controller = new DouyinMiniappController(
      undefined,
      { bootstrap } as never,
    );
    const authenticatedUser = {
      token_type: "douyin_miniapp",
      douyin_app_id: "ttd033a68e4e56ccd301",
    };

    await controller.bootstrap({
      user: authenticatedUser,
      headers: {
        referer: "https://tmaservice.developer.toutiao.com/" +
          "?appid=ttd033a68e4e56ccd301&version=0.1.10",
      },
    } as never);

    expect(bootstrap).toHaveBeenCalledWith(authenticatedUser, {
      featureContract: "legacy_0_1_10",
    });
  });
});
