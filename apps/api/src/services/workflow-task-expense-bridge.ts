import { Errors } from "@/errors/error-factory";
import {
  ApproveExpenseRequestSchema,
  PayExpenseRequestSchema,
  RejectExpenseRequestSchema,
} from "@/schema/expense-requests";
import type { AuthContext } from "@/services/authorization";
import { expenseRequestService } from "@/services/expense-requests";
import { workflowSubjectsService } from "@/services/workflow-subjects";

type ExpenseWorkflowTaskOperation =
  | {
    kind: "approve";
    input: {
      approver_id?: string;
      comment?: string | null;
    };
  }
  | {
    kind: "reject";
    input: {
      approver_id?: string;
      rejected_reason: string;
      reason: string;
      comment?: string | null;
    };
  }
  | {
    kind: "pay";
    input: Record<string, unknown>;
  };

type ResolveExpenseWorkflowTaskOperationInput = {
  nodeKey: string;
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
  employeeId: string | null;
};

type ExpenseWorkflowTaskBridgeInput = {
  authContext: AuthContext;
  task: {
    node_key: string;
    instance: {
      subject_id: string;
    };
  };
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRejectAction(input: ResolveExpenseWorkflowTaskOperationInput) {
  return input.action === "reject" || input.output.decision === "rejected";
}

export function resolveExpenseWorkflowTaskOperation(
  input: ResolveExpenseWorkflowTaskOperationInput,
): ExpenseWorkflowTaskOperation | null {
  if (input.nodeKey === "manager_review" || input.nodeKey === "finance_review") {
    if (isRejectAction(input)) {
      const reason = input.reason || optionalString(input.output.reason) ||
        optionalString(input.output.rejected_reason) || "";
      return {
        kind: "reject",
        input: {
          approver_id: input.employeeId || undefined,
          rejected_reason: reason,
          reason,
          comment: optionalString(input.output.comment) ?? null,
        },
      };
    }

    return {
      kind: "approve",
      input: {
        approver_id: input.employeeId || undefined,
        comment: optionalString(input.output.comment) ?? null,
      },
    };
  }

  if (input.nodeKey === "payment") {
    return {
      kind: "pay",
      input: {
        ...input.output,
        paid_by: optionalString(input.output.paid_by) || input.employeeId || undefined,
      },
    };
  }

  return null;
}

class WorkflowTaskExpenseBridge {
  async complete(input: ExpenseWorkflowTaskBridgeInput) {
    const operation = resolveExpenseWorkflowTaskOperation({
      nodeKey: input.task.node_key,
      action: input.action.trim(),
      reason: input.reason,
      output: input.output,
      employeeId: input.authContext.employeeId,
    });
    if (!operation) return null;

    const expenseRequestId = input.task.instance.subject_id;
    const expenseRequest = await this.executeOperation(
      input.authContext,
      expenseRequestId,
      operation,
    );
    const workflowState = await workflowSubjectsService.getState(input.authContext, {
      subjectType: "expense_request",
      subjectId: expenseRequestId,
    });

    return {
      result: {
        ok: true,
        bridged: true,
        operation: operation.kind,
      },
      expense_request: expenseRequest,
      ...workflowState,
    };
  }

  private async executeOperation(
    authContext: AuthContext,
    expenseRequestId: string,
    operation: ExpenseWorkflowTaskOperation,
  ) {
    if (operation.kind === "approve") {
      const parsed = ApproveExpenseRequestSchema.safeParse(operation.input);
      if (!parsed.success) throw Errors.fromZod(parsed.error);
      return expenseRequestService.approveExpenseRequest(
        authContext,
        expenseRequestId,
        parsed.data,
      );
    }

    if (operation.kind === "reject") {
      const parsed = RejectExpenseRequestSchema.safeParse(operation.input);
      if (!parsed.success) throw Errors.fromZod(parsed.error);
      return expenseRequestService.rejectExpenseRequest(
        authContext,
        expenseRequestId,
        parsed.data,
      );
    }

    const parsed = PayExpenseRequestSchema.safeParse(operation.input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return expenseRequestService.payExpenseRequest(
      authContext,
      expenseRequestId,
      parsed.data,
    );
  }
}

export const workflowTaskExpenseBridge = new WorkflowTaskExpenseBridge();
