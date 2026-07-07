import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import {
  authIdentityOptionsRepository,
  type AuthIdentityOptionsRepositoryPort,
  type AuthIdentityPartnerMemberRecord,
  type BusinessMembershipRecord,
  type CustomerIdentityOptionRecord,
  type EmployeeIdentityOptionRecord,
  type TenantOptionRecord,
} from "@/repositories/auth-identity-options";
import type { AuthIdentityMode, SwitchIdentityInput } from "@/schema/auth-identity-switch";
import { buildPartnerAuthResponse } from "@/services/platform-partner-portal-auth-payloads";
import { signToken, signVisitorSessionToken, type JwtPayload } from "@/utils/jwt";
import { isEmployeeOperableStatus } from "@gooes/domain";

type TokenSigner = (payload: Omit<JwtPayload, "iat" | "exp">) => string;
type VisitorSessionSigner = (
  input: { openid: string; unionid?: string | null; visitorId: string },
) => string;

type IdentityOption =
  | {
    mode: "platform_visitor";
    label: string;
    visitor_id: string | null;
  }
  | {
    mode: "platform_partner";
    partner_member_id: string;
    partner_id: string;
    label: string;
    member: ReturnType<typeof serializePartnerMember>;
    partner: ReturnType<typeof serializePartner>;
    level: ReturnType<typeof serializePartnerLevel>;
  }
  | {
    mode: "tenant_employee";
    tenant_id: string;
    employee_id: string;
    label: string;
    tenant: ReturnType<typeof serializeTenant>;
    employee: ReturnType<typeof serializeEmployee>;
  }
  | {
    mode: "customer";
    tenant_id: string;
    customer_id: string;
    label: string;
    tenant: ReturnType<typeof serializeTenant>;
    customer: ReturnType<typeof serializeCustomer>;
  };

type IdentityOptionsResult = {
  current_mode: AuthIdentityMode;
  identities: IdentityOption[];
};

export type AuthIdentitySwitchServiceDependencies = {
  repository?: AuthIdentityOptionsRepositoryPort;
  tokenSigner?: TokenSigner;
  visitorSessionSigner?: VisitorSessionSigner;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function buildVisitorSessionId(openid?: string | null) {
  if (!openid) {
    return null;
  }
  return `wechat_visitor_${createHash("sha256").update(openid).digest("hex").slice(0, 32)}`;
}

function serializeTenant(tenant: TenantOptionRecord) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
  };
}

function serializePartnerMember(member: AuthIdentityPartnerMemberRecord) {
  return {
    id: member.id,
    partner_id: member.partner_id,
    name: member.name,
    phone: member.phone,
    role: member.role,
    status: member.status,
  };
}

function serializePartner(member: AuthIdentityPartnerMemberRecord) {
  return {
    id: member.partner.id,
    name: member.partner.name,
    status: member.partner.status,
    region_codes: member.partner.region_codes,
    level: member.partner.level
      ? {
        code: member.partner.level.code,
        name: member.partner.level.name,
      }
      : null,
  };
}

function serializePartnerLevel(member: AuthIdentityPartnerMemberRecord) {
  return member.partner.level
    ? {
      id: member.partner.level.id,
      code: member.partner.level.code,
      name: member.partner.level.name,
      status: member.partner.level.status,
    }
    : null;
}

function serializeEmployee(employee: EmployeeIdentityOptionRecord) {
  const department = relationOne(employee.tenant_department);
  const post = relationOne(employee.post);
  return {
    id: employee.id,
    name: employee.name,
    phone: employee.phone,
    status: employee.status,
    tenant_department_id: employee.tenant_department_id,
    department_code: department?.code ?? null,
    department_name: department?.alias_name ?? null,
    post_id: employee.post_id,
    post_name: post?.name ?? null,
    avatar: employee.avatar,
  };
}

function serializeCustomer(customer: CustomerIdentityOptionRecord) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    status: customer.status,
  };
}

function addRole(existingRoles: readonly string[] | undefined, role: string) {
  const roles = new Set((existingRoles ?? []).filter((item) => item && item !== "visitor"));
  roles.add(role);
  return Array.from(roles);
}

export class AuthIdentitySwitchService {
  private readonly repository: AuthIdentityOptionsRepositoryPort;
  private readonly tokenSigner: TokenSigner;
  private readonly visitorSessionSigner: VisitorSessionSigner;

  constructor(dependencies: AuthIdentitySwitchServiceDependencies = {}) {
    this.repository = dependencies.repository ?? authIdentityOptionsRepository;
    this.tokenSigner = dependencies.tokenSigner ?? signToken;
    this.visitorSessionSigner = dependencies.visitorSessionSigner ?? ((input) =>
      signVisitorSessionToken({
        openid: input.openid,
        unionid: input.unionid ?? undefined,
        visitor_id: input.visitorId,
      }));
  }

