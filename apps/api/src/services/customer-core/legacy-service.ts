import type {
  CustomerStatusTransitionInput,
  CustomerStatusTransitionListQuery,
} from "@/schema/customer";
import type { AuthContext } from "@/services/authorization";
import { customerStatusService } from "@/services/customer-status";
import {
  getCustomerDetail,
  getRequiredCustomerAccess,
  getRequiredCustomerForUpdate,
} from "./legacy/access";
import { CustomerListManager } from "./legacy/list-manager";
import {
  createCustomer,
  invalidateCustomer,
  transitionCustomerStatus,
  updateCustomer,
} from "./legacy/mutations";

class CustomerCoreService {
  private listManager = new CustomerListManager();

  getFollowUpState(input: {
    nextFollowAt: string | null | undefined;
    customerStatus?: string | null | undefined;
  }) {
    return this.listManager.getFollowUpState(input);
  }

  listCustomers(input: Parameters<CustomerListManager["listCustomers"]>[0]) {
    return this.listManager.listCustomers(input);
  }

  createCustomer(payload: Record<string, unknown>) {
    return createCustomer(payload, () => this.listManager.invalidateListCache());
  }

  getRequiredCustomerAccess(input: Parameters<typeof getRequiredCustomerAccess>[0]) {
    return getRequiredCustomerAccess(input);
  }

  getRequiredCustomerForUpdate(input: Parameters<typeof getRequiredCustomerForUpdate>[0]) {
    return getRequiredCustomerForUpdate(input);
  }

  updateCustomer(input: {
    authContext: AuthContext;
    customerId: string;
    payload: Record<string, unknown>;
  }) {
    return updateCustomer({
      ...input,
      invalidateListCache: () => this.listManager.invalidateListCache(),
    });
  }

  transitionCustomerStatus(input: {
    authContext: AuthContext;
    customerId: string;
    payload: CustomerStatusTransitionInput;
    existing?: Record<string, unknown> | null;
    skipAccessCheck?: boolean;
  }) {
    return transitionCustomerStatus({
      ...input,
      invalidateListCache: () => this.listManager.invalidateListCache(),
    });
  }

  listCustomerStatusActions(input: {
    authContext: AuthContext;
    customerId: string;
  }) {
    return customerStatusService.listCustomerStatusActions(input);
  }

  listCustomerStatusTransitions(input: {
    authContext: AuthContext;
    customerId: string;
    query: CustomerStatusTransitionListQuery;
  }) {
    return customerStatusService.listCustomerStatusTransitions(input);
  }

  getCustomerDetail(input: Parameters<typeof getCustomerDetail>[0]) {
    return getCustomerDetail(input);
  }

  invalidateCustomer(input: {
    authContext: AuthContext;
    customerId: string;
  }) {
    return invalidateCustomer({
      ...input,
      invalidateListCache: () => this.listManager.invalidateListCache(),
    });
  }
}

export const customerCoreService = new CustomerCoreService();
export type {
  CustomerCoreAccessRow,
  CustomerCoreRow,
} from "@/repositories/customer-core";
