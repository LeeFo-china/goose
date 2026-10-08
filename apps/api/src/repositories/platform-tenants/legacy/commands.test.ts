import { describe, expect, mock, test } from "bun:test";

import { CreatePlatformTenantSchema } from "@/schema/platform-tenants";

import {
  createWithDefaultTemplate,
  type PlatformTenantRpc,
} from "./commands";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ROLE_ID = "33333333-3333-4333-8333-333333333333";
const AUTH_USER_ID = "44444444-4444-4444-8444-444444444444";
const OPERATOR_ID = "55555555-5555-4555-8555-555555555555";
const CONFIRMED_AT = "2026-08-30T08:00:00.000Z";

const tenant = {
  id: TENANT_ID,
  name: "晴天装饰",
  slug: "sunny-decoration",
  status: "active",
  address: "河南省信阳市固始县",
  address_title: "晴天装饰总部",
  address_poi_id: "poi-1",
  address_province: "河南省",
  address_city: "信阳市",
  address_district: "固始县",
  address_adcode: "411525",
  address_latitude: 32.1684,
  address_longitude: 115.6545,
  address_source: "map_picker",
  address_confidence: 0.98,
  address_confirmed_at: CONFIRMED_AT,
  contact_name: "李经理",
  contact_phone: "0376-1234567",
  unified_social_credit_code: null,
  created_at: "2026-08-30T08:01:00.000Z",
  updated_at: "2026-08-30T08:01:00.000Z",
} as const;

const initialization = {
  template_code: "default_decoration_company",
  template_version: "2026.08.30",
  departments_count: 42,
  posts_count: 48,
  roles_count: 11,
  admin_employee_id: ADMIN_EMPLOYEE_ID,
  admin_role_id: ADMIN_ROLE_ID,
} as const;

const success = { tenant, initialization };

function rpcHarness(result: { data: unknown; error: unknown }) {
  const rpc = mock<PlatformTenantRpc>(async () => result);
  return { rpc };
}

