import { beforeAll, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
let WechatContentSafetyGateway: typeof import("./wechat-content-safety-gateway")["WechatContentSafetyGateway"];
beforeAll(async () => { ({ WechatContentSafetyGateway } = await import("./wechat-content-safety-gateway")); });
const token = { getAccessToken: async () => "server-token" };

test("text check uses official v2 comment scene and server credentials", async () => {
  const fetchImpl = mock(async (_url: string | URL | Request, _options?: RequestInit) => Response.json({ errcode: 0, trace_id: "trace", result: { suggest: "pass" } }));
  const gateway = new WechatContentSafetyGateway({ accessTokenProvider: token, fetchImpl });
  expect(await gateway.checkText({ openid: "bound-openid", content: "请复核施工记录" })).toEqual({ status: "approved", traceId: "trace" });
  const [url, options] = fetchImpl.mock.calls[0]!;
  expect(String(url)).toBe("https://api.weixin.qq.com/wxa/msg_sec_check?access_token=server-token");
  expect(JSON.parse(String(options?.body))).toEqual({ openid: "bound-openid", content: "请复核施工记录", version: 2, scene: 2 });
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});
for (const [suggest, status] of [["risky", "rejected"], ["review", "pending"]] as const) {
  test(`${suggest} is never approved`, async () => {
    const gateway = new WechatContentSafetyGateway({ accessTokenProvider: token,
      fetchImpl: async () => Response.json({ errcode: 0, trace_id: "trace", result: { suggest } }) });
    expect(await gateway.checkText({ openid: "bound", content: "内容" })).toEqual({ status, traceId: "trace" });
  });
}
for (const body of [null, {}, { errcode: 61010 }, { errcode: "0", trace_id: "t", result: { suggest: "pass" } },
  { errcode: 0, result: { suggest: "pass" } }, { errcode: 0, trace_id: "t", result: { suggest: "unknown" } }]) {
  test(`invalid response fails closed: ${JSON.stringify(body)}`, async () => {
    const gateway = new WechatContentSafetyGateway({ accessTokenProvider: token, fetchImpl: async () => Response.json(body) });
    await expect(gateway.checkText({ openid: "bound", content: "内容" })).rejects.toMatchObject({ statusCode: 503, code: "CONTENT_CHECK_UNAVAILABLE" });
  });
}
test("timeout, JSON, HTTP and credential failures return neutral errors", async () => {
  for (const fetchImpl of [
    async () => { throw new DOMException("secret-token", "TimeoutError"); },
    async () => new Response("not json"),
    async () => Response.json({ errcode: 0, trace_id: "trace", result: { suggest: "pass" } }, { status: 503 }),
  ]) {
    const gateway = new WechatContentSafetyGateway({ accessTokenProvider: token, fetchImpl });
    await expect(gateway.checkText({ openid: "bound", content: "内容" })).rejects.toMatchObject({ code: "CONTENT_CHECK_UNAVAILABLE", message: "暂时无法审核，请稍后重试" });
  }
  const gateway = new WechatContentSafetyGateway({ accessTokenProvider: { getAccessToken: async () => { throw Errors.dbError("secret"); } } });
  await expect(gateway.checkText({ openid: "bound", content: "内容" })).rejects.toMatchObject({ code: "CONTENT_CHECK_UNAVAILABLE" });
});
