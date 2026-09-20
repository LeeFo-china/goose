import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinDeployableTemplatesRepository:
  typeof import("./douyin-deployable-templates")
    .DouyinDeployableTemplatesRepository;

beforeAll(async () => {
  ({ DouyinDeployableTemplatesRepository } = await import(
    "./douyin-deployable-templates"
  ));
});

const current = {
  id: "11111111-1111-4111-8111-111111111111",
  template_app_id: "tt0d647bd99301341b01" as const,
  source_draft_id: "1024",
  template_id: "77596",
  template_version: "0.1.4",
  description: "租户发布闭环",
  channel: "default" as const,
  is_current: true,
  is_tenant_selectable: true,
  confirmed_by_employee_id: "22222222-2222-4222-8222-222222222222",
  confirmed_at: "2026-08-13T08:00:00.000Z",
  selectability_updated_at: "2026-08-13T08:00:00.000Z",
  selectability_updated_by_employee_id:
    "22222222-2222-4222-8222-222222222222",
  created_at: "2026-08-13T08:00:00.000Z",
};

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: mock((_columns: string) => query),
    eq: mock((_column: string, _value: unknown) => query),
    maybeSingle: mock(async () => result),
  };
  return query;
}

function createListQuery(result: {
  data: unknown;
  error: unknown;
  count: number | null;
}) {
  const query = {
    select: mock((_columns: string, _options?: unknown) => query),
    eq: mock((_column: string, _value: unknown) => query),
    order: mock((_column: string, _options?: unknown) => query),
    range: mock(async (_from: number, _to: number) => result),
  };
  return query;
}

