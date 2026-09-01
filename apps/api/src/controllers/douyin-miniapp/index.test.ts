import { beforeAll, describe, expect, mock, test } from "bun:test";
import {
  DOUYIN_ENTRY_PATH_VALUES,
  DouyinEntryPathSchema as CanonicalDouyinEntryPathSchema,
} from "@gooes/domain";
import {
  DouyinLaunchContextSchema,
  DouyinMiniappQaRequestSchema,
  DouyinLeadRequestSchema,
  DouyinProjectListQuerySchema,
} from "@/schema/douyin-miniapp";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinMiniappController: typeof import(".").DouyinMiniappController;

beforeAll(async () => {
  ({ DouyinMiniappController } = await import("."));
});

const body = {
  app_id: "tt-authorizer-1",
  deployment_key: "deployment-public-key",
  code: "one-time-login-code",
  launch_context: {
    entry_path: "pages/case-detail/index",
    scene: "021001",
    source_type: "short_video",
    campaign_code: "summer-2026",
    content_id: "video-100",
  },
};

describe("DouyinMiniappController", () => {
  test("accepts every canonical cold-start path and rejects unknown fallbacks", () => {
    expect(DouyinLaunchContextSchema.shape.entry_path)
      .toBe(CanonicalDouyinEntryPathSchema);
    for (const entryPath of DOUYIN_ENTRY_PATH_VALUES) {
      expect(DouyinLaunchContextSchema.safeParse({
        ...body.launch_context,
        entry_path: entryPath,
      }).success).toBe(true);
    }
    expect(DouyinLaunchContextSchema.safeParse({
      ...body.launch_context,
      entry_path: "pages/admin/index",
    }).success).toBe(false);
  });

  test("registers the session route in the root registry", async () => {
    const source = await Bun.file(new URL("../../routes/index.ts", import.meta.url)).text();
    expect(source).toContain(
      'import DouyinMiniappController from "@/controllers/douyin-miniapp";',
    );
    expect(source).toContain("DouyinMiniappController.registerExtraRoutes(app);");
  });

  test("validates and dispatches the exact privacy-safe session request", async () => {
    const exchange = mock(async () => ({
      access_token: "gooes-jwt",
      expires_in: 7200,
      installation: { status: "active", template_version: "1.0.0" },
    }));
    const controller = new DouyinMiniappController({ exchange } as never);
    const routes: Array<{ method: string; path: string;
      handler: (request: unknown) => Promise<unknown> }> = [];
    controller.registerExtraRoutes({
      post: (path: string, handler: (request: unknown) => Promise<unknown>) =>
        routes.push({ method: "POST", path, handler }),
      get: (path: string, handler: (request: unknown) => Promise<unknown>) =>
        routes.push({ method: "GET", path, handler }),
    } as never);

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /douyin-mini/auth/session",
      "GET /douyin-mini/bootstrap",
      "GET /douyin-mini/company",
      "GET /douyin-mini/cases",
      "GET /douyin-mini/cases/:id",
      "GET /douyin-mini/sites",
      "GET /douyin-mini/sites/:id",
      "GET /douyin-mini/sites/:id/logs",
      "GET /douyin-mini/projects",
      "GET /douyin-mini/projects/:id",
      "GET /douyin-mini/projects/:id/logs",
      "GET /douyin-mini/material-notes",
      "GET /douyin-mini/material-notes/:id",
      "POST /douyin-mini/material-notes/:id/claim",
      "GET /douyin-mini/my-material-notes",
      "GET /douyin-mini/my-material-notes/:claimId",
      "POST /douyin-mini/my-material-notes/:claimId/remove",
      "POST /douyin-mini/my-material-notes/clear",
      "POST /douyin-mini/qa",
      "POST /douyin-mini/sms/send",
      "POST /douyin-mini/leads",
      "POST /douyin-mini/events",
    ]);
    await expect(routes[0]!.handler({ body })).resolves.toEqual({
      data: {
        access_token: "gooes-jwt",
        expires_in: 7200,
        installation: { status: "active", template_version: "1.0.0" },
      },
      message: "success",
    });
    expect(exchange).toHaveBeenCalledWith(body);
  });

  test("validates strict content queries and dispatches with the authenticated user", async () => {
    const listCases = mock(async () => ({ items: [], pagination: {
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    } }));
    const content = {
      bootstrap: mock(async () => ({})), company: mock(async () => ({})), listCases,
      getCase: mock(async () => ({})), listSites: mock(async () => ({})),
      getSite: mock(async () => ({})), listSiteLogs: mock(async () => ({})),
      listProjects: mock(async () => ({})), getProject: mock(async () => ({})),
      listProjectLogs: mock(async () => ({})),
    };
    const controller = new DouyinMiniappController(undefined, content as never);
    const user = { token_type: "douyin_miniapp", tenant_id:
      "33333333-3333-4333-8333-333333333333" };

    await expect(controller.listCases({ user, query: { style: "现代" } } as never))
      .resolves.toMatchObject({ data: { items: [] } });
    expect(listCases).toHaveBeenCalledWith(user, {
      page: 1, pageSize: 20, style: "现代",
    });
    await expect(controller.listCases({ user, query: { tenant_id:
      "44444444-4444-4444-8444-444444444444" } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    await expect(controller.listCases({ user, query: { pageSize: 101 } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
  });

  test("defines a strict bounded unified project query", () => {
    expect(DouyinProjectListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(DouyinProjectListQuerySchema.parse({ phase: "completed" }).phase)
      .toBe("completed");
    expect(() => DouyinProjectListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => DouyinProjectListQuerySchema.parse({ phase: "pending_start" })).toThrow();
    expect(() => DouyinProjectListQuerySchema.parse({ tenant_id:
      "44444444-4444-4444-8444-444444444444" })).toThrow();
  });

  test("validates unified project routes before dispatching to content service", async () => {
    const listProjects = mock(async () => ({ items: [], pagination: {
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    } }));
    const getProject = mock(async () => ({}));
    const listProjectLogs = mock(async () => ({}));
    const content = {
      bootstrap: mock(async () => ({})), company: mock(async () => ({})),
      listCases: mock(async () => ({})), getCase: mock(async () => ({})),
      listSites: mock(async () => ({})), getSite: mock(async () => ({})),
      listSiteLogs: mock(async () => ({})), listProjects, getProject, listProjectLogs,
    };
    const controller = new DouyinMiniappController(undefined, content as never);
    const user = { token_type: "douyin_miniapp", tenant_id:
      "33333333-3333-4333-8333-333333333333" };

    await controller.listProjects({ user, query: {
      phase: "completed", style: "现代", layout: "三室两厅",
    } } as never);
    expect(listProjects).toHaveBeenCalledWith(user, {
      page: 1, pageSize: 20, phase: "completed", style: "现代", layout: "三室两厅",
    });
    await controller.getProject({ user, params: { id:
      "11111111-1111-4111-8111-111111111111" } } as never);
    expect(getProject).toHaveBeenCalledWith(user,
      "11111111-1111-4111-8111-111111111111");
    await controller.listProjectLogs({ user, params: { id:
      "11111111-1111-4111-8111-111111111111" }, query: {} } as never);
    expect(listProjectLogs).toHaveBeenCalledWith(user,
      "11111111-1111-4111-8111-111111111111", { page: 1, pageSize: 20 });

    await expect(controller.listProjects({ user, query: { phase: "started" } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    await expect(controller.getProject({ user, params: { id: "not-a-uuid" } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    await expect(controller.listProjectLogs({ user, params: { id:
      "11111111-1111-4111-8111-111111111111" }, query: { pageSize: 101 } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(getProject).toHaveBeenCalledTimes(1);
    expect(listProjectLogs).toHaveBeenCalledTimes(1);
  });

  test("rejects forged tenant IDs and malformed launch attribution", async () => {
    for (const invalidBody of [
      { ...body, tenant_id: "33333333-3333-4333-8333-333333333333" },
      { ...body, launch_context: { ...body.launch_context, entry_path: "pages/admin/index" } },
      { ...body, code: "" },
    ]) {
      const exchange = mock(async () => ({}));
      const controller = new DouyinMiniappController({ exchange } as never);
      await expect(controller.createSession({ body: invalidBody } as never))
        .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
      expect(exchange).not.toHaveBeenCalled();
    }
  });

  test("strictly validates marketing bodies and passes trusted request metadata", async () => {
    const sendCode = mock(async () => ({ success: true, cooldown_seconds: 60 }));
    const publicAppointmentResult = {
      lead_id: "55555555-5555-4555-8555-555555555555",
      appointment_no: "DYLF-20260821-000001",
      already_submitted: false,
      existing_customer_linked: false,
      status: "pending_confirmation" as const,
      message: "量房申请已提交，工作人员将与你确认具体时间" as const,
    };
    const submitLead = mock(async () => publicAppointmentResult);
    const recordEvents = mock(async () => ({ accepted: 1 }));
    const controller = new DouyinMiniappController(undefined, undefined, {
      sendCode, submitLead, recordEvents,
    } as never);
    const user = { token_type: "douyin_miniapp", tenant_id:
      "33333333-3333-4333-8333-333333333333" };
    const attribution = body.launch_context;
    const log = { warn: mock(() => undefined) };
    const request = { user, ip: "127.0.0.1", headers: { "user-agent": "Douyin" }, log };

    await controller.sendLeadCode({ ...request, body: {
      phone: "13800000000", attribution,
    } } as never);
    expect(sendCode).toHaveBeenCalledWith(user, {
      phone: "13800000000", attribution,
    }, { requestIp: "127.0.0.1", userAgent: "Douyin", log });

    const leadBody = {
      name: "李先生", phone: "13800000000", sms_code: "123456",
      community: "晴天花园",
      preferred_visit_date: "2026-08-25",
      preferred_visit_period: "afternoon",
      budget_estimate_id: "22222222-2222-4222-8222-222222222222",
      privacy_policy_version: "2026-07-19",
      consented_at: "2026-07-19T10:00:00.000Z",
      idempotency_key: "44444444-4444-4444-8444-444444444444",
      attribution,
    };
    const invalidDate = DouyinLeadRequestSchema.safeParse({
      ...leadBody,
      preferred_visit_date: "2026-02-30",
    });
    expect(invalidDate.success).toBe(false);
    if (!invalidDate.success) {
      expect(invalidDate.error.issues[0]?.message).toBe("期望量房日期格式无效");
    }
    await expect(controller.submitLead({ ...request, body: leadBody } as never))
      .resolves.toEqual({ data: publicAppointmentResult, message: "success" });
    expect(submitLead).toHaveBeenCalledWith(user, leadBody,
      { requestIp: "127.0.0.1", userAgent: "Douyin", log });
    const { budget_estimate_id: _budgetEstimateId, ...leadWithoutEstimate } = leadBody;
    await controller.submitLead({ ...request, body: leadWithoutEstimate } as never);
    expect(submitLead).toHaveBeenLastCalledWith(user, leadWithoutEstimate,
      { requestIp: "127.0.0.1", userAgent: "Douyin", log });

    await expect(controller.submitLead({ ...request, body: {
      ...leadBody, tenant_id: "99999999-9999-4999-8999-999999999999",
    } } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    for (const invalidBody of [
      { ...leadBody, community: undefined },
      { ...leadBody, preferred_visit_date: undefined },
      { ...leadBody, preferred_visit_date: "2026-02-30" },
      { ...leadBody, preferred_visit_period: "noon" },
      { ...leadBody, budget_estimate_id: "not-a-uuid" },
    ]) {
      await expect(controller.submitLead({ ...request, body: invalidBody } as never))
        .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    }
    expect(submitLead).toHaveBeenCalledTimes(2);
    await expect(controller.recordEvents({ ...request, body: { events: [{
      event_name: "lead_submit_success", occurred_at: "2026-07-19T10:00:00.000Z",
      attribution,
    }] } } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    expect(recordEvents).not.toHaveBeenCalled();
  });

  test("validates decoration Q&A requests and dispatches with launch attribution", async () => {
    const ask = mock(async () => ({
      answer_points: ["量房前先确认装修范围、房屋现状和大致入住计划。"],
      suggested_questions: ["旧房翻新要先看哪些地方？"],
      disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
    }));
    const controller = new DouyinMiniappController(
      undefined,
      undefined,
      undefined,
      { ask } as never,
    );
    const user = { token_type: "douyin_miniapp", tenant_id:
      "33333333-3333-4333-8333-333333333333" };
    const requestBody = {
      question: "旧房翻新需要先看哪些地方？",
      attribution: body.launch_context,
    };

    await expect(controller.askQuestion({ user, body: requestBody } as never))
      .resolves.toEqual({
        data: {
          answer_points: ["量房前先确认装修范围、房屋现状和大致入住计划。"],
          suggested_questions: ["旧房翻新要先看哪些地方？"],
          disclaimer: "以上内容仅供装修沟通参考，具体方案以现场量房为准。",
        },
        message: "success",
      });
    expect(ask).toHaveBeenCalledWith(user, requestBody);

    for (const invalidBody of [
      { ...requestBody, question: "" },
      { ...requestBody, question: "x".repeat(121) },
      { ...requestBody, question: "旧房翻新", attribution: {
        ...body.launch_context,
        entry_path: "pages/admin/index",
      } },
      { ...requestBody, tenant_id: "33333333-3333-4333-8333-333333333333" },
    ]) {
      await expect(controller.askQuestion({ user, body: invalidBody } as never))
        .rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    }
    expect(ask).toHaveBeenCalledTimes(1);
  });

  test("validates and wraps all seven material note operations", async () => {
    const materialList = { list: [], pagination: {
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    } };
    const preview = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "开工清单",
      summary: "开工检查事项",
      category: "施工避坑",
      applicable_to: null,
      published_at: "2026-09-01T08:00:00.000Z",
      claimed: false,
    };
    const claimResult = {
      claim_id: "22222222-2222-4222-8222-222222222222",
      already_claimed: false,
      claimed_at: "2026-09-01T08:00:00.000Z",
      material: {
        id: preview.id,
        version: 1,
        title: preview.title,
        summary: preview.summary,
        category: preview.category,
        applicable_to: null,
        content_blocks: [],
      },
    };
    const listPublic = mock(async () => materialList);
    const getPublicPreview = mock(async () => preview);
    const claim = mock(async () => claimResult);
    const listOwned = mock(async () => materialList);
    const getOwnedDetail = mock(async () => ({
      claim_id: claimResult.claim_id,
      id: preview.id,
      version: 1,
      title: preview.title,
      summary: preview.summary,
      category: preview.category,
      applicable_to: null,
      claimed_at: claimResult.claimed_at,
      content_blocks: [],
    }));
    const remove = mock(async () => ({ removed: true }));
    const clear = mock(async () => ({ removed_count: 1 }));
    const controller = new DouyinMiniappController(
      undefined,
      undefined,
      undefined,
      undefined,
      { listPublic, getPublicPreview, claim, listOwned, getOwnedDetail, remove, clear } as never,
    );
    const user = { token_type: "douyin_miniapp", tenant_id:
      "33333333-3333-4333-8333-333333333333" };
    const noteId = preview.id;
    const claimId = claimResult.claim_id;

    await expect(controller.listMaterialNotes({ user, query: {} } as never))
      .resolves.toEqual({ data: materialList, message: "success" });
    await expect(controller.getMaterialNote({ user, params: { id: noteId } } as never))
      .resolves.toEqual({ data: preview, message: "success" });
    await expect(controller.claimMaterialNote({
      user, params: { id: noteId }, body: undefined,
    } as never)).resolves.toEqual({ data: claimResult, message: "success" });
    await expect(controller.listOwnedMaterialNotes({ user, query: {} } as never))
      .resolves.toEqual({ data: materialList, message: "success" });
    await controller.getOwnedMaterialNote({ user, params: { claimId } } as never);
    await controller.removeOwnedMaterialNote({
      user, params: { claimId }, body: {},
    } as never);
    await controller.clearOwnedMaterialNotes({ user, body: undefined } as never);

    expect(listPublic).toHaveBeenCalledWith(user, { page: 1, pageSize: 20 });
    expect(getPublicPreview).toHaveBeenCalledWith(user, noteId);
    expect(claim).toHaveBeenCalledWith(user, noteId);
    expect(listOwned).toHaveBeenCalledWith(user, { page: 1, pageSize: 20 });
    expect(getOwnedDetail).toHaveBeenCalledWith(user, claimId);
    expect(remove).toHaveBeenCalledWith(user, claimId);
    expect(clear).toHaveBeenCalledWith(user);

    await expect(controller.listMaterialNotes({ user, query: {
      pageSize: 101,
    } } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    await expect(controller.listMaterialNotes({ user, query: {
      tenant_id: "33333333-3333-4333-8333-333333333333",
    } } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    const invalidBodies = [null, false, 0, "", [], { forged: true }];
    for (const invalidBody of invalidBodies) {
      await expect(controller.claimMaterialNote({
        user, params: { id: noteId }, body: invalidBody,
      } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
      await expect(controller.removeOwnedMaterialNote({
        user, params: { claimId }, body: invalidBody,
      } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
      await expect(controller.clearOwnedMaterialNotes({
        user, body: invalidBody,
      } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
    }
  });

  test("defines strict bounded decoration Q&A request bodies", () => {
    expect(DouyinMiniappQaRequestSchema.parse({
      question: "  旧房翻新要注意什么？ ",
      attribution: body.launch_context,
    }).question).toBe("旧房翻新要注意什么？");
    expect(() => DouyinMiniappQaRequestSchema.parse({
      question: "x".repeat(121),
      attribution: body.launch_context,
    })).toThrow();
    expect(() => DouyinMiniappQaRequestSchema.parse({
      question: "旧房翻新要注意什么？",
      attribution: body.launch_context,
      phone: "15518591857",
    })).toThrow();
  });
});
