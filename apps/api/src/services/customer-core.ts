import { Errors } from "@/errors/error-factory";
import {
  customerCoreRepository,
  type CustomerCoreAccessRow,
  type CustomerCoreRow,
} from "@/repositories/customer-core";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

class CustomerCoreService {
  async createCustomer(payload: Record<string, unknown>) {
    return customerCoreRepository.create(payload);
  }

  async getRequiredCustomerAccess(input: {
    authContext: AuthContext;
    customerId: string;
    message?: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findAccessById({
      customerId: input.customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.notFound(input.message ?? "客户不存在");
    }

    return customer;
  }

  async getCustomerDetail(input: {
    authContext: AuthContext;
    customerId: string;
    notFoundAs?: "bad_request" | "not_found";
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findById({
      customerId: input.customerId,
      tenantId,
    });

    if (!customer) {
      this.throwCustomerNotFound(input.notFoundAs);
    }

    await this.assertCanAccessCustomer(
      input.authContext,
      customer!,
      "customer.read",
    );

    return customer!;
  }

  async invalidateCustomer(input: {
    authContext: AuthContext;
    customerId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const customer = await customerCoreRepository.findAccessById({
      customerId: input.customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.badRequest("客户不存在");
    }

    await this.assertCanAccessCustomer(
      input.authContext,
      customer,
      "customer.update",
    );

    return customerCoreRepository.markInvalid({
      customerId: input.customerId,
      tenantId,
    });
  }

  private async assertCanAccessCustomer(
    authContext: AuthContext,
    customer: CustomerCoreAccessRow,
    permissionCode: "customer.read" | "customer.update",
  ) {
    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      permissionCode,
    );
    if (!canAccess) {
      throw Errors.forbidden();
    }
  }

  private throwCustomerNotFound(kind: "bad_request" | "not_found" = "bad_request"): never {
    if (kind === "not_found") {
      throw Errors.notFound("客户不存在");
    }

    throw Errors.badRequest("客户不存在");
  }
}

export const customerCoreService = new CustomerCoreService();
export type { CustomerCoreAccessRow, CustomerCoreRow };
