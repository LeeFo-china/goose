import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { PhoneIdentityTargetMode } from "./types";

type RelationOne<T> = T | T[] | null;

type TenantRef = {
  id: string | null;
  status: string | null;
};

type CustomerBindingRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  phone: string | null;
  tenant: RelationOne<TenantRef>;
};

type EmployeeBindingRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  phone: string | null;
  status: string | null;
  tenant: RelationOne<TenantRef>;
};

type PartnerBindingRecord = {
  id: string;
  partner_id: string;
  auth_user_id: string | null;
  phone: string | null;
  status: string;
  partner: RelationOne<{
    id: string;
    status: string;
  }>;
};

type AuthOutput = Record<string, unknown>;

export type PhoneIdentityBindingSelection = {
  targetMode: PhoneIdentityTargetMode;
  tenantId: string | null;
  customerId: string | null;
  employeeId: string | null;
  partnerMemberId: string | null;
  authUserId: string;
  openid: string | null;
  phone: string;
};

export type PhoneIdentityBindingsDependencies = {
  findCustomer: (input: {
    tenantId: string;
    customerId: string;
  }) => Promise<CustomerBindingRecord | null>;
  bindCustomer: (input: {
    authUserId: string;
    customer: CustomerBindingRecord;
    openid: string | null;
  }) => Promise<string>;
  signCustomerAuth: (input: {
    authUserId: string;
    customer: CustomerBindingRecord;
    openid: string | null;
  }) => Promise<AuthOutput> | AuthOutput;

  findEmployee: (input: {
    tenantId: string;
    employeeId: string;
  }) => Promise<EmployeeBindingRecord | null>;
  bindEmployee: (input: {
    authUserId: string;
    employee: EmployeeBindingRecord;
    openid: string | null;
  }) => Promise<string>;
  signEmployeeAuth: (input: {
    authUserId: string;
    employee: EmployeeBindingRecord;
    openid: string | null;
  }) => Promise<AuthOutput> | AuthOutput;

  findPartnerMember: (input: {
    partnerMemberId: string;
  }) => Promise<PartnerBindingRecord | null>;
  bindPartnerMember: (input: {
    authUserId: string;
    member: PartnerBindingRecord;
    openid: string | null;
  }) => Promise<PartnerBindingRecord>;
  signPartnerAuth: (input: {
    authUserId: string;
    member: PartnerBindingRecord;
    openid: string | null;
  }) => Promise<AuthOutput> | AuthOutput;
};

export class PhoneIdentityBindings {
  constructor(
    private readonly dependencies: PhoneIdentityBindingsDependencies,
  ) {}

  async authenticate(input: PhoneIdentityBindingSelection) {
    if (input.targetMode === "customer") {
      const customer = await this.loadCustomer(input);
      const authUserId = await this.dependencies.bindCustomer({
        authUserId: input.authUserId,
        customer,
        openid: input.openid,
      });
      return this.dependencies.signCustomerAuth({
        authUserId,
        customer: { ...customer, user_id: authUserId },
        openid: input.openid,
      });
    }

    if (input.targetMode === "tenant_employee") {
      const employee = await this.loadEmployee(input);
      const authUserId = await this.dependencies.bindEmployee({
        authUserId: input.authUserId,
        employee,
        openid: input.openid,
      });
      return this.dependencies.signEmployeeAuth({
        authUserId,
        employee: { ...employee, user_id: authUserId },
        openid: input.openid,
      });
    }

    const member = await this.loadPartnerMember(input);
    const boundMember = await this.dependencies.bindPartnerMember({
      authUserId: input.authUserId,
      member,
      openid: input.openid,
    });
    return this.dependencies.signPartnerAuth({
      authUserId: input.authUserId,
      member: boundMember,
      openid: input.openid,
    });
  }

  async buildCurrentAuth(input: PhoneIdentityBindingSelection) {
    if (input.targetMode === "customer") {
      const customer = await this.loadCustomer(input);
      return this.dependencies.signCustomerAuth({
        authUserId: input.authUserId,
        customer,
        openid: input.openid,
      });
    }

    if (input.targetMode === "tenant_employee") {
      const employee = await this.loadEmployee(input);
      return this.dependencies.signEmployeeAuth({
        authUserId: input.authUserId,
        employee,
        openid: input.openid,
      });
    }

    const member = await this.loadPartnerMember(input);
    return this.dependencies.signPartnerAuth({
      authUserId: input.authUserId,
      member,
      openid: input.openid,
    });
  }

  private async loadCustomer(input: PhoneIdentityBindingSelection) {
    if (!input.tenantId || !input.customerId) {
      throw optionUnavailable();
    }

    const customer = await this.dependencies.findCustomer({
      tenantId: input.tenantId,
      customerId: input.customerId,
    });
    const tenant = relationOne(customer?.tenant ?? null);
    if (
      !customer ||
      customer.tenant_id !== input.tenantId ||
      customer.id !== input.customerId ||
      customer.phone !== input.phone ||
      !tenant?.id ||
      tenant.status !== "active"
    ) {
      throw optionUnavailable();
    }

    return customer;
  }

  private async loadEmployee(input: PhoneIdentityBindingSelection) {
    if (!input.tenantId || !input.employeeId) {
      throw optionUnavailable();
    }

    const employee = await this.dependencies.findEmployee({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
    });
    const tenant = relationOne(employee?.tenant ?? null);
    if (
      !employee ||
      employee.tenant_id !== input.tenantId ||
      employee.id !== input.employeeId ||
      employee.phone !== input.phone ||
      employee.status !== "active" ||
      !tenant?.id ||
      tenant.status !== "active"
    ) {
      throw optionUnavailable();
    }

    return employee;
  }

  private async loadPartnerMember(input: PhoneIdentityBindingSelection) {
    if (!input.partnerMemberId) {
      throw optionUnavailable();
    }

    const member = await this.dependencies.findPartnerMember({
      partnerMemberId: input.partnerMemberId,
    });
    const partner = relationOne(member?.partner ?? null);
    if (
      !member ||
      member.id !== input.partnerMemberId ||
      member.phone !== input.phone ||
      member.status === "disabled" ||
      !partner?.id ||
      partner.status !== "active"
    ) {
      throw optionUnavailable();
    }

    return member;
  }
}

function relationOne<T>(value: RelationOne<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function optionUnavailable() {
  return Errors.business(
    409,
    "所选身份不可用，请重新验证手机号",
    ErrorCodes.IDENTITY_OPTION_UNAVAILABLE,
  );
}
