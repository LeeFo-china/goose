import {
  wechatCustomerIdentityRepository,
  type WechatCustomerIdentityRow,
  type WechatCustomerTenantOption,
} from "@/repositories/wechat-customer-identities";
import { Errors } from "@/errors/error-factory";
import { userIdentityService } from "@/services/user-identities";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";

type AuthIdentitySource = "legacy" | "dual" | "membership";

class WechatCustomerIdentityService {
  private normalizeTenantRelation(value: WechatCustomerTenantOption["tenant"]) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private filterActiveTenantCustomers(customers: WechatCustomerTenantOption[]) {
    return customers.filter((item) => {
      const tenant = this.normalizeTenantRelation(item.tenant);
      return item.tenant_id && tenant?.status === "active";
    });
  }

  private async enrichCustomerTenantOptions(customers: WechatCustomerTenantOption[]) {
    if (customers.length === 0) {
      return [] as WechatCustomerTenantOption[];
    }

    const customerIds = customers.map((item) => item.id);
    const projects = await wechatCustomerIdentityRepository
      .listProjectSummariesByCustomerIds(customerIds);
    const projectMap = new Map<string, {
      count: number;
      latestName: string | null;
    }>();

    for (const project of projects) {
      if (!project.customer_id) continue;
      const current = projectMap.get(project.customer_id) ?? {
        count: 0,
        latestName: null,
      };
      current.count += 1;
      if (!current.latestName) {
        current.latestName = project.name ?? null;
      }
      projectMap.set(project.customer_id, current);
    }

    return customers.map((customer) => {
      const summary = projectMap.get(customer.id);
      return {
        ...customer,
        project_count: summary?.count ?? 0,
        latest_project_name: summary?.latestName ?? null,
      };
    });
  }

  async listCustomerTenantOptionsByPhone(phone: string) {
    return this.enrichCustomerTenantOptions(
      this.filterActiveTenantCustomers(
        await wechatCustomerIdentityRepository.listCustomerTenantOptionsByPhone(phone),
      ),
    );
  }

  async listCustomerTenantOptionsByAuthUser(input: {
    authUserId: string;
    identitySource: AuthIdentitySource;
  }) {
    if (input.identitySource === "membership") {
      return this.enrichCustomerTenantOptions(
        await this.listCustomerTenantOptionsByMembership(input.authUserId),
      );
    }

    const legacyCustomers = this.filterActiveTenantCustomers(
      await wechatCustomerIdentityRepository.listCustomerTenantOptionsByAuthUserId(
        input.authUserId,
      ),
    );

    if (input.identitySource === "legacy") {
      return this.enrichCustomerTenantOptions(legacyCustomers);
    }

    const membershipCustomers = await this.listCustomerTenantOptionsByMembership(
      input.authUserId,
    );
    const customerMap = new Map<string, WechatCustomerTenantOption>();
    for (const customer of [...membershipCustomers, ...legacyCustomers]) {
      customerMap.set(customer.id, customer);
    }

    return this.enrichCustomerTenantOptions(Array.from(customerMap.values()));
  }

  async listCustomerTenantOptionsByMembership(authUserId: string) {
    const memberships = await userIdentityService.listActiveBusinessMemberships({
      userId: authUserId,
      identityType: "customer",
    });
    const customerIds = Array.from(new Set(memberships.map((item) => item.identity_id)));
    if (customerIds.length === 0) {
      return [] as WechatCustomerTenantOption[];
    }

    const membershipTenantMap = new Map(
      memberships.map((item) => [item.identity_id, item.tenant_id]),
    );
    const customers = await wechatCustomerIdentityRepository
      .listCustomerTenantOptionsByIds(customerIds);
    return customers.filter((item) => {
      const tenant = this.normalizeTenantRelation(item.tenant);
      const membershipTenantId = membershipTenantMap.get(item.id);
      return (
        item.tenant_id &&
        item.tenant_id === membershipTenantId &&
        tenant?.status === "active"
      );
    });
  }

  getCustomerTenantOptionById(customerId: string, tenantId: string) {
    return wechatCustomerIdentityRepository.getCustomerTenantOptionById(
      customerId,
      tenantId,
    );
  }

  bindCustomerAuthUser(input: {
    authUserId: string;
    customer: Pick<
      WechatCustomerIdentityRow,
      "id" | "tenant_id" | "claimed_at"
    >;
  }) {
    return wechatCustomerIdentityRepository.bindCustomerAuthUser({
      customerId: input.customer.id,
      authUserId: input.authUserId,
      tenantId: input.customer.tenant_id,
      claimedAt: input.customer.claimed_at ? null : new Date().toISOString(),
    });
  }

  async bindCustomerRole(input: {
    authUserId: string;
    phone: string;
    createIfMissing?: boolean;
    customerOrigin?: string | null;
  }) {
    const [customers, currentBindings] = await Promise.all([
      wechatCustomerIdentityRepository.listCustomerIdentitiesByPhone(input.phone),
      wechatCustomerIdentityRepository.listCustomerIdentitiesByAuthUserId(
        input.authUserId,
        2,
      ),
    ]);

    if (currentBindings.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
    }
    const currentBinding = currentBindings[0] || null;

    if (customers.length === 0) {
      if (!input.createIfMissing) {
        throw Errors.badRequest("该手机号未绑定客户身份");
      }

      if (currentBinding) {
        throw Errors.badRequest("当前微信已绑定其他客户，请联系工作人员");
      }

      const customerOrigin = input.customerOrigin || "visitor_self_registered";
      if (customerOrigin !== "visitor_self_registered") {
        throw Errors.badRequest("当前客户创建渠道不支持自助注册");
      }

      await wechatCustomerIdentityRepository.createSelfRegisteredCustomer({
        phone: input.phone,
        authUserId: input.authUserId,
        registeredAt: new Date().toISOString(),
      });

      return;
    }

    if (customers.length > 1) {
      throw Errors.badRequest("该手机号绑定了多个客户档案，请联系管理员处理");
    }

    const customer = customers[0];
    if (!customer) {
      throw Errors.badRequest("该手机号未绑定客户身份");
    }

    if (currentBinding && currentBinding.id !== customer.id) {
      throw Errors.badRequest("当前微信已绑定其他客户，请联系工作人员");
    }

    await wechatRebindRequestService.assertCustomerCanBind(
      input.authUserId,
      customer,
    );

    await this.bindCustomerAuthUser({
      authUserId: input.authUserId,
      customer,
    });

    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: input.authUserId,
      tenantId: customer.tenant_id,
      identityType: "customer",
      identityId: customer.id,
      source: "customer_verify_role_bind",
    });
  }
}

export type CustomerIdentityRow = WechatCustomerIdentityRow;
export type CustomerTenantOption = WechatCustomerTenantOption;

export const wechatCustomerIdentityService =
  new WechatCustomerIdentityService();
