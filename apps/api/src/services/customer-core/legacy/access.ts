import { Errors } from "@/errors/error-factory";
import {
  customerCoreRepository,
  type CustomerCoreAccessRow,
} from "@/repositories/customer-core";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export async function assertCanAccessCustomer(
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

function throwCustomerNotFound(kind: "bad_request" | "not_found" = "bad_request"): never {
  if (kind === "not_found") {
    throw Errors.notFound("客户不存在");
  }

  throw Errors.badRequest("客户不存在");
}

export async function getRequiredCustomerAccess(input: {
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

export async function getRequiredCustomerForUpdate(input: {
  authContext: AuthContext;
  customerId: string;
}) {
  return getRequiredCustomerAccess(input);
}

export async function getCustomerDetail(input: {
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
    throwCustomerNotFound(input.notFoundAs);
  }

  await assertCanAccessCustomer(
    input.authContext,
    customer!,
    "customer.read",
  );

  return customer!;
}
