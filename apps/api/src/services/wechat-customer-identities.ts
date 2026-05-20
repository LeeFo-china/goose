import {
  wechatCustomerIdentityRepository,
  type WechatCustomerIdentityRow,
  type WechatCustomerTenantOption,
} from "@/repositories/wechat-customer-identities";
import { Errors } from "@/errors/error-factory";
import { userIdentityService } from "@/services/user-identities";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";

type AuthIdentitySource = "legacy" | "dual" | "membership";

const CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS = 10_000;
const MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE = 4_000;

class WechatCustomerIdentityService {
  private customerTenantOptionsCache = new Map<string, {
    expiresAt: number;
    value: WechatCustomerTenantOption[];
  }>();
  private customerTenantOptionsInFlight = new Map<string, Promise<WechatCustomerTenantOption[]>>();

  private customerTenantOptionsCacheKey(input: {
    authUserId: string;
    identitySource: AuthIdentitySource;
    includeProjectSummary?: boolean;
  }) {
    return [
      input.identitySource,
      input.includeProjectSummary ? "summary" : "lean",
      input.authUserId,
    ].join(":");
  }

  private getCachedCustomerTenantOptions(cacheKey: string) {
    const cached = this.customerTenantOptionsCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.customerTenantOptionsCache.delete(cacheKey);
      return null;
    }

    return cached.value;
  }

  private setCachedCustomerTenantOptions(cacheKey: string, value: WechatCustomerTenantOption[]) {
    const now = Date.now();
    if (this.customerTenantOptionsCache.size >= MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE) {
      for (const [key, item] of this.customerTenantOptionsCache.entries()) {
        if (item.expiresAt <= now) {
          this.customerTenantOptionsCache.delete(key);
        }
      }

      if (this.customerTenantOptionsCache.size >= MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE) {
        this.customerTenantOptionsCache.clear();
      }
    }

    this.customerTenantOptionsCache.set(cacheKey, {
      expiresAt: now + CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS,
      value,
    });
  }

  invalidateCustomerTenantOptions(authUserId?: string | null) {
    if (!authUserId) {
      return;
    }

    for (const key of this.customerTenantOptionsCache.keys()) {
      if (key.endsWith(`:${authUserId}`)) {
        this.customerTenantOptionsCache.delete(key);
        this.customerTenantOptionsInFlight.delete(key);
      }
    }
  }

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

  private async loadCustomerTenantOptionsByAuthUser(input: {
    authUserId: string;
    identitySource: AuthIdentitySource;
    includeProjectSummary?: boolean;
  }) {
    const maybeEnrich = (customers: WechatCustomerTenantOption[]) => (
      input.includeProjectSummary
        ? this.enrichCustomerTenantOptions(customers)
        : customers
    );

    if (input.identitySource === "membership") {
      return maybeEnrich(await this.listCustomerTenantOptionsByMembership(input.authUserId));
    }

    const legacyCustomers = this.filterActiveTenantCustomers(
      await wechatCustomerIdentityRepository.listCustomerTenantOptionsByAuthUserId(
        input.authUserId,
      ),
    );

    if (input.identitySource === "legacy") {
      return maybeEnrich(legacyCustomers);
    }

    const membershipCustomers = await this.listCustomerTenantOptionsByMembership(
      input.authUserId,
    );
    const customerMap = new Map<string, WechatCustomerTenantOption>();
    for (const customer of [...membershipCustomers, ...legacyCustomers]) {
      customerMap.set(customer.id, customer);
    }

    return maybeEnrich(Array.from(customerMap.values()));
  }

  async listCustomerTenantOptionsByAuthUser(input: {
    authUserId: string;
    identitySource: AuthIdentitySource;
    includeProjectSummary?: boolean;
  }) {
    const cacheKey = this.customerTenantOptionsCacheKey(input);
    const cached = this.getCachedCustomerTenantOptions(cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = this.customerTenantOptionsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = this.loadCustomerTenantOptionsByAuthUser(input)
      .then((result) => {
        this.setCachedCustomerTenantOptions(cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.customerTenantOptionsInFlight.get(cacheKey) === request) {
          this.customerTenantOptionsInFlight.delete(cacheKey);
        }
      });
    this.customerTenantOptionsInFlight.set(cacheKey, request);
    return request;
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

  async bindCustomerAuthUser(input: {
    authUserId: string;
    customer: Pick<
      WechatCustomerIdentityRow,
      "id" | "tenant_id" | "claimed_at"
    >;
  }) {
    const result = await wechatCustomerIdentityRepository.bindCustomerAuthUser({
      customerId: input.customer.id,
      authUserId: input.authUserId,
      tenantId: input.customer.tenant_id,
      claimedAt: input.customer.claimed_at ? null : new Date().toISOString(),
    });
    this.invalidateCustomerTenantOptions(input.authUserId);
    return result;
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
      this.invalidateCustomerTenantOptions(input.authUserId);

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
    this.invalidateCustomerTenantOptions(input.authUserId);
  }
}

export type CustomerIdentityRow = WechatCustomerIdentityRow;
export type CustomerTenantOption = WechatCustomerTenantOption;

export const wechatCustomerIdentityService =
  new WechatCustomerIdentityService();