describe("platform tenant atomic create command", () => {
  test("preserves the requested trial when validating a manual tenant", () => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
      trial: {
        enabled: true,
        trial_days: 30,
        reason: "平台建户试用",
        idempotency_key: "66666666-6666-4666-8666-666666666666",
      },
    });
    expect(input).toHaveProperty("trial.enabled", true);
  });

  test("accepts tenant origin and access policy returned by the migration", async () => {
    const input = CreatePlatformTenantSchema.parse({ name: tenant.name, slug: tenant.slug });
    const { rpc } = rpcHarness({
      data: {
        tenant: {
          ...tenant,
          creation_source: "platform_manual",
          service_access_policy: "entitlement_required",
        },
        initialization,
      },
      error: null,
    });
    const result = await createWithDefaultTemplate(rpc, input, OPERATOR_ID);
    expect(result.tenant).toMatchObject({
      creation_source: "platform_manual",
      service_access_policy: "entitlement_required",
    });
  });

  test("sends manual trial in the atomic platform create RPC", async () => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
      trial: {
        enabled: true,
        trial_days: 30,
        reason: "平台建户试用",
        idempotency_key: "66666666-6666-4666-8666-666666666666",
      },
    });
    const { rpc } = rpcHarness({ data: success, error: null });
    await createWithDefaultTemplate(rpc, input, OPERATOR_ID, {
      manual: true,
      allowOverride: true,
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_platform_tenant_with_trial",
      expect.objectContaining({
        p_trial_days: 30,
        p_trial_reason: "平台建户试用",
        p_trial_idempotency_key: "66666666-6666-4666-8666-666666666666",
        p_allow_override: true,
      }),
    );
  });

  test("calls the exact RPC with every tenant, admin, and operator field", async () => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      address: tenant.address,
      address_title: tenant.address_title,
      address_poi_id: tenant.address_poi_id,
      address_province: tenant.address_province,
      address_city: tenant.address_city,
      address_district: tenant.address_district,
      address_adcode: tenant.address_adcode,
      address_latitude: tenant.address_latitude,
      address_longitude: tenant.address_longitude,
      address_source: tenant.address_source,
      address_confidence: tenant.address_confidence,
      address_confirmed_at: tenant.address_confirmed_at,
      contact_name: tenant.contact_name,
      contact_phone: tenant.contact_phone,
      admin: {
        name: "管理员",
        phone: "13800138000",
        auth_user_id: AUTH_USER_ID,
        department_code: "EXEC_OFFICE",
        post_code: "SYSTEM_ADMIN",
      },
    });
    const { rpc } = rpcHarness({ data: success, error: null });

    expect(await createWithDefaultTemplate(rpc, input, OPERATOR_ID)).toEqual(success);
    expect(rpc).toHaveBeenCalledWith("create_tenant_with_default_template", {
      p_name: tenant.name,
      p_slug: tenant.slug,
      p_status: tenant.status,
      p_address: tenant.address,
      p_address_title: tenant.address_title,
      p_address_poi_id: tenant.address_poi_id,
      p_address_province: tenant.address_province,
      p_address_city: tenant.address_city,
      p_address_district: tenant.address_district,
      p_address_adcode: tenant.address_adcode,
      p_address_latitude: tenant.address_latitude,
      p_address_longitude: tenant.address_longitude,
      p_address_source: tenant.address_source,
      p_address_confidence: tenant.address_confidence,
      p_address_confirmed_at: tenant.address_confirmed_at,
      p_contact_name: tenant.contact_name,
      p_contact_phone: tenant.contact_phone,
      p_admin_name: "管理员",
      p_admin_phone: "13800138000",
      p_admin_auth_user_id: AUTH_USER_ID,
      p_admin_department_code: "EXEC_OFFICE",
      p_admin_post_code: "SYSTEM_ADMIN",
      p_operator_employee_id: OPERATOR_ID,
    });
  });

  test("uses null for absent optionals and template admin defaults", async () => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
      admin: { name: "管理员", phone: "13800138000" },
    });
    expect(input.admin).toMatchObject({
      department_code: "EXEC_OFFICE",
      post_code: "SYSTEM_ADMIN",
    });
    const { rpc } = rpcHarness({ data: success, error: null });

    await createWithDefaultTemplate(rpc, input, null);

    expect(rpc.mock.calls[0]?.[1]).toEqual({
      p_name: tenant.name,
      p_slug: tenant.slug,
      p_status: "active",
      p_address: null,
      p_address_title: null,
      p_address_poi_id: null,
      p_address_province: null,
      p_address_city: null,
      p_address_district: null,
      p_address_adcode: null,
      p_address_latitude: null,
      p_address_longitude: null,
      p_address_source: null,
      p_address_confidence: null,
      p_address_confirmed_at: null,
      p_contact_name: null,
      p_contact_phone: null,
      p_admin_name: "管理员",
      p_admin_phone: "13800138000",
      p_admin_auth_user_id: null,
      p_admin_department_code: "EXEC_OFFICE",
      p_admin_post_code: "SYSTEM_ADMIN",
      p_operator_employee_id: null,
    });
  });

  test("keeps legacy admin input compatible with the fixed template placement", async () => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
      admin: {
        name: "管理员",
        phone: "13800138000",
        department_code: "ADMIN",
        post_code: "GENERAL_MANAGER",
      },
    });
    expect(input.admin).toMatchObject({
      department_code: "ADMIN",
      post_code: "GENERAL_MANAGER",
    });
    const { rpc } = rpcHarness({ data: success, error: null });

    await createWithDefaultTemplate(rpc, input, OPERATOR_ID);

    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_admin_department_code: "EXEC_OFFICE",
      p_admin_post_code: "SYSTEM_ADMIN",
    });
  });

  test.each([
    ["wrong template version", {
      ...success,
      initialization: { ...initialization, template_version: "2026.05.10" },
    }],
    ["bad UUID", {
      ...success,
      initialization: { ...initialization, admin_employee_id: "not-a-uuid" },
    }],
    ["missing field", {
      tenant: (({ updated_at: _removed, ...rest }) => rest)(tenant),
      initialization,
    }],
    ["extra top-level field", { ...success, unexpected: true }],
    ["extra tenant field", { ...success, tenant: { ...tenant, unexpected: true } }],
    ["extra initialization field", {
      ...success,
      initialization: { ...initialization, unexpected: true },
    }],
  ])("fails closed for %s in a success response", async (_name, data) => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
    });
    const { rpc } = rpcHarness({ data, error: null });

    const error = await createWithDefaultTemplate(rpc, input, OPERATOR_ID)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
  });

  test.each([
    ["23505", "TENANT_SLUG_EXISTS", 409, "租户标识已存在"],
    ["23505", "TENANT_ADMIN_PHONE_EXISTS", 409, "管理员手机号已绑定员工身份"],
    ["23514", "TENANT_TEMPLATE_STATE_CONFLICT", 409, "租户模板状态冲突"],
    ["23503", "TENANT_TEMPLATE_PERMISSION_MISSING", 503, "租户模板权限配置不完整"],
    ["22023", "TENANT_INITIALIZATION_INPUT_INVALID", 400, "租户管理员信息无效"],
    ["22023", "TENANT_CREATION_INPUT_INVALID", 400, "租户信息无效"],
    ["23514", "TENANT_INITIALIZATION_TENANT_STATE_INVALID", 409, "租户状态不允许初始化"],
  ])("maps %s/%s to a business error", async (dbCode, code, statusCode, message) => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
    });
    const { rpc } = rpcHarness({ data: null, error: { code: dbCode, message: code } });

    await expect(createWithDefaultTemplate(rpc, input, OPERATOR_ID)).rejects
      .toMatchObject({ statusCode, code, message });
  });

  test("wraps unknown returned and rejected RPC errors", async () => {
    const input = CreatePlatformTenantSchema.parse({
      name: tenant.name,
      slug: tenant.slug,
    });
    const returned = rpcHarness({
      data: null,
      error: { code: "XX000", message: "unknown returned" },
    });
    const rejected: PlatformTenantRpc = async () => {
      throw { message: "unknown rejected" };
    };

    for (const rpc of [returned.rpc, rejected]) {
      await expect(createWithDefaultTemplate(rpc, input, OPERATOR_ID)).rejects
        .toMatchObject({
          statusCode: 500,
          code: "DB_ERROR",
          details: undefined,
        });
    }
  });
});


