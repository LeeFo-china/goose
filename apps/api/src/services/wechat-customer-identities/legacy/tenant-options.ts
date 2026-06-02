import {
  customerTenantOptionsCacheKey,
  getCachedCustomerTenantOptions,
  setCachedCustomerTenantOptions,
} from "./cache";
import {
  enrichCustomerTenantOptions,
  filterActiveTenantCustomers,
  normalizeTenantRelation,
} from "./mappers";
import {
  userIdentityService,
  wechatCustomerIdentityRepository,
  type UserBusinessMembershipRecord,
  type WechatCustomerIdentityCacheContext,
  type WechatCustomerTenantOption,
} from "./shared";

export async function listCustomerTenantOptionsByPhone(phone: string) {
  return enrichCustomerTenantOptions(
    filterActiveTenantCustomers(
      await wechatCustomerIdentityRepository.listCustomerTenantOptionsByPhone(phone),
    ),
  );
}

async function loadCustomerTenantOptionsByAuthUser(
  this: WechatCustomerIdentityCacheContext,
  input: {
    authUserId: string;
    includeProjectSummary?: boolean;
  },
) {
  const customers = await listCustomerTenantOptionsByMembership.call(
    this,
    input.authUserId,
  );
  return input.includeProjectSummary
    ? enrichCustomerTenantOptions(customers)
    : customers;
}

export async function listCustomerTenantOptionsByAuthUser(
  this: WechatCustomerIdentityCacheContext,
  input: {
    authUserId: string;
    includeProjectSummary?: boolean;
  },
) {
  const cacheKey = customerTenantOptionsCacheKey(input);
  const cached = getCachedCustomerTenantOptions(this, cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = this.customerTenantOptionsInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = loadCustomerTenantOptionsByAuthUser.call(this, input)
    .then((result) => {
      setCachedCustomerTenantOptions(this, cacheKey, result);
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

export async function listCustomerTenantOptionsByMemberships(
  this: WechatCustomerIdentityCacheContext,
  input: {
    authUserId: string;
    memberships: UserBusinessMembershipRecord[];
    includeProjectSummary?: boolean;
  },
) {
  const cacheKey = customerTenantOptionsCacheKey({
    authUserId: input.authUserId,
    includeProjectSummary: input.includeProjectSummary,
  });
  const cached = getCachedCustomerTenantOptions(this, cacheKey);
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
    const tenant = normalizeTenantRelation(item.tenant);
    const membershipTenantId = membershipTenantMap.get(item.id);
    return (
      item.tenant_id &&
      item.tenant_id === membershipTenantId &&
      tenant?.status === "active"
    );
  });
  const result = input.includeProjectSummary
    ? await enrichCustomerTenantOptions(activeCustomers)
    : activeCustomers;
  setCachedCustomerTenantOptions(this, cacheKey, result);
  return result;
}

export async function listCustomerTenantOptionsByMembership(
  this: WechatCustomerIdentityCacheContext,
  authUserId: string,
) {
  const memberships = await userIdentityService.listActiveBusinessMemberships({
    userId: authUserId,
    identityType: "customer",
  });
  return listCustomerTenantOptionsByMemberships.call(this, {
    authUserId,
    memberships,
  });
}

export function getCustomerTenantOptionById(customerId: string, tenantId: string) {
  return wechatCustomerIdentityRepository.getCustomerTenantOptionById(
    customerId,
    tenantId,
  );
}