  async listOptions(user: JwtPayload | undefined): Promise<IdentityOptionsResult> {
    const authUserId = this.requireAuthUserId(user);
    const [partnerMembers, memberships] = await Promise.all([
      this.repository.listPartnerMembersByAuthUserId(authUserId),
      this.repository.listBusinessMemberships(authUserId),
    ]);
    const employeeMemberships = memberships.filter((item) => item.identity_type === "employee");
    const customerMemberships = memberships.filter((item) => item.identity_type === "customer");
    const [employees, customers] = await Promise.all([
      this.repository.listEmployeesByIds(employeeMemberships.map((item) => item.identity_id)),
      this.repository.listCustomersByIds(customerMemberships.map((item) => item.identity_id)),
    ]);

    return {
      current_mode: this.resolveCurrentMode(user),
      identities: [
        this.buildVisitorOption(user),
        ...partnerMembers
          .filter((member) => member.partner?.status === "active" && member.status === "active")
          .map((member) => this.buildPartnerOption(member)),
        ...this.buildEmployeeOptions(authUserId, employeeMemberships, employees),
        ...this.buildCustomerOptions(customerMemberships, customers),
      ],
    };
  }

  async switchIdentity(user: JwtPayload | undefined, input: SwitchIdentityInput) {
    const authUserId = this.requireAuthUserId(user);
    this.assertSwitchPayloadAllowed(input);

    if (input.target_mode === "platform_visitor") {
      return this.buildVisitorAuthResponse(user);
    }

    const options = await this.listOptions({ ...user, sub: authUserId });
    const option = this.findOption(options.identities, input);
    if (!option) {
      throw Errors.business(
        404,
        "身份选项不可用",
        "IDENTITY_OPTION_NOT_FOUND",
      );
    }

    if (option.mode === "platform_partner") {
      return this.buildPartnerAuthResponse(authUserId, user, option.partner_member_id);
    }

    if (option.mode === "tenant_employee") {
      return this.buildEmployeeAuthResponse(authUserId, user, option);
    }

    if (option.mode === "customer") {
      return this.buildCustomerAuthResponse(authUserId, user, option);
    }

    throw Errors.business(
      400,
      "身份切换参数不匹配",
      "IDENTITY_SWITCH_NOT_ALLOWED",
    );
  }

  private requireAuthUserId(user: JwtPayload | undefined) {
    const authUserId = typeof user?.sub === "string" ? user.sub.trim() : "";
    if (!authUserId) {
      throw Errors.unauthorized("请先登录");
    }
    return authUserId;
  }

  private resolveCurrentMode(user: JwtPayload | undefined): AuthIdentityMode {
    if (user?.token_type === "visitor_session") {
      return "platform_visitor";
    }
    if (user?.token_type === "platform_partner") {
      return "platform_partner";
    }
    if (user?.customer_id) {
      return "customer";
    }
    if (user?.employee_id) {
      return "tenant_employee";
    }
    return "platform_visitor";
  }

  private buildVisitorOption(user: JwtPayload | undefined): IdentityOption {
    return {
      mode: "platform_visitor",
      label: "访客",
      visitor_id: buildVisitorSessionId(user?.openid),
    };
  }

  private buildPartnerOption(member: AuthIdentityPartnerMemberRecord): IdentityOption {
    return {
      mode: "platform_partner",
      partner_member_id: member.id,
      partner_id: member.partner_id,
      label: member.partner.name,
      member: serializePartnerMember(member),
      partner: serializePartner(member),
      level: serializePartnerLevel(member),
    };
  }

  private buildEmployeeOptions(
    authUserId: string,
    memberships: BusinessMembershipRecord[],
    employees: EmployeeIdentityOptionRecord[],
  ): IdentityOption[] {
    const membershipKeys = new Set(
      memberships.map((item) => `${item.tenant_id ?? ""}:${item.identity_id}`),
    );

    return employees.flatMap((employee) => {
      const tenant = relationOne(employee.tenant);
      if (
        !employee.tenant_id ||
        !tenant?.id ||
        tenant.status !== "active" ||
        !isEmployeeOperableStatus(employee.status) ||
        employee.user_id !== authUserId ||
        !membershipKeys.has(`${employee.tenant_id}:${employee.id}`)
      ) {
        return [];
      }
      return [{
        mode: "tenant_employee",
        tenant_id: employee.tenant_id,
        employee_id: employee.id,
        label: `${tenant.name ?? "装修公司"} · ${employee.name ?? "员工"}`,
        tenant: serializeTenant(tenant),
        employee: serializeEmployee(employee),
      }];
    });
  }

  private buildCustomerOptions(
    memberships: BusinessMembershipRecord[],
    customers: CustomerIdentityOptionRecord[],
  ): IdentityOption[] {
    const membershipKeys = new Set(
      memberships.map((item) => `${item.tenant_id ?? ""}:${item.identity_id}`),
    );

    return customers.flatMap((customer) => {
      const tenant = relationOne(customer.tenant);
      if (
        !customer.tenant_id ||
        !tenant?.id ||
        tenant.status !== "active" ||
        !membershipKeys.has(`${customer.tenant_id}:${customer.id}`)
      ) {
        return [];
      }
      return [{
        mode: "customer",
        tenant_id: customer.tenant_id,
        customer_id: customer.id,
        label: `${tenant.name ?? "装修公司"} · ${customer.name ?? "客户"}`,
        tenant: serializeTenant(tenant),
        customer: serializeCustomer(customer),
      }];
    });
  }

