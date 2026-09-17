import { beforeAll, describe, expect, test } from "bun:test";
import { blockedReadiness, deployableTemplate, EMPLOYEE_ID, fixture,
  initializeReleaseService, INSTALLATION_ID, OTHER_INSTALLATION_ID, release, RELEASE_ID,
  selectedTemplate, TENANT_ID, tenantContext } from "./releases.fixture";

beforeAll(initializeReleaseService);

describe("TenantDouyinMiniappReleasesService", () => {
  test("lists only sanitized releases with bounded pagination", async () => {
    const context = fixture();

    const result = await context.service.list(
      tenantContext(["douyin_miniapp.read"]),
      { page: 1, pageSize: 20 },
    );

    expect(context.releases.listByInstallation).toHaveBeenCalledWith({
      installationId: INSTALLATION_ID,
      page: 1,
      pageSize: 20,
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(result.list[0]).not.toHaveProperty("ext_json");
    expect(result.list[0]).not.toHaveProperty("douyin_log_id");
    expect(result.list[0]).not.toHaveProperty("platform_operator_id");
  });

  test("lists actionable versions and sanitized history", async () => {
    const context = fixture({ latestRelease: release() });

    const result = await context.service.listOptions(
      tenantContext(["douyin_miniapp.read"]),
      { page: 1, pageSize: 20 },
    );

    expect(result.provider_state).toBe("fresh");
    expect(result.list[0]).toMatchObject({
      source: "confirmed_template", actions: ["create_test_version"],
    });
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(JSON.stringify(result.history)).not.toMatch(
      /ext_json|douyin_log_id|platform_operator_id|provider_summary/,
    );
  });

  test("keeps local history available when provider version loading fails", async () => {
    const context = fixture();
    context.gateway.getVersionList.mockRejectedValue(new Error("provider unavailable"));

    const result = await context.service.listOptions(
      tenantContext(["douyin_miniapp.read"]),
      { page: 1, pageSize: 20 },
    );

    expect(result.provider_state).toBe("unavailable");
    expect(result.provider_message).toBeTruthy();
    expect(result.history).toHaveLength(1);
  });

  test("rejects invalid options pagination before repository access", async () => {
    const context = fixture();

    await expect(context.service.listOptions(
      tenantContext(["douyin_miniapp.read"]),
      { page: 1, pageSize: 101 },
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(context.releases.listByInstallation).not.toHaveBeenCalled();
  });

  test("rejects a release owned by another tenant", async () => {
    const context = fixture({
      foundRelease: release({ installation_id: OTHER_INSTALLATION_ID }),
    });

    await expect(context.service.getTestQr(
      tenantContext(["douyin_miniapp.manage"]),
      RELEASE_ID,
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "DOUYIN_RELEASE_NOT_FOUND",
    });
    expect(context.operations.getTestQr).not.toHaveBeenCalled();
  });

  test("allows tenant audit submit with its dedicated permission", async () => {
    const context = fixture();
    const input = {
      host_names: ["douyin.com"],
      audit_note: "装修行业租户联调版本",
    };

    await context.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      input,
    );

    expect(context.operations.submitAudit).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      expect.objectContaining({ id: RELEASE_ID }),
      EMPLOYEE_ID,
      input,
    );
    expect(context.readiness.evaluateTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ["douyin.com"],
    );
  });

  test("blocks audit submit when release readiness still has blockers", async () => {
    const context = fixture();
    context.readiness.evaluateTenant.mockResolvedValue(blockedReadiness);

    await expect(context.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_RELEASE_NOT_READY",
      details: { blocker_codes: ["BUDGET_PRICING_MISSING"] },
    });
    expect(context.operations.submitAudit).not.toHaveBeenCalled();
  });

  test("creates a test version from the server-owned current template", async () => {
    const context = fixture();

    const result = await context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
      selectedTemplate,
    );

    expect(context.templates.findCurrent).toHaveBeenCalledWith("default");
    expect(context.operations.upload).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      EMPLOYEE_ID,
      {
        template_id: deployableTemplate.template_id,
        template_version: deployableTemplate.template_version,
        description: deployableTemplate.description,
        channel: "default",
      },
    );
    expect(context.operations.getTestQr).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      expect.objectContaining({
        id: "77777777-7777-4777-8777-777777777777",
      }),
      EMPLOYEE_ID,
    );
    expect(result).not.toHaveProperty("ext_json");
  });

  test("publishes only an owned release with the production permission", async () => {
    const context = fixture({
      foundRelease: release({ status: "audit_approved" }),
    });

    await context.service.publish(
      tenantContext(["douyin_miniapp.publish"]),
      RELEASE_ID,
    );

    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(),
      "douyin_miniapp.publish",
    );
    expect(context.operations.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      expect.objectContaining({ id: RELEASE_ID, status: "audit_approved" }),
      EMPLOYEE_ID,
    );
  });

  test("rejects creating a test version before platform confirms a template", async () => {
    const context = fixture();
    context.templates.findCurrent.mockResolvedValue(null);

    await expect(context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
      {
        expected_template_record_id: deployableTemplate.id,
        expected_template_id: "78149",
      },
    )).rejects.toMatchObject({
      code: "DOUYIN_DEPLOYABLE_TEMPLATE_NOT_FOUND",
    });
    expect(context.operations.upload).not.toHaveBeenCalled();
  });

  test("rejects a stale selected template before uploading", async () => {
    const context = fixture();

    await expect(context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
      {
        expected_template_record_id: "88888888-8888-4888-8888-888888888888",
        expected_template_id: deployableTemplate.template_id,
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_DEPLOYABLE_TEMPLATE_CHANGED",
    });
    expect(context.operations.upload).not.toHaveBeenCalled();
  });

  test("allows a confirmed same-version package revision", async () => {
    const context = fixture({
      latestRelease: release({
        template_id: "77595",
        template_version: deployableTemplate.template_version,
        status: "testing",
      }),
    });

    await context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
      selectedTemplate,
    );

    expect(context.operations.upload).toHaveBeenCalledWith(
      expect.anything(),
      INSTALLATION_ID,
      EMPLOYEE_ID,
      expect.objectContaining({ template_id: deployableTemplate.template_id }),
    );
  });

  test("rejects a current template version that is not newer than the latest release", async () => {
    const context = fixture({
      latestRelease: release({
        status: "audit_rejected",
        template_id: "77595",
        template_version: "0.1.3",
        description: "较新的审核记录",
      }),
    });
    context.templates.findCurrent.mockResolvedValue({
      ...deployableTemplate,
      template_id: "78149",
      template_version: "0.1.2",
      description: "旧模板误设为当前",
    });

    await expect(context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
      {
        expected_template_record_id: deployableTemplate.id,
        expected_template_id: "78149",
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_DEPLOYABLE_TEMPLATE_VERSION_NOT_NEW",
    });
    expect(context.operations.upload).not.toHaveBeenCalled();
  });

  test("recovers the tenant's created release before starting a newer template", async () => {
    const createdRelease = release({
      status: "created",
      template_id: deployableTemplate.template_id,
      template_version: deployableTemplate.template_version,
      description: deployableTemplate.description,
    });
    const context = fixture({
      latestRelease: createdRelease,
      foundRelease: createdRelease,
    });

    await context.service.createFromCurrentTemplate(
      tenantContext(["douyin_miniapp.manage"]),
      selectedTemplate,
    );

    expect(context.operations.upload).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSTALLATION_ID }),
      INSTALLATION_ID,
      EMPLOYEE_ID,
      {
        template_id: createdRelease.template_id,
        template_version: createdRelease.template_version,
        description: createdRelease.description,
        channel: createdRelease.channel,
      },
    );
    expect(context.releases.findById).toHaveBeenCalledWith(createdRelease.id);
    expect(context.templates.findCurrent).toHaveBeenCalledWith("default");
  });

  test("allows a confirmed newer template to replace uploaded or testing builds", async () => {
    for (const status of ["uploaded", "testing"] as const) {
      const context = fixture({ latestRelease: release({ status }) });

      await context.service.createFromCurrentTemplate(
        tenantContext(["douyin_miniapp.manage"]),
        selectedTemplate,
      );

      expect(context.operations.upload).toHaveBeenCalledWith(
        expect.objectContaining({ id: INSTALLATION_ID }),
        INSTALLATION_ID,
        EMPLOYEE_ID,
        {
          template_id: deployableTemplate.template_id,
          template_version: deployableTemplate.template_version,
          description: deployableTemplate.description,
          channel: "default",
        },
      );
    }
  });

  test("does not replace audit-submitted release states with a newer template", async () => {
    for (const status of ["audit_pending", "audit_approved"] as const) {
      const context = fixture({ latestRelease: release({ status }) });

      await expect(context.service.createFromCurrentTemplate(
        tenantContext(["douyin_miniapp.manage"]),
        selectedTemplate,
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "DOUYIN_TENANT_RELEASE_IN_PROGRESS",
      });
      expect(context.operations.upload).not.toHaveBeenCalled();
    }
  });

  test("requires published profile and a test QR before audit submit", async () => {
    const unpublished = fixture({ profile: { status: "draft" } });
    await expect(unpublished.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      code: "DOUYIN_TENANT_AUDIT_PREFLIGHT_INCOMPLETE",
    });

    const noQr = fixture({
      foundRelease: release({ test_qr_url: null, latest_test_qr_url: null }),
    });
    await expect(noQr.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      code: "DOUYIN_TENANT_AUDIT_PREFLIGHT_INCOMPLETE",
    });

    const expiredQr = fixture({
      foundRelease: release({
        test_qr_url:
          "https://p3-developer-sign.bytemaimg.com/test.jpeg?x-expires=1",
        latest_test_qr_url:
          "https://p3-developer-sign.bytemaimg.com/test.jpeg?x-expires=1",
      }),
    });
    await expect(expiredQr.service.submitAudit(
      tenantContext(["douyin_miniapp.audit.submit"]),
      RELEASE_ID,
      { host_names: ["douyin.com"], audit_note: "审核说明" },
    )).rejects.toMatchObject({
      code: "DOUYIN_TENANT_AUDIT_PREFLIGHT_INCOMPLETE",
    });
  });

  test("uses distinct permissions for preview, audit, and sync", async () => {
    const preview = fixture();
    await preview.service.getTestQr(
      tenantContext(["douyin_miniapp.manage"]),
      RELEASE_ID,
    );
    expect(preview.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(),
      "douyin_miniapp.manage",
    );

    const sync = fixture();
    await sync.service.syncStatus(
      tenantContext(["douyin_miniapp.manage"]),
      RELEASE_ID,
    );
    expect(sync.operations.syncStatus).toHaveBeenCalledTimes(1);
  });
});