describe("DouyinDeployableTemplatesRepository", () => {
  test("reads the exact current template for one bounded channel", async () => {
    const query = createQuery({ data: current, error: null });
    const client = {
      from: mock(() => query),
      rpc: mock(async () => ({ data: null, error: null })),
    };
    const repository = new DouyinDeployableTemplatesRepository(client as never);

    await expect(repository.findCurrent("default")).resolves.toEqual(current);
    expect(client.from).toHaveBeenCalledWith(
      "douyin_miniapp_deployable_templates",
    );
    expect(query.eq.mock.calls).toEqual([
      ["channel", "default"],
      ["is_current", true],
    ]);
  });

  test("confirms one provider template through the atomic RPC", async () => {
    const client = {
      from: mock(() => createQuery({ data: null, error: null })),
      rpc: mock(async () => ({ data: current, error: null })),
    };
    const repository = new DouyinDeployableTemplatesRepository(client as never);

    await expect(repository.confirm({
      templateAppId: current.template_app_id,
      sourceDraftId: current.source_draft_id,
      templateId: current.template_id,
      templateVersion: current.template_version,
      description: current.description,
      channel: current.channel,
      actorEmployeeId: current.confirmed_by_employee_id,
    })).resolves.toEqual(current);

    expect(client.rpc).toHaveBeenCalledWith(
      "confirm_douyin_deployable_template",
      {
        p_template_app_id: current.template_app_id,
        p_source_draft_id: current.source_draft_id,
        p_template_id: current.template_id,
        p_template_version: current.template_version,
        p_description: current.description,
        p_channel: current.channel,
        p_actor_employee_id: current.confirmed_by_employee_id,
      },
    );
  });

  test("lists deployable templates with bounded stable pagination", async () => {
    const query = createListQuery({ data: [current], error: null, count: 1 });
    const repository = new DouyinDeployableTemplatesRepository({
      from: mock(() => query),
      rpc: mock(async () => ({ data: null, error: null })),
    } as never);

    await expect(repository.list({
      channel: "default",
      page: 2,
      pageSize: 20,
    })).resolves.toEqual({ list: [current], total: 1 });

    expect(query.select).toHaveBeenCalledWith(expect.any(String), {
      count: "exact",
    });
    expect(query.eq).toHaveBeenCalledWith("channel", "default");
    expect(query.order.mock.calls).toEqual([
      ["is_current", { ascending: false }],
      ["confirmed_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(query.range).toHaveBeenCalledWith(20, 39);
  });

  test("lists only tenant-selectable templates with pagination", async () => {
    const query = createListQuery({ data: [current], error: null, count: 1 });
    const repository = new DouyinDeployableTemplatesRepository({
      from: mock(() => query),
      rpc: mock(async () => ({ data: null, error: null })),
    } as never);

    await expect(repository.listSelectable({
      channel: "default",
      page: 1,
      pageSize: 10,
    })).resolves.toEqual({ list: [current], total: 1 });

    expect(query.eq.mock.calls).toEqual([
      ["channel", "default"],
      ["is_tenant_selectable", true],
    ]);
    expect(query.range).toHaveBeenCalledWith(0, 9);
  });

  test("finds an exact selectable template record", async () => {
    const query = createQuery({ data: current, error: null });
    const repository = new DouyinDeployableTemplatesRepository({
      from: mock(() => query),
      rpc: mock(async () => ({ data: null, error: null })),
    } as never);

    await expect(repository.findSelectableById(
      current.id,
      "default",
    )).resolves.toEqual(current);
    expect(query.eq.mock.calls).toEqual([
      ["id", current.id],
      ["channel", "default"],
      ["is_tenant_selectable", true],
    ]);
  });

  test("changes template selectability through the CAS RPC", async () => {
    const changed = { ...current, is_tenant_selectable: false };
    const client = {
      from: mock(() => createQuery({ data: null, error: null })),
      rpc: mock(async () => ({ data: changed, error: null })),
    };
    const repository = new DouyinDeployableTemplatesRepository(client as never);

    await expect(repository.setSelectability({
      templateRecordId: current.id,
      isTenantSelectable: false,
      expectedIsTenantSelectable: true,
      actorEmployeeId: current.confirmed_by_employee_id,
    })).resolves.toEqual(changed);
    expect(client.rpc).toHaveBeenCalledWith(
      "set_douyin_deployable_template_selectability",
      {
        p_template_record_id: current.id,
        p_is_tenant_selectable: false,
        p_expected_is_tenant_selectable: true,
        p_actor_employee_id: current.confirmed_by_employee_id,
      },
    );
  });

  test("maps stale selectability changes without leaking database details", async () => {
    const repository = new DouyinDeployableTemplatesRepository({
      from: mock(() => createQuery({ data: null, error: null })),
      rpc: mock(async () => ({
        data: null,
        error: {
          message: "DOUYIN_TEMPLATE_SELECTABILITY_CHANGED",
          details: "actor=must-not-leak",
        },
      })),
    } as never);

    await expect(repository.setSelectability({
      templateRecordId: current.id,
      isTenantSelectable: false,
      expectedIsTenantSelectable: true,
      actorEmployeeId: current.confirmed_by_employee_id,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_TEMPLATE_SELECTABILITY_CHANGED",
    });
  });

  test("rejects malformed database responses with a stable safe error", async () => {
    const query = createQuery({
      data: { ...current, template_id: "unsafe" },
      error: null,
    });
    const repository = new DouyinDeployableTemplatesRepository({
      from: mock(() => query),
      rpc: mock(async () => ({ data: null, error: null })),
    } as never);

    await expect(repository.findCurrent("default")).rejects.toMatchObject({
      code: "DOUYIN_DEPLOYABLE_TEMPLATE_REPOSITORY_RESPONSE_INVALID",
    });
  });

  test("maps database permission rejection to a stable forbidden error", async () => {
    const repository = new DouyinDeployableTemplatesRepository({
      from: mock(() => createQuery({ data: null, error: null })),
      rpc: mock(async () => ({
        data: null,
        error: {
          message: "DOUYIN_TEMPLATE_CONFIRMATION_FORBIDDEN",
          details: "actor=must-not-leak",
        },
      })),
    } as never);
    let caught: unknown;

    try {
      await repository.confirm({
        templateAppId: current.template_app_id,
        sourceDraftId: current.source_draft_id,
        templateId: current.template_id,
        templateVersion: current.template_version,
        description: current.description,
        channel: current.channel,
        actorEmployeeId: current.confirmed_by_employee_id,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      statusCode: 403,
      code: "DOUYIN_TEMPLATE_CONFIRMATION_FORBIDDEN",
    });
    expect(JSON.stringify(caught)).not.toContain("must-not-leak");
  });
});
