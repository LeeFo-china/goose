import { Errors } from "@/errors/error-factory";
import {
  customerSourceRepository,
  type SerializedCustomerSource,
} from "@/repositories/customer-sources";
import type { CustomerSourceListQuery } from "@/schema/customer-sources";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type CustomerSourceSummary = {
  total: number;
  latest_source: SerializedCustomerSource | null;
  source_tags: string[];
  has_old_customer_new_lead: boolean;
  has_platform_new_lead: boolean;
  has_employee_share: boolean;
};

type CustomerSourceRepositoryPort = Pick<
  typeof customerSourceRepository,
  "findCustomerAccess" | "listByCustomer" | "listByCustomerIds"
>;

export class CustomerSourceService {
  constructor(
    private readonly repository: CustomerSourceRepositoryPort = customerSourceRepository,
  ) {}

  async listCustomerSources(input: {
    authContext: AuthContext;
    customerId: string;
    query: CustomerSourceListQuery;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    await this.assertCanReadCustomer(input.authContext, input.customerId, tenantId);

    return this.repository.listByCustomer({
      tenantId,
      customerId: input.customerId,
      query: input.query,
    });
  }

  async listAccessibleCustomerSources(input: {
    tenantId: string;
    customerId: string;
    query: CustomerSourceListQuery;
  }) {
    return this.repository.listByCustomer({
      tenantId: input.tenantId,
      customerId: input.customerId,
      query: input.query,
    });
  }

  async getCustomerSourceSummaryMap(input: {
    authContext: AuthContext;
    customerIds: string[];
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const rows = await this.repository.listByCustomerIds({
      tenantId,
      customerIds: input.customerIds,
    });

    const result = new Map<string, CustomerSourceSummary>();
    for (const row of rows) {
      result.set(row.customerId, this.buildSummary(row));
    }

    return result;
  }

  private async assertCanReadCustomer(
    authContext: AuthContext,
    customerId: string,
    tenantId: string,
  ) {
    const customer = await this.repository.findCustomerAccess({
      customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.business(404, "客户不存在", "CUSTOMER_NOT_FOUND");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      "customer.read",
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }
  }

  private buildSummary(row: {
    total: number;
    latestSource: SerializedCustomerSource | null;
    hasOldCustomerNewLead: boolean;
    hasPlatformNewLead: boolean;
    hasEmployeeShare: boolean;
  }): CustomerSourceSummary {
    const sourceTags = [
      row.hasOldCustomerNewLead ? "old_customer_new_lead" : null,
      row.hasPlatformNewLead ? "platform_new_lead" : null,
      row.hasEmployeeShare ? "employee_share" : null,
    ].filter((item): item is string => Boolean(item));

    return {
      total: row.total,
      latest_source: row.latestSource,
      source_tags: sourceTags,
      has_old_customer_new_lead: row.hasOldCustomerNewLead,
      has_platform_new_lead: row.hasPlatformNewLead,
      has_employee_share: row.hasEmployeeShare,
    };
  }
}

export const customerSourceService = new CustomerSourceService();
