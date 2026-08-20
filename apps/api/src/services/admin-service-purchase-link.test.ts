import { describe, expect, mock, test } from "bun:test";
import type { AdminTenantServiceAccess } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const TRIAL_ID = "20000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-19T02:30:00.789Z");
const PURCHASE_PERMISSION = "billing.service_order.create";
const PURCHASE_PATH =
  "packageEmployees/pages/platformServicePaymentSmoke/index";

describe("AdminServicePurchaseLinkService", () => {
  test("rejects without create permission before resolving or generating", async () => {
    const subject = await createSubject();

    await expect(subject.service.create({
      tenantId: TENANT_ID,
      permissionCodes: ["billing.service_order.read"],
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "无权限",
    });

    expect(subject.resolveServiceAccess).not.toHaveBeenCalled();
    expect(subject.getString).not.toHaveBeenCalled();
    expect(subject.normalizeEnvVersion).not.toHaveBeenCalled();
    expect(subject.generateUrlLink).not.toHaveBeenCalled();
  });

  test("rejects hard blocked access even if a purchase action is present", async () => {
    const subject = await createSubject(summary({
      accessStatus: "hard_blocked",
      primaryAction: purchaseAction(),
    }));

    await expect(subject.service.create(authorizedInput()))
      .rejects.toMatchObject(unavailableError());

    expect(subject.resolveServiceAccess).toHaveBeenCalledTimes(1);
    expect(subject.generateUrlLink).not.toHaveBeenCalled();
  });

  test.each(["pending_review", "scheduled", "workspace_available"] as const)(
    "rejects %s access even when a purchase action is injected",
    async (accessStatus) => {
      const subject = await createSubject(summary({
        accessStatus,
        primaryAction: purchaseAction(),
      }));

      await expect(subject.service.create(authorizedInput()))
        .rejects.toMatchObject(unavailableError());

      expect(subject.resolveServiceAccess).toHaveBeenCalledTimes(1);
      expect(subject.getString).not.toHaveBeenCalled();
      expect(subject.generateUrlLink).not.toHaveBeenCalled();
    },
  );

  test("generates a service blocked link with trusted path and exact expiry", async () => {
    const subject = await createSubject(summary({
      trialId: null,
      trialStatus: null,
      primaryAction: purchaseAction(),
    }));

    const result = await subject.service.create(authorizedInput());

    expect(subject.resolveServiceAccess).toHaveBeenCalledTimes(1);
    expect(subject.getString).toHaveBeenCalledTimes(1);
    expect(subject.getString).toHaveBeenCalledWith(
      "WECHAT_MINIPROGRAM_ENV_VERSION",
      "release",
    );
    expect(subject.normalizeEnvVersion).toHaveBeenCalledTimes(1);
    expect(subject.normalizeEnvVersion).toHaveBeenCalledWith("trial");
    expect(subject.generateUrlLink).toHaveBeenCalledTimes(1);
    expect(subject.generateUrlLink).toHaveBeenCalledWith({
      path: PURCHASE_PATH,
      query: "",
      envVersion: "trial",
      expireAt: new Date("2026-08-19T02:40:00.000Z"),
    });
    expect(result).toEqual({
      url: "https://wxaurl.cn/trusted-link",
      expires_at: "2026-08-19T02:40:00.000Z",
    });
  });

  test.each(["expired", "grace_period"] as const)(
    "uses only the authoritative trial id for %s access",
    async (accessStatus) => {
      const subject = await createSubject(summary({
        accessStatus,
        accessMode: accessStatus === "grace_period" ? "grace" : "service_blocked",
        accessLevel: accessStatus === "grace_period" ? "read_only" : "none",
        canEnterWorkspace: accessStatus === "grace_period",
        readonly: accessStatus === "grace_period",
        trialStatus: accessStatus,
        secondaryAction: purchaseAction(),
      }));
      const untrustedInput = {
        ...authorizedInput(),
        trialId: "attacker-trial",
        path: "pages/attacker/index",
        body: {
          tenantId: "attacker-tenant",
          trialId: "attacker-trial",
          path: "pages/attacker/index",
        },
      };

      await subject.service.create(untrustedInput);

      expect(subject.resolveServiceAccess).toHaveBeenCalledTimes(1);
      expect(subject.resolveServiceAccess).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        permissionCodes: [PURCHASE_PERMISSION],
      });
      expect(subject.generateUrlLink).toHaveBeenCalledTimes(1);
      expect(subject.generateUrlLink).toHaveBeenCalledWith({
        path: PURCHASE_PATH,
        query: `source_trial_id=${TRIAL_ID}`,
        envVersion: "trial",
        expireAt: new Date("2026-08-19T02:40:00.000Z"),
      });
    },
  );

  test("maps a generator AppError without leaking provider details", async () => {
    const subject = await createSubject(summary({
      primaryAction: purchaseAction(),
    }));
    const providerError = Errors.badRequest("微信原始 errmsg");
    subject.generateUrlLink.mockImplementation(async () => {
      throw providerError;
    });

    const error = await captureError(() =>
      subject.service.create(authorizedInput())
    );

    expectStableProviderError(error);
    expect(error).not.toBe(providerError);
    expect(JSON.stringify(error)).not.toContain("微信原始 errmsg");
    expect(subject.resolveServiceAccess).toHaveBeenCalledTimes(1);
    expect(subject.generateUrlLink).toHaveBeenCalledTimes(1);
  });

  test.each([
    Errors.badRequest("设置读取失败"),
    new Error("settings unavailable"),
  ])("maps getString provider failures to the stable error", async (failure) => {
    const subject = await createSubject(summary({ primaryAction: purchaseAction() }));
    subject.getString.mockImplementation(async () => {
      throw failure;
    });

    const error = await captureError(() =>
      subject.service.create(authorizedInput())
    );

    expectStableProviderError(error);
    expect(subject.normalizeEnvVersion).not.toHaveBeenCalled();
    expect(subject.generateUrlLink).not.toHaveBeenCalled();
  });

  test("maps normalizeEnvVersion failures to the stable error", async () => {
    const subject = await createSubject(summary({
      primaryAction: purchaseAction(),
    }));
    subject.normalizeEnvVersion.mockImplementation(() => {
      throw { reason: "invalid env" };
    });

    const error = await captureError(() =>
      subject.service.create(authorizedInput())
    );

    expectStableProviderError(error);
    expect(subject.generateUrlLink).not.toHaveBeenCalled();
  });

  test("keeps authoritative resolver AppError unchanged", async () => {
    const subject = await createSubject();
    const resolverError = Errors.dbError("权威状态不一致");
    subject.resolveServiceAccess.mockImplementation(async () => {
      throw resolverError;
    });

    const error = await captureError(() =>
      subject.service.create(authorizedInput())
    );

    expect(error).toBe(resolverError);
    expect(subject.getString).not.toHaveBeenCalled();
  });
});

