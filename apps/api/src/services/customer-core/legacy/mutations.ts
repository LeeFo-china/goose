import { Errors } from "@/errors/error-factory";
import {
  customerCoreRepository,
} from "@/repositories/customer-core";
import type {
  CustomerStatusTransitionInput,
} from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerStatusService } from "@/services/customer-status";
import { assertCanAccessCustomer } from "./access";

export async function createCustomer(
  payload: Record<string, unknown>,
  invalidateListCache: () => void,
) {
  const customer = await customerCoreRepository.create(payload);
  invalidateListCache();
  return customer;
}

export async function updateCustomer(input: {
  authContext: AuthContext;
  customerId: string;
  payload: Record<string, unknown>;
  invalidateListCache: () => void;
}) {
  const tenantId = accessPolicyService.assertTenantContext(input.authContext);
  const hasStatusChange = Object.prototype.hasOwnProperty.call(
    input.payload,
    "status",
  );
  if (hasStatusChange) {
    const existing = await customerCoreRepository.findById({
      customerId: input.customerId,
      tenantId,
    });

    if (!existing) {
      throw Errors.badRequest("客户不存在");
    }

    const transitionPayload = customerStatusService.buildTransitionPayloadFromStatus({
      existing,
      nextStatus: input.payload.status,
    });
    if (!transitionPayload) {
      const patch = { ...input.payload };
      delete patch.status;
      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const customer = await customerCoreRepository.updateById({
        customerId: input.customerId,
        tenantId,
        payload: patch,
      });
      input.invalidateListCache();
      return customer;
    }

    const customer = await customerStatusService.transitionCustomerStatus({
      authContext: input.authContext,
      customerId: input.customerId,
      payload: transitionPayload,
      patch: input.payload,
      existing,
    });
    input.invalidateListCache();
    return customer;
  }

  if (Object.keys(input.payload).length === 0) {
    const customer = await customerCoreRepository.findById({
      customerId: input.customerId,
      tenantId,
    });

    if (!customer) {
      throw Errors.badRequest("客户不存在");
    }

    return customer;
  }

  const customer = await customerCoreRepository.updateById({
    customerId: input.customerId,
    tenantId,
    payload: input.payload,
  });
  input.invalidateListCache();
  return customer;
}

export async function transitionCustomerStatus(input: {
  authContext: AuthContext;
  customerId: string;
  payload: CustomerStatusTransitionInput;
  existing?: Record<string, unknown> | null;
  skipAccessCheck?: boolean;
  invalidateListCache: () => void;
}) {
  const customer = await customerStatusService.transitionCustomerStatus(input);
  input.invalidateListCache();
  return customer;
}

export async function invalidateCustomer(input: {
  authContext: AuthContext;
  customerId: string;
  invalidateListCache: () => void;
}) {
  const tenantId = accessPolicyService.assertTenantContext(input.authContext);
  const customer = await customerCoreRepository.findAccessById({
    customerId: input.customerId,
    tenantId,
  });

  if (!customer) {
    throw Errors.badRequest("客户不存在");
  }

  await assertCanAccessCustomer(
    input.authContext,
    customer,
    "customer.update",
  );

  const invalidatedCustomer = await customerStatusService.transitionCustomerStatus({
    authContext: input.authContext,
    customerId: input.customerId,
    payload: {
      action: "mark_invalid",
      reason: "通过删除客户接口作废",
      metadata: {
        source: "DELETE /customers/:id",
      },
    },
    existing: customer,
  });
  input.invalidateListCache();
  return invalidatedCustomer;
}