  private assertSwitchPayloadAllowed(input: SwitchIdentityInput) {
    const hasPartnerMemberId = Boolean(input.partner_member_id);
    const hasTenantId = Boolean(input.tenant_id);
    const hasEmployeeId = Boolean(input.employee_id);
    const hasCustomerId = Boolean(input.customer_id);
    const allowed =
      (input.target_mode === "platform_visitor" &&
        !hasPartnerMemberId && !hasTenantId && !hasEmployeeId && !hasCustomerId) ||
      (input.target_mode === "platform_partner" &&
        hasPartnerMemberId && !hasTenantId && !hasEmployeeId && !hasCustomerId) ||
      (input.target_mode === "tenant_employee" &&
        !hasPartnerMemberId && hasTenantId && hasEmployeeId && !hasCustomerId) ||
      (input.target_mode === "customer" &&
        !hasPartnerMemberId && hasTenantId && !hasEmployeeId && hasCustomerId);

    if (!allowed) {
      throw Errors.business(
        400,
        "身份切换参数不匹配",
        "IDENTITY_SWITCH_NOT_ALLOWED",
      );
    }
  }

  private buildVisitorAuthResponse(user: JwtPayload | undefined) {
    const openid = typeof user?.openid === "string" ? user.openid.trim() : "";
    const visitorId = buildVisitorSessionId(openid);
    if (!openid || !visitorId) {
      throw Errors.business(
        400,
        "身份切换参数不匹配",
        "IDENTITY_SWITCH_NOT_ALLOWED",
      );
    }

    return {
      mode: "platform_visitor",
      authMode: "platform_visitor",
      token: this.visitorSessionSigner({
        openid,
        unionid: user?.unionid ?? null,
        visitorId,
      }),
      user_id: null,
      visitor_id: visitorId,
      roles: ["visitor"],
      is_new_user: false,
      tenant: null,
      employee: null,
      customer: null,
      has_customer_profile: false,
    };
  }

  private async buildPartnerAuthResponse(
    authUserId: string,
    user: JwtPayload | undefined,
    partnerMemberId: string,
  ) {
    const partnerMembers = await this.repository.listPartnerMembersByAuthUserId(authUserId);
    const member = partnerMembers.find((item) => item.id === partnerMemberId);
    if (!member) {
      throw Errors.business(
        404,
        "身份选项不可用",
        "IDENTITY_OPTION_NOT_FOUND",
      );
    }

    return buildPartnerAuthResponse({
      member,
      userId: authUserId,
      openid: user?.openid,
      unionid: user?.unionid ?? null,
      tokenSigner: this.tokenSigner,
    });
  }

  private buildEmployeeAuthResponse(
    authUserId: string,
    user: JwtPayload | undefined,
    option: Extract<IdentityOption, { mode: "tenant_employee" }>,
  ) {
    const roles = addRole(user?.roles, "employee");
    return {
      mode: "tenant_employee",
      authMode: "tenant_employee",
      token: this.tokenSigner({
        sub: authUserId,
        token_type: "auth",
        login_channel: "wechat",
        openid: user?.openid,
        unionid: user?.unionid ?? null,
        roles,
        tenant_id: option.tenant_id,
        tenant_slug: option.tenant.slug,
        employee_id: option.employee_id,
      }),
      user_id: authUserId,
      roles,
      is_new_user: false,
      tenant: option.tenant,
      employee: option.employee,
      customer: null,
    };
  }

  private buildCustomerAuthResponse(
    authUserId: string,
    user: JwtPayload | undefined,
    option: Extract<IdentityOption, { mode: "customer" }>,
  ) {
    const roles = addRole(user?.roles, "customer");
    return {
      mode: "customer",
      authMode: "customer",
      token: this.tokenSigner({
        sub: authUserId,
        token_type: "auth",
        login_channel: "wechat",
        openid: user?.openid,
        unionid: user?.unionid ?? null,
        roles,
        tenant_id: option.tenant_id,
        tenant_slug: option.tenant.slug,
        customer_id: option.customer_id,
      }),
      user_id: authUserId,
      roles,
      is_new_user: false,
      tenant: option.tenant,
      employee: null,
      customer: option.customer,
    };
  }

  private findOption(identities: IdentityOption[], input: SwitchIdentityInput) {
    return identities.find((item) => {
      if (item.mode !== input.target_mode) {
        return false;
      }

      if (item.mode === "platform_partner") {
        return item.partner_member_id === input.partner_member_id;
      }
      if (item.mode === "tenant_employee") {
        return item.tenant_id === input.tenant_id && item.employee_id === input.employee_id;
      }
      if (item.mode === "customer") {
        return item.tenant_id === input.tenant_id && item.customer_id === input.customer_id;
      }

      return item.mode === "platform_visitor";
    });
  }
}

export const authIdentitySwitchService = new AuthIdentitySwitchService();
