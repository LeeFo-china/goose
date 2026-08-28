import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import { DouyinOpenPlatformClient } from "./client";

const COMPONENT_TOKEN = "component-token-value";
const AUTHORIZER_TOKEN = "authorizer-token-value";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function expectSafeError(error: unknown, code: string, logId?: string): void {
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code });
  const appError = error as AppError;
  expect(appError.details).toEqual(logId ? { log_id: logId } : undefined);
  const serialized = JSON.stringify(error);
  for (const sensitive of [
    "component-secret", "ticket-secret", "authorization-code",
    "refresh-token", "login-code", "openid-value", COMPONENT_TOKEN,
    AUTHORIZER_TOKEN,
  ]) {
    expect(serialized).not.toContain(sensitive);
  }
}
describe("DouyinOpenPlatformClient release operations", () => {
  test("uploads a template with the exact int64 digits and independently serialized fields", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      err_no: 0,
      err_msg: "",
      log_id: "upload-log",
    }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.uploadTemplateVersion({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      templateId: "9133504853504535288",
      extJson: {
        extEnable: true,
        extAppid: "authorizer-appid",
        ext: {
          deployment_key: "deployment-key",
          deployment_environment: "production",
        },
      },
      userDescription: "装修交付\"稳定版",
      userVersion: "1.2.3",
      tag: "1",
    })).resolves.toEqual({ logId: "upload-log" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v1/package_version/upload/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
    });
    const body = fetch.mock.calls[0]?.[1]?.body;
    expect(body).toBe(
      "{\"ext_json\":\"{\\\"extEnable\\\":true,\\\"extAppid\\\":\\\"authorizer-appid\\\",\\\"ext\\\":{\\\"deployment_key\\\":\\\"deployment-key\\\",\\\"deployment_environment\\\":\\\"production\\\"}}\",\"template_id\":9133504853504535288,\"user_desc\":\"装修交付\\\"稳定版\",\"user_version\":\"1.2.3\",\"tag\":\"1\"}",
    );
    expect(body).not.toContain('"template_id":"9133504853504535288"');
  });

  test("rejects unsafe template IDs before making a request", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}));
    const client = new DouyinOpenPlatformClient({ fetch });

    for (const templateId of ["0", "01", "-1", "1.5", "91335048535045352880"]) {
      await expect(client.uploadTemplateVersion({
        authorizerAccessToken: AUTHORIZER_TOKEN,
        appId: "authorizer-appid",
        templateId,
        extJson: {
          extEnable: true,
          extAppid: "authorizer-appid",
          ext: {
            deployment_key: "deployment-key",
            deployment_environment: "production",
          },
        },
        userDescription: "description",
        userVersion: "1.2.3",
      })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_ID_INVALID" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  test("rejects unsupported tags and unsafe extJson before making a request", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}));
    const client = new DouyinOpenPlatformClient({ fetch });
    const validInput = {
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      templateId: "9133504853504535288",
      extJson: {
        extEnable: true as const,
        extAppid: "authorizer-appid",
        ext: {
          deployment_key: "deployment-key",
          deployment_environment: "production" as const,
        },
      },
      userDescription: "description",
      userVersion: "1.2.3",
    };

    await expect(client.uploadTemplateVersion({
      ...validInput,
      tag: "unsupported" as "1",
    })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_UPLOAD_INPUT_INVALID" });
    await expect(client.uploadTemplateVersion({
      ...validInput,
      extJson: { ...validInput.extJson, extAppid: "another-appid" },
    })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_EXT_JSON_INVALID" });
    await expect(client.uploadTemplateVersion({
      ...validInput,
      extJson: {
        ...validInput.extJson,
        secret: "must-never-be-serialized",
      } as typeof validInput.extJson,
    })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_EXT_JSON_INVALID" });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("requests the latest test QR code with the exact official request", async () => {
    const signedQrUrl = "https://p3.douyinpic.com/qr-code?signature=abc#preview";
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      err_no: 0,
      err_msg: "",
      log_id: "qr-log",
      data: { qr_code_url: signedQrUrl },
    }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.getTestQrCode({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
    })).resolves.toEqual({
      qrCodeUrl: signedQrUrl,
      logId: "qr-log",
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v2/basic_info/get_qr_code/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ version: "latest", path: "pages/home/index" }),
    });
  });

  test("requests an audit QR code with the exact official stage", async () => {
    const signedQrUrl = "https://p3.douyinpic.com/audit-qr-code?signature=abc";
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      err_no: 0,
      err_msg: "",
      log_id: "audit-qr-log",
      data: { qr_code_url: signedQrUrl },
    }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.getTestQrCode({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      version: "audit",
    })).resolves.toEqual({
      qrCodeUrl: signedQrUrl,
      logId: "audit-qr-log",
    });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ version: "audit", path: "pages/home/index" }),
    });
  });

  test("rejects non-HTTPS, credentialed, and overlong QR URLs", async () => {
    for (const qrCodeUrl of [
      "http://example.test/qr-code",
      "https://user:password@example.test/qr-code",
      `https://example.test/${"a".repeat(2049)}`,
    ]) {
      const client = new DouyinOpenPlatformClient({
        fetch: async (_input, _init) => jsonResponse({
          err_no: 0,
          log_id: "qr-log",
          data: { qr_code_url: qrCodeUrl },
        }),
      });
      await expect(client.getTestQrCode({
        authorizerAccessToken: AUTHORIZER_TOKEN,
        appId: "authorizer-appid",
      })).rejects.toMatchObject({ code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID" });
    }
  });

  test("gets available audit hosts and submits only those hosts", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        err_no: 0,
        err_msg: "",
        log_id: "hosts-log",
        data: {
          host_names: ["toutiao", "douyin"],
          released_host_names: ["douyin"],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ err_no: 0, err_msg: "", log_id: "audit-log" }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.getAvailableAuditHosts({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
    })).resolves.toEqual({
      hostNames: ["toutiao", "douyin"],
      releasedHostNames: ["douyin"],
      logId: "hosts-log",
    });
    await expect(client.submitVersionAudit({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
      hostNames: ["toutiao", "douyin"],
      auditNote: "装修模板首版提审",
    })).resolves.toEqual({ logId: "audit-log" });

    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v1/package_version/get_audit_hosts/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
    });
    expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(fetch.mock.calls[1]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v2/package_version/audit/",
    );
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        host_names: ["toutiao", "douyin"],
        audit_note: "装修模板首版提审",
      }),
    });
  });

  test("rejects empty, duplicate and unbounded audit host lists before submitting", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}));
    const client = new DouyinOpenPlatformClient({ fetch });

    for (const hostNames of [
      [],
      ["douyin", "douyin"],
      Array.from({ length: 21 }, (_value, index) => `host-${index}`),
    ]) {
      await expect(client.submitVersionAudit({
        authorizerAccessToken: AUTHORIZER_TOKEN,
        appId: "authorizer-appid",
        hostNames,
        auditNote: "装修模板首版提审",
      })).rejects.toMatchObject({ code: "DOUYIN_AUDIT_HOSTS_INVALID" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  test("maps only allowlisted version metadata and releases without a request body", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        err_no: 0,
        err_msg: "",
        log_id: "versions-log",
        data: {
          audit: {
            version: "1.2.3",
            summary: "装修交付版",
            status: 1,
            has_audit: 1,
            has_publish: 0,
            ctime: 1_721_234_567,
            reason: "",
            developer: "sensitive-developer",
            avatar: "https://example.test/avatar",
            uid: "sensitive-uid",
            attachInfo: { token: "sensitive-token" },
          },
          current: { version: "1.2.2", status: "released", has_publish: 1 },
          latest: { version: "1.2.3", status: 1 },
          gray: { version: "1.2.1", status: "gray" },
          unexpected: "discard-me",
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ err_no: 0, err_msg: "", log_id: "release-log" }));
    const client = new DouyinOpenPlatformClient({ fetch });

    const versions = await client.getVersionList({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
    });
    expect(versions).toEqual({
      audit: {
        version: "1.2.3",
        summary: "装修交付版",
        status: 1,
        hasAudit: true,
        hasPublish: false,
        createdAt: 1_721_234_567,
        reason: "",
      },
      current: { version: "1.2.2", status: "released", hasPublish: true },
      latest: { version: "1.2.3", status: 1 },
      gray: { version: "1.2.1", status: "gray" },
      logId: "versions-log",
    });
    expect(JSON.stringify(versions)).not.toContain("sensitive");
    await expect(client.releaseVersion({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
    })).resolves.toEqual({ logId: "release-log" });

    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v1/package_version/versions/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
    });
    expect(fetch.mock.calls[1]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v1/package_version/release/",
    );
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
    });
    expect(fetch.mock.calls[1]?.[1]?.body).toBeUndefined();
  });

  test("strictly validates release responses and exposes only log_id", async () => {
    const fixtures = [
      {
        method: "uploadTemplateVersion" as const,
        body: { err_no: 0, err_msg: "", data: { token: "sensitive-token" } },
      },
      {
        method: "getTestQrCode" as const,
        body: { err_no: 0, log_id: "qr-invalid", data: { qr_code_url: "not-a-url" } },
      },
      {
        method: "getAvailableAuditHosts" as const,
        body: { err_no: 0, log_id: "hosts-invalid", data: { host_names: "not-an-array" } },
      },
      {
        method: "getVersionList" as const,
        body: { err_no: 0, log_id: "versions-invalid", data: { audit: { status: 1 } } },
      },
      {
        method: "submitVersionAudit" as const,
        body: { err_no: 0, err_msg: "" },
      },
      {
        method: "releaseVersion" as const,
        body: { err_no: 0, err_msg: "" },
      },
    ];

    for (const fixture of fixtures) {
      const client = new DouyinOpenPlatformClient({
        fetch: async (_input, _init) => jsonResponse(fixture.body),
      });
      let caught: unknown;
      try {
        if (fixture.method === "uploadTemplateVersion") {
          await client.uploadTemplateVersion({
            authorizerAccessToken: AUTHORIZER_TOKEN,
            appId: "authorizer-appid",
            templateId: "9133504853504535288",
            extJson: {
              extEnable: true,
              extAppid: "authorizer-appid",
              ext: {
                deployment_key: "deployment-key",
                deployment_environment: "production",
              },
            },
            userDescription: "description",
            userVersion: "1.2.3",
          });
        } else if (fixture.method === "getTestQrCode") {
          await client.getTestQrCode({ authorizerAccessToken: AUTHORIZER_TOKEN, appId: "authorizer-appid" });
        } else if (fixture.method === "getAvailableAuditHosts") {
          await client.getAvailableAuditHosts({ authorizerAccessToken: AUTHORIZER_TOKEN, appId: "authorizer-appid" });
        } else if (fixture.method === "submitVersionAudit") {
          await client.submitVersionAudit({
            authorizerAccessToken: AUTHORIZER_TOKEN,
            appId: "authorizer-appid",
            hostNames: ["douyin"],
            auditNote: "装修模板首版提审",
          });
        } else if (fixture.method === "releaseVersion") {
          await client.releaseVersion({ authorizerAccessToken: AUTHORIZER_TOKEN, appId: "authorizer-appid" });
        } else {
          await client.getVersionList({ authorizerAccessToken: AUTHORIZER_TOKEN, appId: "authorizer-appid" });
        }
      } catch (error) {
        caught = error;
      }
      expectSafeError(
        caught,
        "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
        "log_id" in fixture.body ? fixture.body.log_id : undefined,
      );
    }
  });

  test("refreshes an expired authorizer token once for release operations", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        err_no: 28_001_008,
        err_msg: "expired authorizer-token-value",
        log_id: "expired-release-log",
      }))
      .mockResolvedValueOnce(jsonResponse({ err_no: 0, err_msg: "", log_id: "release-log" }));
    const retryAccessToken = mock(async () => "refreshed-authorizer-token");
    const client = new DouyinOpenPlatformClient({ fetch, retryAccessToken });

    await expect(client.releaseVersion({
      authorizerAccessToken: AUTHORIZER_TOKEN,
      appId: "authorizer-appid",
    })).resolves.toEqual({ logId: "release-log" });
    expect(retryAccessToken).toHaveBeenCalledTimes(1);
    expect(retryAccessToken).toHaveBeenCalledWith({ appId: "authorizer-appid" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({
      "access-token": "refreshed-authorizer-token",
    });
  });

  test("never exposes an unsafe provider log_id", async () => {
    const sensitiveLogId = `unsafe-${AUTHORIZER_TOKEN}`;
    const client = new DouyinOpenPlatformClient({
      fetch: async (_input, _init) => jsonResponse({
        err_no: 40_001,
        err_msg: "failed",
        log_id: sensitiveLogId,
      }),
    });
    let caught: unknown;
    try {
      await client.releaseVersion({
        authorizerAccessToken: AUTHORIZER_TOKEN,
        appId: "authorizer-appid",
      });
    } catch (error) {
      caught = error;
    }
    expectSafeError(caught, "DOUYIN_OPEN_PLATFORM_API_ERROR");
    expect(JSON.stringify(caught)).not.toContain(sensitiveLogId);
  });
});
