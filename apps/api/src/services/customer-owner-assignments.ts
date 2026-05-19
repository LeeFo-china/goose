import { Errors } from "@/errors/error-factory";
import {
  customerOwnerAssignmentRepository,
  type AssignableCustomer,
} from "@/repositories/customer-owner-assignments";
import type { BatchAssignCustomerOwnerInput } from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type BatchAssignCustomerOwnerFailedItem = {
  customer_id: string;
  reason:
    | "out_of_scope"
    | "customer_not_found"
    | "customer_already_assigned"
    | "target_owner_not_found"
    | "target_owner_inactive"
    | "target_owner_out_of_scope";
  message: string;
};

class CustomerOwnerAssignmentService {
  async batchAssignOwner(input: {
    authContext: AuthContext;
    payload: BatchAssignCustomerOwnerInput;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    if (!accessPolicyService.hasPermission(input.authContext, "customer.assign_owner")) {
      throw Errors.business(403, "无权批量分配客户负责人", "FORBIDDEN");
    }

    const targetEmployee = await customerOwnerAssignmentRepository.findTargetEmployee({
      ownerId: input.payload.owner_id,
      tenantId,
    });

    if (!targetEmployee) {
      throw Errors.badRequest("目标负责人不存在或不可用");
    }

    if (targetEmployee.status !== "active") {
      throw Errors.badRequest("目标负责人不存在或不可用");
    }

    if (!accessPolicyService.canAssignCustomerOwnerTarget(
      input.authContext,
      targetEmployee,
    )) {
      throw Errors.badRequest("目标负责人不在你的可分配范围内");
    }

    const customerIds = Array.from(new Set(input.payload.customer_ids));
    const customers = await customerOwnerAssignmentRepository.listCustomers({
      customerIds,
      tenantId,
    });
    const customerMap = new Map(customers.map((item) => [item.id, item]));
    const failedItems: BatchAssignCustomerOwnerFailedItem[] = [];
    const successCustomerIds: string[] = [];

    for (const customerId of customerIds) {
      const customer = customerMap.get(customerId);
      if (!customer) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_not_found",
          message: "客户不存在",
        });
        continue;
      }

      const canAssign = await this.canAssignCustomer(
        input.authContext,
        customer,
        targetEmployee,
      );
      if (!canAssign) {
        failedItems.push({
          customer_id: customerId,
          reason: "out_of_scope",
          message: "当前客户不在你的可分配范围内",
        });
        continue;
      }

      if (
        input.payload.mode === "only_unassigned" &&
        customer.owner_id &&
        customer.owner_id !== input.payload.owner_id
      ) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_already_assigned",
          message: "当前客户已分配负责人",
        });
        continue;
      }

      if (customer.owner_id === input.payload.owner_id) {
        failedItems.push({
          customer_id: customerId,
          reason: "customer_already_assigned",
          message: "当前客户已分配给该负责人",
        });
        continue;
      }

      successCustomerIds.push(customerId);
    }

    await customerOwnerAssignmentRepository.updateOwner({
      customerIds: successCustomerIds,
      ownerId: input.payload.owner_id,
      tenantId,
    });

    return {
      success_count: successCustomerIds.length,
      failed_count: failedItems.length,
      target_owner: {
        id: targetEmployee.id,
        name: targetEmployee.name ?? null,
      },
      failed_items: failedItems,
    };
  }

  private async canAssignCustomer(
    authContext: AuthContext,
    customer: AssignableCustomer,
    targetEmployee: Parameters<typeof accessPolicyService.canAssignCustomerOwner>[2],
  ) {
    return accessPolicyService.canAssignCustomerOwner(
      authContext,
      customer,
      targetEmployee,
    );
  }
}

export const customerOwnerAssignmentService =
  new CustomerOwnerAssignmentService();
