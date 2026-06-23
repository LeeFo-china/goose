import { Errors } from "@/errors/error-factory";
import {
  projectReceivableAllocationRepository,
  type ProjectReceivableAllocationInput,
} from "@/repositories/project-receivable-allocations";
import {
  projectReceivablePlanRepository,
  type ProjectReceivablePlanRecord,
  type ProjectReceivableSummary,
} from "@/repositories/project-receivable-plans";
import {
  buildReceivableDueDate,
  buildWorkflowReceivableContext,
  deriveStoredReceivableStatus,
  getPaymentCollectionReceivableConfig,
  type WorkflowReceivableConfig,
} from "@/services/project-receivables-workflow";
import type {
  WorkflowReceivableActionContext,
} from "@/services/workflow-task-action-metadata";
import type {
  FinanceReceivableListQuery,
  ProjectReceivableListQuery,
} from "@/schema/finance-receivables";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type ProjectReceivablesServiceDependencies = {
  planRepository: {
    list: typeof projectReceivablePlanRepository.list;
    summarizeProject: typeof projectReceivablePlanRepository.summarizeProject;
    findProjectTenant: typeof projectReceivablePlanRepository.findProjectTenant;
    findProjectSignedAmount: typeof projectReceivablePlanRepository.findProjectSignedAmount;
    findByWorkflowNodeSource: typeof projectReceivablePlanRepository.findByWorkflowNodeSource;
    createWorkflowNodePlan: typeof projectReceivablePlanRepository.createWorkflowNodePlan;
    updatePaidAmount: typeof projectReceivablePlanRepository.updatePaidAmount;
  };
  allocationRepository: {
    createIdempotent: (
      input: ProjectReceivableAllocationInput,
    ) => Promise<unknown>;
    sumAllocatedAmount: typeof projectReceivableAllocationRepository.sumAllocatedAmount;
  };
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission" | "canAccessProject"
  >;
};

export class ProjectReceivablesService {
  constructor(
    private readonly dependencies: ProjectReceivablesServiceDependencies = {
      planRepository: projectReceivablePlanRepository,
      allocationRepository: projectReceivableAllocationRepository,
      accessPolicyService,
    },
  ) {}

  async listReceivables(
    authContext: AuthContext,
    query: FinanceReceivableListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertFinanceReceivableView(authContext);

    return this.dependencies.planRepository.list({
      tenantId,
      query,
      tenantToday: getTenantToday(),
    });
  }

  async listProjectReceivables(
    authContext: AuthContext,
    projectId: string,
    query: ProjectReceivableListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    await this.assertCanReadProjectReceivables({
      authContext,
      tenantId,
      projectId,
    });

    const tenantToday = getTenantToday();
    const [receivables, summary] = await Promise.all([
      this.dependencies.planRepository.list({
        tenantId,
        query: {
          ...query,
          project_id: projectId,
        },
        tenantToday,
      }),
      this.dependencies.planRepository.summarizeProject({
        tenantId,
        projectId,
        tenantToday,
      }),
    ]);

    return {
      ...receivables,
      summary,
    };
  }

  async getProjectReceivableSummary(
    authContext: AuthContext,
    projectId: string,
  ): Promise<ProjectReceivableSummary> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    await this.assertCanReadProjectReceivables({
      authContext,
      tenantId,
      projectId,
    });

