import { expect, mock, test } from "bun:test";
import { DouyinOpenPlatformClient } from "./client";

test("marks a rejected version resubmission with audit_way 1", async () => {
  const fetch = mock(async (
    _input: string | URL | Request,
    _init?: RequestInit,
  ) => new Response(JSON.stringify({
    err_no: 0,
    err_msg: "",
    log_id: "audit-retry-log",
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  const client = new DouyinOpenPlatformClient({ fetch });

  await expect(client.submitVersionAudit({
    authorizerAccessToken: "authorizer-token-value",
    appId: "authorizer-appid",
    hostNames: ["douyin"],
    auditNote: "修复量房预约后重新提审",
    auditWay: 1,
  })).resolves.toEqual({ logId: "audit-retry-log" });

  expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
    host_names: ["douyin"],
    audit_note: "修复量房预约后重新提审",
    audit_way: 1,
  }));
});
