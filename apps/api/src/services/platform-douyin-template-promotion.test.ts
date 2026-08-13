import { describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type {
  TemplateAppListResult,
  TemplateListResult,
} from "@/gateways/douyin-open-platform/template-client";
import type { DouyinMiniappReleaseRecord } from
  "@/repositories/douyin-miniapp-releases";
import type { AuthContext } from "@/services/authorization";
import type { PlatformDouyinMiniappReleaseUploadInput } from
  "./platform-douyin-miniapp-releases";
import { PlatformDouyinTemplatePromotionService } from
  "./platform-douyin-template-promotion";

const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const TEMPLATE_APP_ID = "tt0d647bd99301341b01";
const authContext = {
  isPlatformAdmin: true,
  isPlatformStaff: false,
  tenantId: null,
  employeeId: "11111111-1111-4111-8111-111111111111",
  permissions: [],
};
const draft = {
  templateAppId: TEMPLATE_APP_ID,
  appName: "鹅班长装企管家",
  version: "0.1.4",
  description: "收紧工地卡片并修复项目配置",
  createdAt: 1_786_608_000,
  draftId: "1024",
};
const template = {
  templateId: "77596",
  version: draft.version,
  description: draft.description,
  createdAt: 1_786_608_100,
};

function createHarness() {
  const accessPolicy = {
    assertPermission: mock((): "all" | null => "all"),
  };
  const accessTokens = {
    getComponentAccessToken: mock(async () => "component-access-token"),
  };
  const gateway = {
    listTemplateApps: mock(async (): Promise<TemplateAppListResult> => ({
      items: [draft],
      logId: "apps-log",
    })),
    listTemplates: mock(async (): Promise<TemplateListResult> => ({
      items: [],
      logId: "before-log",
    })),
    addTemplate: mock(async () => ({ logId: "add-log" })),
  };
  const release: DouyinMiniappReleaseRecord = {
    id: "33333333-3333-4333-8333-333333333333",
    installation_id: INSTALLATION_ID,
    template_id: template.templateId,
    template_version: template.version,
    description: template.description,
    channel: "default",
    ext_json: {
      extEnable: true,
      extAppid: "ttd033a68e4e56ccd301",
      ext: { deployment_key: "tenant-a" },
    },
    status: "uploaded",
    douyin_log_id: "upload-log",
    test_qr_url: null,
    audit_host_names: [],
    audit_note: null,
    audit_result: null,
    submitted_at: null,
    audited_at: null,
    released_at: null,
    platform_operator_id: authContext.employeeId,
    created_at: "2026-08-13T08:00:00.000Z",
    updated_at: "2026-08-13T08:00:00.000Z",
  };
  const testing: DouyinMiniappReleaseRecord = {
    ...release,
    status: "testing",
    test_qr_url: "https://p3.douyinpic.com/qr-code",
  };
  const releases = {
    upload: mock(async (
      _auth: AuthContext,
      _installationId: string,
      _input: PlatformDouyinMiniappReleaseUploadInput,
    ): Promise<DouyinMiniappReleaseRecord> => release),
    getTestQr: mock(async (
      _auth: AuthContext,
      _installationId: string,
      _releaseId: string,
    ): Promise<DouyinMiniappReleaseRecord> => testing),
  };
  const service = new PlatformDouyinTemplatePromotionService({
    accessPolicy,
    accessTokens,
    gateway,
    releases,
    templateAppId: TEMPLATE_APP_ID,
  } as never);
  return { service, accessPolicy, accessTokens, gateway, releases, release, testing };
}

describe("PlatformDouyinTemplatePromotionService", () => {
  test("promotes the exact latest template-app draft and returns a merchant test QR release", async () => {
    const harness = createHarness();
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [], logId: "before-log" })
      .mockResolvedValueOnce({ items: [template], logId: "after-log" });

    await expect(harness.service.promoteLatest(authContext as never, INSTALLATION_ID, {
      channel: "default",
    })).resolves.toEqual(harness.testing);

    expect(harness.gateway.addTemplate).toHaveBeenCalledWith({
      componentAccessToken: "component-access-token",
      draftId: draft.draftId,
    });
    expect(harness.releases.upload).toHaveBeenCalledWith(authContext, INSTALLATION_ID, {
      template_id: template.templateId,
      template_version: draft.version,
      description: draft.description,
      channel: "default",
    });
    expect(harness.releases.getTestQr).toHaveBeenCalledWith(
      authContext,
      INSTALLATION_ID,
      harness.release.id,
    );
  });

  test("reuses one exact existing template without adding the draft again", async () => {
    const harness = createHarness();
    harness.gateway.listTemplates.mockResolvedValue({
      items: [template],
      logId: "templates-log",
    });

    await harness.service.promoteLatest(authContext as never, INSTALLATION_ID, {
      channel: "1",
    });

    expect(harness.gateway.addTemplate).not.toHaveBeenCalled();
    expect(harness.gateway.listTemplates).toHaveBeenCalledTimes(1);
    expect(harness.releases.upload.mock.calls[0]?.[2]).toMatchObject({
      template_id: template.templateId,
      channel: "1",
    });
  });

  test("does not reuse matching metadata from a template older than the latest draft", async () => {
    const harness = createHarness();
    const staleTemplate = {
      ...template,
      templateId: "77595",
      createdAt: draft.createdAt,
    };
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [staleTemplate], logId: "before-log" })
      .mockResolvedValueOnce({ items: [staleTemplate, template], logId: "after-log" });

    await harness.service.promoteLatest(authContext as never, INSTALLATION_ID, {
      channel: "default",
    });

    expect(harness.gateway.addTemplate).toHaveBeenCalledTimes(1);
    expect(harness.releases.upload.mock.calls[0]?.[2]).toMatchObject({
      template_id: template.templateId,
    });
  });

  test("recovers a provider timeout when the exact template appears afterward", async () => {
    const harness = createHarness();
    harness.gateway.addTemplate.mockRejectedValue(
      Errors.business(502, "抖音开放平台请求超时", "DOUYIN_OPEN_PLATFORM_TIMEOUT"),
    );
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [], logId: "before-log" })
      .mockResolvedValueOnce({ items: [template], logId: "recovery-log" });

    await expect(harness.service.promoteLatest(authContext as never, INSTALLATION_ID, {
      channel: "default",
    })).resolves.toEqual(harness.testing);
    expect(harness.releases.upload).toHaveBeenCalledTimes(1);
  });

  test("rejects missing draft metadata and ambiguous matching templates", async () => {
    const missingDraft = createHarness();
    missingDraft.gateway.listTemplateApps.mockResolvedValue({
      items: [{ templateAppId: TEMPLATE_APP_ID, appName: "鹅班长装企管家" }],
      logId: "apps-log",
    });
    await expect(missingDraft.service.promoteLatest(authContext as never, INSTALLATION_ID, {
      channel: "default",
    })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_DRAFT_NOT_READY" });
    expect(missingDraft.releases.upload).not.toHaveBeenCalled();

    const ambiguous = createHarness();
    ambiguous.gateway.listTemplates.mockResolvedValue({
      items: [template, { ...template, templateId: "77597" }],
      logId: "templates-log",
    });
    await expect(ambiguous.service.promoteLatest(authContext as never, INSTALLATION_ID, {
      channel: "default",
    })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_MATCH_AMBIGUOUS" });
    expect(ambiguous.gateway.addTemplate).not.toHaveBeenCalled();
    expect(ambiguous.releases.upload).not.toHaveBeenCalled();
  });

  test("requires a platform operator with the Douyin management permission", async () => {
    const harness = createHarness();
    harness.accessPolicy.assertPermission.mockReturnValue(null);

    await expect(harness.service.promoteLatest(authContext as never, INSTALLATION_ID, {
      channel: "default",
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.accessTokens.getComponentAccessToken).not.toHaveBeenCalled();
  });
});