async function createSubject(serviceAccess = summary()) {
  const { AdminServicePurchaseLinkService } = await import(
    "./admin-service-purchase-link"
  );
  const resolveServiceAccess = mock(async () => serviceAccess);
  const getString = mock(async () => "trial");
  const normalizeEnvVersion = mock(() => "trial" as const);
  const generateUrlLink = mock(async () => "https://wxaurl.cn/trusted-link");
  const service = new AdminServicePurchaseLinkService({
    resolveServiceAccess,
    getString,
    normalizeEnvVersion,
    generateUrlLink,
    now: () => NOW,
  });

  return {
    service,
    resolveServiceAccess,
    getString,
    normalizeEnvVersion,
    generateUrlLink,
  };
}

function authorizedInput() {
  return {
    tenantId: TENANT_ID,
    permissionCodes: [PURCHASE_PERMISSION],
  };
}

function unavailableError() {
  return {
    statusCode: 403,
    code: "SERVICE_PURCHASE_UNAVAILABLE",
    message: "当前服务状态不可发起购买",
  };
}

async function captureError(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new TypeError("expected operation to reject");
}

function expectStableProviderError(error: unknown) {
  expect(error).toMatchObject({
    statusCode: 502,
    code: "SERVICE_PURCHASE_LINK_FAILED",
    message: "生成小程序购买链接失败，请稍后重试",
  });
  expect((error as { details?: unknown }).details).toBeUndefined();
}

function purchaseAction() {
  return { key: "purchase_service", label: "购买正式服务" } as const;
}

function summary(
  overrides: Partial<AdminTenantServiceAccess> = {},
): AdminTenantServiceAccess {
  return {
    accessStatus: "service_blocked",
    accessMode: "service_blocked",
    accessLevel: "none",
    canEnterWorkspace: false,
    readonly: false,
    trialId: TRIAL_ID,
    trialStatus: "rejected",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-08-31T00:00:00.000Z",
    evaluatedAt: NOW.toISOString(),
    title: "平台技术服务状态",
    message: "请购买正式服务。",
    primaryAction: null,
    secondaryAction: null,
    ...overrides,
  };
}
