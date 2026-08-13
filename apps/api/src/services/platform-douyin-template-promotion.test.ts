import { describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type {
  TemplateAppListResult,
  TemplateListResult,
} from "@/gateways/douyin-open-platform/template-client";
import type { AuthContext } from "@/services/authorization";
import { PlatformDouyinTemplatePromotionService } from
  "./platform-douyin-template-promotion";

const TEMPLATE_APP_ID = "tt0d647bd99301341b01";
const OPERATOR_ID = "11111111-1111-4111-8111-111111111111";
const authContext = {
  isPlatformAdmin: true,
  isPlatformStaff: false,
  tenantId: null,
  employeeId: OPERATOR_ID,
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
const providerTemplate = {
  templateId: "77596",
  version: draft.version,
  description: draft.description,
  createdAt: 1_786_608_100,
};
const currentTemplate = {
  id: "22222222-2222-4222-8222-222222222222",
  template_app_id: "tt0d647bd99301341b01" as const,
  source_draft_id: draft.draftId,
  template_id: providerTemplate.templateId,
  template_version: providerTemplate.version,
  description: providerTemplate.description,
  channel: "default" as const,
  is_current: true,
  confirmed_by_employee_id: OPERATOR_ID,
  confirmed_at: "2026-08-13T08:00:00.000Z",
  created_at: "2026-08-13T08:00:00.000Z",
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
  const templates = {
    findCurrent: mock(async () => null as typeof currentTemplate | null),
    confirm: mock(async (_input: unknown) => currentTemplate),
  };
  const service = new PlatformDouyinTemplatePromotionService({
    accessPolicy,
    accessTokens,
    gateway,
    templates,
    templateAppId: TEMPLATE_APP_ID,
  } as never);
  return { service, accessPolicy, accessTokens, gateway, templates };
}

describe("PlatformDouyinTemplatePromotionService", () => {
  test("reports the latest provider draft and current confirmed template", async () => {
    const harness = createHarness();
    harness.templates.findCurrent.mockResolvedValue(currentTemplate);

    await expect(harness.service.getStatus(authContext as never, {
      channel: "default",
    })).resolves.toEqual({
      template_app_id: TEMPLATE_APP_ID,
      latest_draft: {
        version: draft.version,
        description: draft.description,
        created_at: draft.createdAt,
      },
      current_template: currentTemplate,
      is_latest_confirmed: true,
    });
  });

  test("promotes and atomically confirms the exact latest template-app draft", async () => {
    const harness = createHarness();
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [], logId: "before-log" })
      .mockResolvedValueOnce({ items: [providerTemplate], logId: "after-log" });

    await expect(harness.service.confirmLatest(authContext as never, {
      channel: "default",
    })).resolves.toEqual(currentTemplate);

    expect(harness.gateway.addTemplate).toHaveBeenCalledWith({
      componentAccessToken: "component-access-token",
      draftId: draft.draftId,
    });
    expect(harness.templates.confirm).toHaveBeenCalledWith({
      templateAppId: TEMPLATE_APP_ID,
      sourceDraftId: draft.draftId,
      templateId: providerTemplate.templateId,
      templateVersion: draft.version,
      description: draft.description,
      channel: "default",
      actorEmployeeId: OPERATOR_ID,
    });
  });

  test("returns the current template when the latest draft is already confirmed", async () => {
    const harness = createHarness();
    harness.templates.findCurrent.mockResolvedValue(currentTemplate);

    await expect(harness.service.confirmLatest(authContext as never, {
      channel: "default",
    })).resolves.toEqual(currentTemplate);

    expect(harness.gateway.addTemplate).not.toHaveBeenCalled();
    expect(harness.gateway.listTemplates).not.toHaveBeenCalled();
    expect(harness.templates.confirm).not.toHaveBeenCalled();
  });

  test("selects only the exact template added after the current draft confirmation", async () => {
    const harness = createHarness();
    const newlyAdded = { ...providerTemplate, templateId: "77597" };
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [providerTemplate], logId: "before-log" })
      .mockResolvedValueOnce({
        items: [providerTemplate, newlyAdded],
        logId: "after-log",
      });

    await harness.service.confirmLatest(authContext as never, {
      channel: "default",
    });

    expect(harness.gateway.addTemplate).toHaveBeenCalledTimes(1);
    expect(harness.templates.confirm.mock.calls[0]?.[0]).toMatchObject({
      templateId: newlyAdded.templateId,
    });
  });

  test("does not reuse matching metadata from a template as old as the draft", async () => {
    const harness = createHarness();
    const staleTemplate = {
      ...providerTemplate,
      templateId: "77595",
      createdAt: draft.createdAt,
    };
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [staleTemplate], logId: "before-log" })
      .mockResolvedValueOnce({
        items: [staleTemplate, providerTemplate],
        logId: "after-log",
      });

    await harness.service.confirmLatest(authContext as never, {
      channel: "default",
    });

    expect(harness.gateway.addTemplate).toHaveBeenCalledTimes(1);
    expect(harness.templates.confirm.mock.calls[0]?.[0]).toMatchObject({
      templateId: providerTemplate.templateId,
    });
  });

  test("recovers a provider timeout when the exact template appears afterward", async () => {
    const harness = createHarness();
    harness.gateway.addTemplate.mockRejectedValue(
      Errors.business(
        502,
        "抖音开放平台请求超时",
        "DOUYIN_OPEN_PLATFORM_TIMEOUT",
      ),
    );
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [], logId: "before-log" })
      .mockResolvedValueOnce({
        items: [providerTemplate],
        logId: "recovery-log",
      });

    await expect(harness.service.confirmLatest(authContext as never, {
      channel: "default",
    })).resolves.toEqual(currentTemplate);
  });

  test("does not confirm a preexisting exact template after provider failure", async () => {
    const harness = createHarness();
    harness.gateway.addTemplate.mockRejectedValue(
      Errors.business(
        502,
        "抖音开放平台请求超时",
        "DOUYIN_OPEN_PLATFORM_TIMEOUT",
      ),
    );
    harness.gateway.listTemplates
      .mockResolvedValueOnce({ items: [providerTemplate], logId: "before-log" })
      .mockResolvedValueOnce({ items: [providerTemplate], logId: "after-log" });

    await expect(harness.service.confirmLatest(authContext as never, {
      channel: "default",
    })).rejects.toMatchObject({ code: "DOUYIN_OPEN_PLATFORM_TIMEOUT" });
    expect(harness.templates.confirm).not.toHaveBeenCalled();
  });

  test("rejects missing draft metadata and ambiguous matching templates", async () => {
    const missingDraft = createHarness();
    missingDraft.gateway.listTemplateApps.mockResolvedValue({
      items: [{ templateAppId: TEMPLATE_APP_ID, appName: "鹅班长装企管家" }],
      logId: "apps-log",
    });
    await expect(missingDraft.service.confirmLatest(authContext as never, {
      channel: "default",
    })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_DRAFT_NOT_READY" });
    expect(missingDraft.templates.confirm).not.toHaveBeenCalled();

    const ambiguous = createHarness();
    ambiguous.gateway.listTemplates
      .mockResolvedValueOnce({ items: [], logId: "before-log" })
      .mockResolvedValueOnce({
        items: [providerTemplate, { ...providerTemplate, templateId: "77597" }],
        logId: "after-log",
      });
    await expect(ambiguous.service.confirmLatest(authContext as never, {
      channel: "default",
    })).rejects.toMatchObject({ code: "DOUYIN_TEMPLATE_MATCH_AMBIGUOUS" });
    expect(ambiguous.gateway.addTemplate).toHaveBeenCalledTimes(1);
    expect(ambiguous.templates.confirm).not.toHaveBeenCalled();
  });

  test("requires a platform operator with the Douyin management permission", async () => {
    const harness = createHarness();
    harness.accessPolicy.assertPermission.mockReturnValue(null);

    await expect(harness.service.getStatus(authContext as never, {
      channel: "default",
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.accessTokens.getComponentAccessToken).not.toHaveBeenCalled();
  });

  test("rejects any configured template AppID other than the fixed development app", async () => {
    const harness = createHarness();
    const service = new PlatformDouyinTemplatePromotionService({
      accessPolicy: harness.accessPolicy,
      accessTokens: harness.accessTokens,
      gateway: harness.gateway,
      templates: harness.templates,
      templateAppId: "ttd033a68e4e56ccd301",
    } as never);

    await expect(service.getStatus(authContext as never, {
      channel: "default",
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(harness.accessTokens.getComponentAccessToken).not.toHaveBeenCalled();
  });
});
