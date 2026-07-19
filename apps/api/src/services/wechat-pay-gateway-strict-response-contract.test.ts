import { describe, expect, test } from "bun:test";

const SERVICES_DIR = import.meta.dir;
const INTEGRATION_PLAN = new URL(
  "../../../../docs/superpowers/plans/2026-07-18-tenant-credit-refund-reconciliation.md",
  import.meta.url,
);

describe("Wechat Pay strict response path contract", () => {
  test("has no raw JSON parser or redundant unsigned transport export", async () => {
    const responseHelpers = await readService("wechat-pay-gateway-response.ts");
    const prepayHelpers = await readService("wechat-pay-gateway-create-prepay.ts");
    const queryHelpers = await readService("wechat-pay-gateway-query-transaction.ts");

    expect(responseHelpers).not.toContain("parseWechatPayJson");
    expect(prepayHelpers).not.toContain("createWechatPayJsapiPrepay");
    expect(queryHelpers).not.toContain(
      "queryWechatPayTransactionByOutTradeNo",
    );
  });

  test("routes every active transport through the strict response layer", async () => {
    const strictLayer = await readService("wechat-pay-api-response.ts");
    const gateway = await readService("wechat-pay-gateway.ts");
    const closeTransport = await readService(
      "wechat-pay-gateway-close-transaction.ts",
    );

    expect(strictLayer).toContain("readVerifiedWechatPayRawResponse");
    expect(strictLayer).toContain("readVerifiedWechatPayEmptyResponse");
    expect(gateway).toContain("readVerifiedWechatPayJson");
    expect(closeTransport).toContain("readVerifiedWechatPayEmptyResponse");
    expect(closeTransport).toContain("readVerifiedWechatPayRawResponse");
  });

  test("documents every approved integration exception path", async () => {
    const plan = await Bun.file(INTEGRATION_PLAN).text();
    const exceptionPaths = [
      "wechat-pay-callbacks-credit-recharge.test.ts",
      "wechat-pay-callbacks-credit-refund.test.ts",
      "wechat-pay-gateway-request-builders.ts",
      "wechat-pay-gateway-transport.test.ts",
      "wechat-pay-api-response.ts",
      "wechat-pay-gateway.ts",
      "wechat-pay-gateway-close-transaction.ts",
      "wechat-pay-gateway-close-transaction.test.ts",
      "wechat-pay-gateway-create-prepay.ts",
      "wechat-pay-gateway-prepay-transport.test.ts",
      "wechat-pay-gateway-query-transaction.ts",
      "wechat-pay-gateway-query-transaction.test.ts",
      "wechat-pay-gateway-response.ts",
      "billing-reconcile-worker.ts",
      "billing-reconcile-worker.test.ts",
    ];

    for (const path of exceptionPaths) {
      expect(plan).toContain(path);
    }
    expect(plan).toContain("非重叠 production 文件");
    expect(plan).toContain("approved integration exceptions");
  });
});

function readService(fileName: string): Promise<string> {
  return Bun.file(`${SERVICES_DIR}/${fileName}`).text();
}
