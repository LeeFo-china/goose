import { Errors } from "@/errors/error-factory";
import {
  customerOwnerAssignmentRepository,
  type AssignableCustomer,
} from "@/repositories/customer-owner-assignments";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import { workflowRepository } from "@/repositories/workflows";
import type { BatchAssignCustomerOwnerInput } from "@/schema/customer";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";

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
  async assertActiveTenantOwner(input: {
    ownerId: string;
    tenantId: string;
  }) {
    const targetEmployee = await customerOwnerAssignmentRepository.findTargetEmployee({
      ownerId: input.ownerId,
      tenantId: input.tenantId,
    });

    if (!targetEmployee || targetEmployee.status !== "active") {
      throw Errors.badRequest("目标负责人不存在或不可用");
    }

    return targetEmployee;
  }

  async assertCanAssignSingleOwner(input: {
    authContext: AuthContext;
    customer: AssignableCustomer;
    ownerId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const targetEmployee = await this.assertActiveTenantOwner({
      ownerId: input.ownerId,
      tenantId,
    });
    const canAssign = await accessPolicyService.canAssignCustomerOwner(
      input.authContext,
      input.customer,
      targetEmployee,
    );
    if (!canAssign) {
      throw Errors.forbidden();
    }

    return targetEmployee;
  }

  async batchAssignOwner(input: {
    authContext: AuthContext;
    payload: BatchAssignCustomerOwnerInput;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    if (!accessPolicyService.hasPermission(input.authContext, "customer.assign_owner")) {
      throw Errors.business(403, "无权批量分配客户负责人", "FORBIDDEN");
    }

    const targetEmployee = await this.assertActiveTenantOwner({
      ownerId: input.payload.owner_id,
      tenantId,
    });

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
    await this.syncWorkflowTasksAfterOwnerAssignments({
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

  async syncWorkflowTasksAfterOwnerAssignment(input: {
    customerId: string;
    ownerId: string;
    tenantId: string;
  }) {
    const instance = await workflowRepository.findLatestRunningRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: "customer",
      subjectId: input.customerId,
    });
    if (!instance?.current_node_key) {
      return;
    }

    await workflowTaskRepository.assignPendingTask({
      tenantId: input.tenantId,
      instanceId: instance.id,
      nodeKey: instance.current_node_key,
      assigneeEmployeeId: input.ownerId,
    });
    await workflowSubjectStateService.syncFromRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: "customer",
      subjectId: input.customerId,
      definitionId: instance.definition_id,
      instanceId: instance.id,
    });
  }

  private async syncWorkflowTasksAfterOwnerAssignments(input: {
    customerIds: string[];
    ownerId: string;
    tenantId: string;
  }) {
    for (const customerId of input.customerIds) {
      await this.syncWorkflowTasksAfterOwnerAssignment({
        customerId,
        ownerId: input.ownerId,
        tenantId: input.tenantId,
      });
    }
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
