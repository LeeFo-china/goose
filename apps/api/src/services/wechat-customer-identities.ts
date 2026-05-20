import {
  wechatCustomerIdentityRepository,
  type WechatCustomerIdentityRow,
  type WechatLoginMembershipRow,
  type WechatCustomerTenantOption,
} from "@/repositories/wechat-customer-identities";
import { Errors } from "@/errors/error-factory";
import { userIdentityService } from "@/services/user-identities";
import type { UserBusinessMembershipRecord } from "@/repositories/user-identities";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";

const CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS = 60_000;
const MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE = 4_000;

type WechatLoginMembershipState = {
  memberships: UserBusinessMembershipRecord[];
  customerOptions: WechatCustomerTenantOption[];
};

class WechatCustomerIdentityService {
  private customerTenantOptionsCache = new Map<string, {
    expiresAt: number;
    value: WechatCustomerTenantOption[];
  }>();
  private customerTenantOptionsInFlight = new Map<string, Promise<WechatCustomerTenantOption[]>>();
  private loginMembershipStateCache = new Map<string, {
    expiresAt: number;
    value: WechatLoginMembershipState;
  }>();
  private loginMembershipStateInFlight = new Map<string, Promise<WechatLoginMembershipState>>();

  private customerTenantOptionsCacheKey(input: {
    authUserId: string;
    includeProjectSummary?: boolean;
  }) {
    return [
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

  private getCachedLoginMembershipState(authUserId: string) {
    const cached = this.loginMembershipStateCache.get(authUserId);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.loginMembershipStateCache.delete(authUserId);
      return null;
    }

    return cached.value;
  }

  private setCachedLoginMembershipState(authUserId: string, value: WechatLoginMembershipState) {
    const now = Date.now();
    if (this.loginMembershipStateCache.size >= MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE) {
      for (const [key, item] of this.loginMembershipStateCache.entries()) {
        if (item.expiresAt <= now) {
          this.loginMembershipStateCache.delete(key);
        }
      }

      if (this.loginMembershipStateCache.size >= MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE) {
        this.loginMembershipStateCache.clear();
      }
    }

    this.loginMembershipStateCache.set(authUserId, {
      expiresAt: now + CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS,
      value,
    });
  }

  invalidateCustomerTenantOptions(authUserId?: string | null) {
    if (!authUserId) {
      return;
    }

    this.loginMembershipStateCache.delete(authUserId);
    this.loginMembershipStateInFlight.delete(authUserId);

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

  private mapLoginMembership(row: WechatLoginMembershipRow): UserBusinessMembershipRecord {
    return {
      id: row.membership_id,
      user_id: row.user_id,
      tenant_id: row.tenant_id,
      identity_type: row.identity_type as UserBusinessMembershipRecord["identity_type"],
      identity_id: row.identity_id,
      status: row.status as UserBusinessMembershipRecord["status"],
      is_default: row.is_default,
      created_at: "",
      updated_at: "",
    };
  }

  private mapLoginCustomerOption(row: WechatLoginMembershipRow): WechatCustomerTenantOption | null {
    if (
      row.identity_type !== "customer" ||
      row.customer_id !== row.identity_id ||
      !row.customer_id ||
      !row.tenant_id ||
      row.tenant_status !== "active"
    ) {
      return null;
    }

    return {
      id: row.customer_id,
      name: row.customer_name,
      phone: row.customer_phone,
      user_id: row.customer_user_id,
      tenant_id: row.tenant_id,
      customer_origin: row.customer_origin,
      claimed_at: row.customer_claimed_at,
      tenant: {
        id: row.tenant_id,
        name: row.tenant_name,
        slug: row.tenant_slug,
        status: row.tenant_status,
      },
    };
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
    includeProjectSummary?: boolean;
  }) {
    const maybeEnrich = (customers: WechatCustomerTenantOption[]) => (
      input.includeProjectSummary
        ? this.enrichCustomerTenantOptions(customers)
        : customers
    );

    return maybeEnrich(await this.listCustomerTenantOptionsByMembership(input.authUserId));
  }

  async listCustomerTenantOptionsByAuthUser(input: {
    authUserId: string;
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

  private async loadWechatLoginMembershipState(authUserId: string) {
    const rows = await wechatCustomerIdentityRepository.listWechatLoginMemberships(authUserId);
    const memberships = rows.map((row) => this.mapLoginMembership(row));
    const customerOptions = rows
      .map((row) => this.mapLoginCustomerOption(row))
      .filter((item): item is WechatCustomerTenantOption => Boolean(item));

    this.setCachedCustomerTenantOptions(
      this.customerTenantOptionsCacheKey({ authUserId }),
      customerOptions,
    );

    return {
      memberships,
      customerOptions,
    };
  }

  async resolveWechatLoginMembershipState(authUserId: string) {
    const cached = this.getCachedLoginMembershipState(authUserId);
    if (cached) {
      return cached;
    }

    const inFlight = this.loginMembershipStateInFlight.get(authUserId);
    if (inFlight) {
      return inFlight;
    }

    const request = this.loadWechatLoginMembershipState(authUserId)
      .then((result) => {
        this.setCachedLoginMembershipState(authUserId, result);
        return result;
      })
      .finally(() => {
        if (this.loginMembershipStateInFlight.get(authUserId) === request) {
          this.loginMembershipStateInFlight.delete(authUserId);
        }
      });
    this.loginMembershipStateInFlight.set(authUserId, request);
    return request;
  }

  async listCustomerTenantOptionsByMemberships(input: {
    authUserId: string;
    memberships: UserBusinessMembershipRecord[];
    includeProjectSummary?: boolean;
  }) {
    const cacheKey = this.customerTenantOptionsCacheKey({
      authUserId: input.authUserId,
      includeProjectSummary: input.includeProjectSummary,
    });
    const cached = this.getCachedCustomerTenantOptions(cacheKey);
    if (cached) {
      return cached;
    }

    const memberships = input.memberships.filter((item) => (
      item.status === "active" && item.identity_type === "customer"
    ));
    const customerIds = Array.from(new Set(memberships.map((item) => item.identity_id)));
    if (customerIds.length === 0) {
      return [] as WechatCustomerTenantOption[];
    }

    const membershipTenantMap = new Map(
      memberships.map((item) => [item.identity_id, item.tenant_id]),
    );
    const customers = await wechatCustomerIdentityRepository
      .listCustomerTenantOptionsByIds(customerIds);
    const activeCustomers = customers.filter((item) => {
      const tenant = this.normalizeTenantRelation(item.tenant);
      const membershipTenantId = membershipTenantMap.get(item.id);
      return (
        item.tenant_id &&
        item.tenant_id === membershipTenantId &&
        tenant?.status === "active"
      );
    });
    const result = input.includeProjectSummary
      ? await this.enrichCustomerTenantOptions(activeCustomers)
      : activeCustomers;
    this.setCachedCustomerTenantOptions(cacheKey, result);
    return result;
  }

  async listCustomerTenantOptionsByMembership(authUserId: string) {
    const memberships = await userIdentityService.listActiveBusinessMemberships({
      userId: authUserId,
      identityType: "customer",
    });
    return this.listCustomerTenantOptionsByMemberships({
      authUserId,
      memberships,
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
