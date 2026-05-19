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

class CustomerSourceService {
  async listCustomerSources(input: {
    authContext: AuthContext;
    customerId: string;
    query: CustomerSourceListQuery;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    await this.assertCanReadCustomer(input.authContext, input.customerId, tenantId);

    return customerSourceRepository.listByCustomer({
      tenantId,
      customerId: input.customerId,
      query: input.query,
    });
  }

  async getCustomerSourceSummaryMap(input: {
    authContext: AuthContext;
    customerIds: string[];
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const rows = await customerSourceRepository.listByCustomerIds({
      tenantId,
      customerIds: input.customerIds,
    });

    const grouped = new Map<string, SerializedCustomerSource[]>();
    for (const row of rows) {
      const current = grouped.get(row.customer_id) || [];
      current.push(row);
      grouped.set(row.customer_id, current);
    }

    const result = new Map<string, CustomerSourceSummary>();
    for (const customerId of input.customerIds) {
      result.set(customerId, this.buildSummary(grouped.get(customerId) || []));
    }

    return result;
  }

  private async assertCanReadCustomer(
    authContext: AuthContext,
    customerId: string,
    tenantId: string,
  ) {
    const customer = await customerSourceRepository.findCustomerAccess({
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

  private buildSummary(rows: SerializedCustomerSource[]): CustomerSourceSummary {
    const latest = rows[0] || null;
    const hasOldCustomerNewLead = rows.some((item) => item.is_old_customer_new_lead);
    const hasPlatformNewLead = rows.some((item) => item.is_platform_new_lead);
    const hasEmployeeShare = rows.some((item) => item.is_employee_share);
    const sourceTags = [
      hasOldCustomerNewLead ? "old_customer_new_lead" : null,
      hasPlatformNewLead ? "platform_new_lead" : null,
      hasEmployeeShare ? "employee_share" : null,
    ].filter((item): item is string => Boolean(item));

    return {
      total: rows.length,
      latest_source: latest,
      source_tags: sourceTags,
      has_old_customer_new_lead: hasOldCustomerNewLead,
      has_platform_new_lead: hasPlatformNewLead,
      has_employee_share: hasEmployeeShare,
    };
  }
}

export const customerSourceService = new CustomerSourceService();
