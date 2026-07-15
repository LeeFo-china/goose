import { describe, expect, mock, test } from "bun:test";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { PhoneIdentityBindings } from "./bindings";

const AUTH_USER_ID = "auth-user-1";
const OPENID = "openid-1";
const PHONE = "13800138000";

describe("PhoneIdentityBindings", () => {
  test("reloads and binds a selected customer before signing auth", async () => {
    const findCustomer = mock(async () => customer());
    const bindCustomer = mock(async () => "auth-user-1");
    const signCustomerAuth = mock(async () => ({ mode: "customer", authMode: "customer" }));
    const bindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer,
      bindCustomer,
      signCustomerAuth,
    });

    await expect(bindings.authenticate({
      targetMode: "customer",
      tenantId: "tenant-1",
      customerId: "customer-1",
      employeeId: null,
      partnerMemberId: null,
      authUserId: AUTH_USER_ID,
      openid: OPENID,
      phone: PHONE,
    })).resolves.toMatchObject({ mode: "customer", authMode: "customer" });

    expect(findCustomer).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      customerId: "customer-1",
    });
    expect(bindCustomer).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      customer: customer(),
      openid: OPENID,
    });
  });

  test("reloads and binds a selected employee before signing tenant employee auth", async () => {
    const findEmployee = mock(async () => employee());
    const bindEmployee = mock(async () => "auth-user-1");
    const signEmployeeAuth = mock(async () => ({
      mode: "tenant_employee",
      authMode: "tenant_employee",
    }));
    const bindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findEmployee,
      bindEmployee,
      signEmployeeAuth,
    });

    await expect(bindings.authenticate({
      targetMode: "tenant_employee",
      tenantId: "tenant-1",
      customerId: null,
      employeeId: "employee-1",
      partnerMemberId: null,
      authUserId: AUTH_USER_ID,
      openid: OPENID,
      phone: PHONE,
    })).resolves.toEqual({
      mode: "tenant_employee",
      authMode: "tenant_employee",
    });
    expect(bindEmployee).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      employee: employee(),
      openid: OPENID,
    });
  });

  test("reloads and binds a selected partner member before signing partner auth", async () => {
    const findPartnerMember = mock(async () => partnerMember({ status: "pending_bind" }));
    const bindPartnerMember = mock(async () => partnerMember({ auth_user_id: AUTH_USER_ID }));
    const signPartnerAuth = mock(async () => ({
      mode: "platform_partner",
      authMode: "platform_partner",
    }));
    const bindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findPartnerMember,
      bindPartnerMember,
      signPartnerAuth,
    });

    await expect(bindings.authenticate({
      targetMode: "platform_partner",
      tenantId: null,
      customerId: null,
      employeeId: null,
      partnerMemberId: "partner-member-1",
      authUserId: AUTH_USER_ID,
      openid: OPENID,
      phone: PHONE,
    })).resolves.toEqual({
      mode: "platform_partner",
      authMode: "platform_partner",
    });
    expect(bindPartnerMember).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      member: partnerMember({ status: "pending_bind" }),
      openid: OPENID,
    });
  });

  test("rejects changed phone and unavailable accounts", async () => {
    const customerBindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer: mock(async () => customer({ phone: "13900139000" })),
    });
    await expect(customerBindings.authenticate(customerInput()))
      .rejects.toMatchObject({ code: ErrorCodes.IDENTITY_OPTION_UNAVAILABLE });

    const employeeBindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findEmployee: mock(async () => employee({ status: "disabled" })),
    });
    await expect(employeeBindings.authenticate(employeeInput()))
      .rejects.toMatchObject({ code: ErrorCodes.IDENTITY_OPTION_UNAVAILABLE });

    const partnerBindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findPartnerMember: mock(async () => partnerMember({
        partner: { id: "partner-1", name: "合伙人", status: "disabled", region_codes: [] },
      })),
    });
    await expect(partnerBindings.authenticate(partnerInput()))
      .rejects.toMatchObject({ code: ErrorCodes.IDENTITY_OPTION_UNAVAILABLE });
  });

  test("propagates customer and partner rebind errors", async () => {
    const customerBindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer: mock(async () => customer()),
      bindCustomer: mock(async () => {
        throw Errors.business(409, "该客户档案已绑定其他账号", ErrorCodes.WECHAT_ALREADY_BOUND);
      }),
    });
    await expect(customerBindings.authenticate(customerInput()))
      .rejects.toMatchObject({ code: ErrorCodes.WECHAT_ALREADY_BOUND });

    const partnerBindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findPartnerMember: mock(async () => partnerMember()),
      bindPartnerMember: mock(async () => {
        throw Errors.business(409, "该合伙人成员已绑定其他微信", "PARTNER_MEMBER_ALREADY_BOUND");
      }),
    });
    await expect(partnerBindings.authenticate(partnerInput()))
      .rejects.toMatchObject({ code: "PARTNER_MEMBER_ALREADY_BOUND" });
  });

  test("buildCurrentAuth signs without executing binding mutations", async () => {
    const bindCustomer = mock(async () => "unexpected");
    const signCustomerAuth = mock(async () => ({ mode: "customer", authMode: "customer" }));
    const bindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer: mock(async () => customer({ user_id: AUTH_USER_ID })),
      bindCustomer,
      signCustomerAuth,
    });

    await expect(bindings.buildCurrentAuth(customerInput()))
      .resolves.toEqual({ mode: "customer", authMode: "customer" });
    expect(bindCustomer).not.toHaveBeenCalled();
  });

  test("inspects current, unbound, and indeterminate binding state", async () => {
    const current = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer: mock(async () => customer({ user_id: AUTH_USER_ID })),
    });
    await expect(current.inspectCurrentBinding(customerInput()))
      .resolves.toBe("current");

    const unbound = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer: mock(async () => customer({ user_id: null })),
    });
    await expect(unbound.inspectCurrentBinding(customerInput()))
      .resolves.toBe("unbound");

    const unavailable = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer: mock(async () => customer({ phone: "13900139000" })),
    });
    await expect(unavailable.inspectCurrentBinding(customerInput()))
      .resolves.toBe("indeterminate");
  });

  test("buildCurrentAuth requires an existing current binding", async () => {
    const signCustomerAuth = mock(async () => ({ mode: "customer", authMode: "customer" }));
    const bindings = new PhoneIdentityBindings({
      ...baseDependencies(),
      findCustomer: mock(async () => customer({ user_id: null })),
      signCustomerAuth,
    });

    await expect(bindings.buildCurrentAuth(customerInput()))
      .rejects.toMatchObject({ code: ErrorCodes.IDENTITY_OPTION_UNAVAILABLE });
    expect(signCustomerAuth).not.toHaveBeenCalled();
  });
});