describe("manual tenant trial scope routing", () => {
  const trial = {
    enabled: true as const, trial_days: 30, reason: "平台建户试用",
    idempotency_key: "66666666-6666-4666-8666-666666666666",
  };
  const scope = { version: 1 as const, capabilities: ["core.projects" as const] };

  test("adds only p_trial_scope to the legacy arguments and returns the atomic result", async () => {
    const legacy = CreatePlatformTenantSchema.parse({ name: tenant.name, slug: tenant.slug, trial });
    const { rpc } = rpcHarness({ data: success, error: null });
    const options = { manual: true, allowOverride: true };
    await createWithDefaultTemplate(rpc, legacy, OPERATOR_ID, options);
    const scoped = { ...legacy, trial: { ...trial, scope } };
    expect(await createWithDefaultTemplate(rpc, scoped, OPERATOR_ID, options)).toEqual(success);
    expect(rpc.mock.calls[0]?.[0]).toBe("create_platform_tenant_with_trial");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_trial_scope");
    expect(rpc.mock.calls[1]).toEqual([
      "create_platform_tenant_with_trial_scope",
      { ...rpc.mock.calls[0]?.[1], p_trial_scope: scope },
    ]);
  });

  test.each([undefined, { enabled: false as const }, trial])(
    "keeps unscoped manual creation on the old RPC: %j", async (trialInput) => {
      const input = CreatePlatformTenantSchema.parse({ name: tenant.name, slug: tenant.slug, trial: trialInput });
      const { rpc } = rpcHarness({ data: success, error: null });
      await createWithDefaultTemplate(rpc, input, OPERATOR_ID, { manual: true });
      expect(rpc.mock.calls[0]?.[0]).toBe("create_platform_tenant_with_trial");
      expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_trial_scope");
    },
  );

  test.each([trial, { ...trial, scope }])("rejects partner trials before RPC: %j", async (trialInput) => {
    const input = { ...CreatePlatformTenantSchema.parse({ name: tenant.name, slug: tenant.slug }), trial: trialInput };
    const { rpc } = rpcHarness({ data: success, error: null });
    await expect(createWithDefaultTemplate(rpc, input, OPERATOR_ID)).rejects.toMatchObject({ statusCode: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
