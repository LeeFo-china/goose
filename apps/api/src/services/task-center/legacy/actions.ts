import { buildProjectAcceptanceTodos } from "./builders-acceptance";
import { buildCustomerFollowUpTodos, buildProjectLogTodos } from "./builders-basic";
import { buildBillingPaymentTodos } from "./builders-billing";
import { buildExpenseRequestTodos } from "./builders-expense";
import { buildCustomerServiceTicketTodos } from "./builders-ticket";
import { buildWorkflowTaskTodos } from "./builders-workflow";
import {
  TASK_CENTER_SUMMARY_CACHE_TTL_MS,
  buildSummaryCacheKey,
  sortTodos,
  type AuthContext,
  type TaskCenterCacheContext,
  type TaskCenterTodoListQuery,
} from "./shared";

async function buildTodos(authContext: AuthContext) {
  const [
    customerFollowUps,
    projectLogs,
    expenseRequests,
    projectAcceptances,
    customerServiceTickets,
    workflowTasks,
    billingPayments,
  ] = await Promise.all([
    buildCustomerFollowUpTodos(authContext),
    buildProjectLogTodos(authContext),
    buildExpenseRequestTodos(authContext),
    buildProjectAcceptanceTodos(authContext),
    buildCustomerServiceTicketTodos(authContext),
    buildWorkflowTaskTodos(authContext),
    buildBillingPaymentTodos(authContext),
  ]);

  return sortTodos([
    ...customerFollowUps,
    ...projectLogs,
    ...expenseRequests,
    ...projectAcceptances,
    ...customerServiceTickets,
    ...workflowTasks,
    ...billingPayments,
  ]);
}

export async function listTodos(authContext: AuthContext, query: TaskCenterTodoListQuery) {
  let list = await buildTodos(authContext);

  if (query.type) {
    list = list.filter((item) => item.type === query.type);
  }

  if (query.status) {
    list = list.filter((item) => item.status === query.status);
  }

  const total = list.length;
  const highPriorityTotal = list.filter((item) => item.priority === "high").length;
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize;

  return {
    list: list.slice(from, to),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    },
    summary: {
      total,
      high_priority: highPriorityTotal,
    },
  };
}

async function loadSummary(authContext: AuthContext) {
  const list = await buildTodos(authContext);
  return {
    total: list.length,
    high_priority: list.filter((item) => item.priority === "high").length,
    scope: {
      type: "current_employee" as const,
      tenant_id: authContext.tenantId,
      employee_id: authContext.employeeId,
    },
  };
}

function getCachedSummary(context: TaskCenterCacheContext, cacheKey: string) {
  const cached = context.summaryCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    context.summaryCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

export async function getSummary(
  this: TaskCenterCacheContext,
  authContext: AuthContext,
) {
  const cacheKey = buildSummaryCacheKey(authContext);
  const cached = getCachedSummary(this, cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = this.summaryInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = loadSummary(authContext)
    .then((result) => {
      this.summaryCache.set(cacheKey, {
        expiresAt: Date.now() + TASK_CENTER_SUMMARY_CACHE_TTL_MS,
        value: result,
      });
      return result;
    })
    .finally(() => {
      if (this.summaryInFlight.get(cacheKey) === request) {
        this.summaryInFlight.delete(cacheKey);
      }
    });
  this.summaryInFlight.set(cacheKey, request);
  return request;
}