function baseDependencies() {
  return {
    findCustomer: mock(async () => customer()),
    bindCustomer: mock(async () => AUTH_USER_ID),
    signCustomerAuth: mock(async () => ({ mode: "customer", authMode: "customer" })),
    findEmployee: mock(async () => employee()),
    bindEmployee: mock(async () => AUTH_USER_ID),
    signEmployeeAuth: mock(async () => ({ mode: "tenant_employee", authMode: "tenant_employee" })),
    findPartnerMember: mock(async () => partnerMember()),
    bindPartnerMember: mock(async () => partnerMember({ auth_user_id: AUTH_USER_ID })),
    signPartnerAuth: mock(async () => ({ mode: "platform_partner", authMode: "platform_partner" })),
  };
}

function customerInput() {
  return {
    targetMode: "customer" as const,
    tenantId: "tenant-1",
    customerId: "customer-1",
    employeeId: null,
    partnerMemberId: null,
    authUserId: AUTH_USER_ID,
    openid: OPENID,
    phone: PHONE,
  };
}

function employeeInput() {
  return {
    targetMode: "tenant_employee" as const,
    tenantId: "tenant-1",
    customerId: null,
    employeeId: "employee-1",
    partnerMemberId: null,
    authUserId: AUTH_USER_ID,
    openid: OPENID,
    phone: PHONE,
  };
}

function partnerInput() {
  return {
    targetMode: "platform_partner" as const,
    tenantId: null,
    customerId: null,
    employeeId: null,
    partnerMemberId: "partner-member-1",
    authUserId: AUTH_USER_ID,
    openid: OPENID,
    phone: PHONE,
  };
}

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: "customer-1",
    tenant_id: "tenant-1",
    user_id: null,
    name: "李四",
    phone: PHONE,
    tenant: { id: "tenant-1", name: "装企", slug: "tenant", status: "active" },
    ...overrides,
  };
}

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: "employee-1",
    tenant_id: "tenant-1",
    user_id: null,
    name: "王五",
    phone: PHONE,
    status: "active",
    tenant: { id: "tenant-1", status: "active" },
    ...overrides,
  };
}

function partnerMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "partner-member-1",
    partner_id: "partner-1",
    auth_user_id: null,
    name: "张三",
    phone: PHONE,
    role: "owner",
    status: "active",
    partner: { id: "partner-1", name: "合伙人", status: "active", region_codes: [] },
    ...overrides,
  };
}