    return this.dependencies.planRepository.summarizeProject({
      tenantId,
      projectId,
      tenantToday: getTenantToday(),
    });
  }

  async prepareWorkflowPaymentReceivable(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    workflowNodeKey: string;
    taskCreatedAt: string | null;
    nodeSnapshot: unknown;
    paymentAmount: number;
  }): Promise<{ plan_id: string; remaining_amount: number } | null> {
    const config = getPaymentCollectionReceivableConfig(input.nodeSnapshot);
    if (!config.enabled) return null;
    if (!input.workflowInstanceNodeId) {
      throw Errors.business(
        409,
        "当前收款节点缺少运行节点记录，不能生成应收计划",
        "RECEIVABLE_PLAN_SOURCE_MISSING",
      );
    }

    const workflowInstanceNodeId = input.workflowInstanceNodeId;
    const plan = await this.ensureWorkflowReceivablePlan({
      ...input,
      workflowInstanceNodeId,
      config,
    });
    const remainingAmount = Math.max(plan.amount - plan.paid_amount, 0);
    if (input.paymentAmount < remainingAmount) {
      throw Errors.business(
        409,
        "本次收款金额未达到当前应收计划金额，不能推进收款节点",
        "RECEIVABLE_PAYMENT_INSUFFICIENT",
        {
          receivable_plan_id: plan.id,
          receivable_amount: plan.amount,
          receivable_paid_amount: plan.paid_amount,
          receivable_remaining_amount: remainingAmount,
          payment_amount: input.paymentAmount,
        },
      );
    }

    return {
      plan_id: plan.id,
      remaining_amount: remainingAmount,
    };
  }

  async ensureWorkflowPaymentReceivableContext(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    workflowNodeKey: string;
    taskCreatedAt: string | null;
    nodeSnapshot: unknown;
  }): Promise<WorkflowReceivableActionContext | null> {
    const config = getPaymentCollectionReceivableConfig(input.nodeSnapshot);
    if (!config.enabled) return null;
    if (!input.workflowInstanceNodeId) {
      throw Errors.business(
        409,
        "当前收款节点缺少运行节点记录，不能生成应收计划",
        "RECEIVABLE_PLAN_SOURCE_MISSING",
      );
    }

    const plan = await this.ensureWorkflowReceivablePlan({
      ...input,
      workflowInstanceNodeId: input.workflowInstanceNodeId,
      config,
    });

    return buildWorkflowReceivableContext(plan, getTenantToday());
  }

  async allocateWorkflowPayment(input: {
    tenantId: string;
    projectId: string;
    planId: string;
    paymentId: string;
    paymentAmount: number;
    workflowTaskId: string;
    allocatedBy: string | null;
  }) {
    const allocationAmount = Math.max(input.paymentAmount, 0);
    if (allocationAmount <= 0) {
      throw Errors.badRequest("核销金额必须大于 0");
    }

    await this.dependencies.allocationRepository.createIdempotent({
      tenant_id: input.tenantId,
      project_id: input.projectId,
      receivable_plan_id: input.planId,
      payment_id: input.paymentId,
      amount: allocationAmount,
      allocated_by: input.allocatedBy,
      source_type: "workflow_task",
      source_id: input.workflowTaskId,
      metadata: {
        workflow_task_id: input.workflowTaskId,
      },
    });
    const paidAmount = await this.dependencies.allocationRepository
      .sumAllocatedAmount({
        tenantId: input.tenantId,
        receivablePlanId: input.planId,
      });

    return this.dependencies.planRepository.updatePaidAmount({
      tenantId: input.tenantId,
      planId: input.planId,
      paidAmount,
      status: deriveStoredReceivableStatus(paidAmount),
    });
  }

  private assertFinanceReceivableView(authContext: AuthContext) {
    if (!this.hasFinanceReceivableView(authContext)) {
      throw Errors.forbidden();
    }
  }

  private async assertCanReadProjectReceivables(input: {
    authContext: AuthContext;
    tenantId: string;
    projectId: string;
  }) {
    if (this.hasFinanceReceivableView(input.authContext)) {
      const project = await this.dependencies.planRepository.findProjectTenant(
        input.projectId,
      );
      if (!project || project.tenant_id !== input.tenantId) {
        throw Errors.forbidden();
      }
      return;
    }

    const canAccessProject = await this.dependencies.accessPolicyService
      .canAccessProject(input.authContext, input.projectId, "project.read");
    if (!canAccessProject) {
      throw Errors.forbidden();
    }
  }

  private hasFinanceReceivableView(authContext: AuthContext) {
    return this.dependencies.accessPolicyService.hasPermission(
      authContext,
      "finance.receivable.view",
    ) ||
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.receivable.manage",
      ) ||
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.view",
      );
  }

  private async ensureWorkflowReceivablePlan(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string;
    workflowNodeKey: string;
    taskCreatedAt: string | null;
    nodeSnapshot: unknown;
    config: WorkflowReceivableConfig;
  }): Promise<ProjectReceivablePlanRecord> {
    const existing = await this.dependencies.planRepository
      .findByWorkflowNodeSource({
        tenantId: input.tenantId,
        sourceId: input.workflowInstanceNodeId,
        paymentType: input.config.paymentType,
      });
    if (existing) return existing;

    const amount = await this.resolveReceivableAmount({
      projectId: input.projectId,
      config: input.config,
    });

    return this.dependencies.planRepository.createWorkflowNodePlan({
      tenant_id: input.tenantId,
      project_id: input.projectId,
      workflow_instance_id: input.workflowInstanceId,
      workflow_node_key: input.workflowNodeKey,
      source_id: input.workflowInstanceNodeId,
      payment_type: input.config.paymentType,
      title: input.config.title,
      amount,
      due_date: buildReceivableDueDate({
        taskCreatedAt: input.taskCreatedAt,
        offsetDays: input.config.dueOffsetDays,
      }),
      metadata: {
        workflow_node_key: input.workflowNodeKey,
        amount_mode: input.config.amountMode,
        fixed_amount: input.config.fixedAmount,
        percentage: input.config.percentage,
      },
    });
  }

  private async resolveReceivableAmount(input: {
    projectId: string;
    config: WorkflowReceivableConfig;
  }) {
    if (input.config.amountMode === "fixed_amount") {
      if (!input.config.fixedAmount || input.config.fixedAmount <= 0) {
        throw Errors.badRequest("应收固定金额必须大于 0");
      }
      return input.config.fixedAmount;
    }

    if (!input.config.percentage || input.config.percentage <= 0) {
      throw Errors.badRequest("应收签约金额比例必须大于 0");
    }

    const signedAmount = await this.dependencies.planRepository
      .findProjectSignedAmount(input.projectId);
    if (!signedAmount) {
      throw Errors.business(
        409,
        "项目缺少签约金额，不能生成按比例应收计划",
        "PROJECT_SIGNED_AMOUNT_REQUIRED",
      );
    }

    return roundMoney(signedAmount * input.config.percentage / 100);
  }
}

function getTenantToday() {
  return new Date().toISOString().slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export const projectReceivablesService = new ProjectReceivablesService();
