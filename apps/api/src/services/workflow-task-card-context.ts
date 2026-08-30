import {
  workflowTaskCardContextRepository,
  type WorkflowTaskCustomerSummary,
  type WorkflowTaskExpenseRequestSummary,
  type WorkflowTaskEmployeeSummary,
  type WorkflowTaskProjectAcceptanceSummary,
  type WorkflowTaskProjectSummary,
  type WorkflowTaskReceivableSummary,
  type WorkflowTaskSupplierPurchaseBatchSummary,
} from "@/repositories/workflow-task-card-context";
import {
  actionLabel,
  baseBusiness,
  buildAssigneePayload,
  buildProjectPayload,
  buildProjectPeopleText,
  buildReceivableAmountText,
  formatDateText,
  formatMoney,
  isProjectAcceptanceTask,
  isProjectPaymentTask,
  joinText,
  normalizeReceivableSummary,
  projectNameOrFallback,
  readString,
  resolveReceivableContext,
  selectAcceptanceForTask,
  taskReceivableKey,
  taskTitle,
} from "@/services/workflow-task-card-context-helpers";
import type {
  WorkflowTaskCardContext,
  WorkflowTaskCardContextItem,
} from "@/services/workflow-task-card-context-types";
import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
} from "@gooes/domain";

type CardContextSources = {
  projectsById: Map<string, WorkflowTaskProjectSummary>;
  customersById: Map<string, WorkflowTaskCustomerSummary>;
  expenseRequestsById: Map<string, WorkflowTaskExpenseRequestSummary>;
  receivablesByTaskKey: Map<string, WorkflowTaskReceivableSummary>;
  acceptancesByProjectId: Map<string, WorkflowTaskProjectAcceptanceSummary[]>;
  supplierPurchaseBatchesById: Map<
    string,
    WorkflowTaskSupplierPurchaseBatchSummary
  >;
  employeesById: Map<string, WorkflowTaskEmployeeSummary>;
};

type WorkflowTaskCardContextRepositoryPort =
  typeof workflowTaskCardContextRepository;

export class WorkflowTaskCardContextService {
  constructor(
    private readonly repository: WorkflowTaskCardContextRepositoryPort =
      workflowTaskCardContextRepository,
  ) {}

  async buildTaskCardContextMap(input: {
    tenantId: string;
    items: WorkflowTaskCardContextItem[];
  }): Promise<Map<string, WorkflowTaskCardContext>> {
    const sources = await this.loadSources(input.tenantId, input.items);
    const result = new Map<string, WorkflowTaskCardContext>();

    for (const item of input.items) {
      const context = this.buildContext(item, sources);
      if (context) result.set(item.task.id, context);
    }

    return result;
  }

  private async loadSources(
    tenantId: string,
    items: WorkflowTaskCardContextItem[],
  ): Promise<CardContextSources> {
    const projectIds = new Set<string>();
    const customerIds = new Set<string>();
    const expenseRequestIds = new Set<string>();
    const acceptanceProjectIds = new Set<string>();
    const supplierPurchaseBatchIds = new Set<string>();
    const receivableKeys: Array<{
      projectId: string;
      workflowInstanceId: string;
      workflowNodeKey: string;
    }> = [];

    for (const item of items) {
      const subjectType = readString(item.task.instance?.subject_type);
      const subjectId = readString(item.task.instance?.subject_id);
      if (!subjectType || !subjectId) continue;

      if (subjectType === "project") {
        projectIds.add(subjectId);
        if (isProjectAcceptanceTask(item)) acceptanceProjectIds.add(subjectId);
        if (isProjectPaymentTask(item)) {
          receivableKeys.push({
            projectId: subjectId,
            workflowInstanceId: item.task.instance_id,
            workflowNodeKey: item.task.node_key,
          });
        }
      }
      if (subjectType === "customer") customerIds.add(subjectId);
      if (subjectType === "expense_request") expenseRequestIds.add(subjectId);
      if (subjectType === "supplier_purchase_batch") {
        supplierPurchaseBatchIds.add(subjectId);
      }
    }

    const supplierPurchaseBatches =
      await this.repository.listSupplierPurchaseBatchSummariesByIds({
        tenantId,
        batchIds: [...supplierPurchaseBatchIds],
      });
    const employeeIds = new Set<string>();
    for (const batch of supplierPurchaseBatches) {
      projectIds.add(batch.project_id);
      if (batch.submitted_by_employee_id) {
        employeeIds.add(batch.submitted_by_employee_id);
      }
    }

    const [
      projects,
      customers,
      expenseRequests,
      receivables,
      acceptances,
      employees,
    ] = await Promise.all([
      this.repository.listProjectSummariesByIds({
        tenantId,
        projectIds: [...projectIds],
      }),
      this.repository.listCustomerSummariesByIds({
        tenantId,
        customerIds: [...customerIds],
      }),
      this.repository.listExpenseRequestSummariesByIds({
        tenantId,
        expenseRequestIds: [...expenseRequestIds],
      }),
      this.repository.listProjectReceivableSummaries({
        tenantId,
        keys: receivableKeys,
      }),
      this.repository.listProjectAcceptanceSummariesByProjectIds({
        tenantId,
        projectIds: [...acceptanceProjectIds],
      }),
      this.repository.listEmployeeSummariesByIds({
        tenantId,
        employeeIds: [...employeeIds],
      }),
    ]);

    const acceptancesByProjectId = new Map<
      string,
      WorkflowTaskProjectAcceptanceSummary[]
    >();
    for (const acceptance of acceptances) {
      acceptancesByProjectId.set(acceptance.project_id, [
        ...(acceptancesByProjectId.get(acceptance.project_id) ?? []),
        acceptance,
      ]);
    }

    return {
      projectsById: new Map(projects.map((project) => [project.id, project])),
      customersById: new Map(customers.map((customer) => [customer.id, customer])),
      expenseRequestsById: new Map(expenseRequests.map((expense) => [
        expense.id,
        expense,
      ])),
      receivablesByTaskKey: new Map(receivables.map((receivable) => [
        taskReceivableKey({
          instanceId: receivable.workflow_instance_id,
          nodeKey: receivable.workflow_node_key,
        }),
        receivable,
      ])),
      acceptancesByProjectId,
      supplierPurchaseBatchesById: new Map(
        supplierPurchaseBatches.map((batch) => [batch.id, batch]),
      ),
      employeesById: new Map(employees.map((employee) => [
        employee.id,
        employee,
      ])),
    };
  }

  private buildContext(
    item: WorkflowTaskCardContextItem,
    sources: CardContextSources,
  ): WorkflowTaskCardContext | null {
    const subjectType = readString(item.task.instance?.subject_type);
    const subjectId = readString(item.task.instance?.subject_id);
    if (!subjectType || !subjectId) return null;

    if (subjectType === "expense_request") {
      return this.buildExpenseRequestContext(
        item,
        sources.expenseRequestsById.get(subjectId) ?? null,
      );
    }

    if (subjectType === "customer") {
      return this.buildCustomerContext(
        item,
        sources.customersById.get(subjectId) ?? null,
      );
    }

    if (subjectType === "supplier_purchase_batch") {
      const batch = sources.supplierPurchaseBatchesById.get(subjectId) ?? null;
      return this.buildSupplierPurchaseBatchContext(
        item,
        batch,
        batch ? sources.projectsById.get(batch.project_id) ?? null : null,
        batch?.submitted_by_employee_id
          ? sources.employeesById.get(batch.submitted_by_employee_id) ?? null
          : null,
      );
    }

    if (subjectType !== "project") return null;

    const project = sources.projectsById.get(subjectId) ?? null;
    if (isProjectPaymentTask(item)) {
      return this.buildProjectPaymentContext(
        item,
        project,
        sources.receivablesByTaskKey.get(taskReceivableKey({
          instanceId: item.task.instance_id,
          nodeKey: item.task.node_key,
        })) ?? null,
      );
    }

    if (isProjectAcceptanceTask(item)) {
      return this.buildProjectAcceptanceContext(
        item,
        project,
        sources.acceptancesByProjectId.get(subjectId) ?? [],
      );
    }

    return this.buildProjectWorkflowContext(item, project);
  }

  private buildProjectPaymentContext(
    item: WorkflowTaskCardContextItem,
    project: WorkflowTaskProjectSummary | null,
    fallbackReceivable: WorkflowTaskReceivableSummary | null,
  ): WorkflowTaskCardContext {
    const receivable = resolveReceivableContext(item) ??
      normalizeReceivableSummary(fallbackReceivable);
    const title = receivable?.receivable_title || actionLabel(item) ||
      taskTitle(item.task, "项目收款");
    const projectName = projectNameOrFallback(project);

    return {
      todo_type: "project_payment",
      title,
      subtitle: joinText([projectName, title], " · "),
      primary_meta: project?.property_label || project?.address || null,
      secondary_meta: item.assignee.current_handler_label ?? null,
      amount_text: buildReceivableAmountText(receivable),
      people_text: buildProjectPeopleText(project),
      time_text: receivable?.receivable_due_date
        ? `应收 ${receivable.receivable_due_date}`
        : formatDateText(item.task.due_at || item.task.created_at),
      project: buildProjectPayload(project),
      assignee: buildAssigneePayload(item.assignee),
      business: {
        ...baseBusiness(item),
        ...(receivable ? receivable : {}),
      },
    };
  }

  private buildProjectWorkflowContext(
    item: WorkflowTaskCardContextItem,
    project: WorkflowTaskProjectSummary | null,
  ): WorkflowTaskCardContext {
    const title = taskTitle(item.task, "项目流程待处理");

    return {
      todo_type: "project_workflow",
      title,
      subtitle: projectNameOrFallback(project),
      primary_meta: project?.property_label || project?.address || null,
      secondary_meta: item.assignee.current_handler_label ?? null,
      people_text: buildProjectPeopleText(project),
      time_text: formatDateText(item.task.due_at || item.task.created_at),
      project: buildProjectPayload(project),
      assignee: buildAssigneePayload(item.assignee),
      business: baseBusiness(item),
    };
  }

  private buildCustomerContext(
    item: WorkflowTaskCardContextItem,
    customer: WorkflowTaskCustomerSummary | null,
  ): WorkflowTaskCardContext {
    const customerTitle = customer?.name?.trim() || customer?.phone?.trim() ||
      taskTitle(item.task, "客户待处理");

    return {
      todo_type: "customer_followup",
      title: customerTitle,
      subtitle: joinText([
        customer?.status ? `客户状态 ${customer.status}` : null,
        item.assignee.current_handler_label ?? null,
      ], " · "),
      primary_meta: customer?.phone ?? null,
      secondary_meta: customer?.owner?.name
        ? `负责人 ${customer.owner.name}`
        : item.assignee.current_handler_label ?? null,
      people_text: customer?.owner?.name ? `负责人 ${customer.owner.name}` : null,
      time_text: formatDateText(item.task.due_at || item.task.created_at),
      customer: customer
        ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          status_label: customer.status,
        }
        : null,
      assignee: buildAssigneePayload(item.assignee),
      business: baseBusiness(item),
    };
  }

  private buildExpenseRequestContext(
    item: WorkflowTaskCardContextItem,
    expense: WorkflowTaskExpenseRequestSummary | null,
  ): WorkflowTaskCardContext {
    const title = expense?.title?.trim() || taskTitle(item.task, "费用申请");
    const applicantName = expense?.employee?.name?.trim() || null;

    return {
      todo_type: "expense_request",
      title,
      subtitle: expense?.project?.name?.trim() || expense?.request_no ||
        "费用申请",
      primary_meta: expense?.request_no ? `申请单 ${expense.request_no}` : null,
      secondary_meta: item.assignee.current_handler_label ?? null,
      amount_text: formatMoney(expense?.total_amount),
      people_text: applicantName ? `申请人 ${applicantName}` : null,
      time_text: formatDateText(expense?.created_at || item.task.created_at),
      project: expense?.project
        ? {
          id: expense.project.id,
          name: expense.project.name || "项目",
        }
        : null,
      applicant: expense?.employee
        ? {
          id: expense.employee.id,
          name: expense.employee.name || "申请人",
        }
        : null,
      assignee: buildAssigneePayload(item.assignee),
      business: {
        ...baseBusiness(item),
        request_no: expense?.request_no ?? null,
        mode: expense?.mode ?? null,
      },
    };
  }

  private buildSupplierPurchaseBatchContext(
    item: WorkflowTaskCardContextItem,
    batch: WorkflowTaskSupplierPurchaseBatchSummary | null,
    project: WorkflowTaskProjectSummary | null,
    applicant: WorkflowTaskEmployeeSummary | null,
  ): WorkflowTaskCardContext {
    const batchId = batch?.id ?? readString(item.task.instance?.subject_id) ?? "";
    const batchNo = batch?.batch_no ?? null;
    const applicantName = applicant?.name?.trim() || null;
    const targetUrl = [
      "/packageProcurement/pages/batch-review/index",
      `?id=${encodeURIComponent(batchId)}`,
      `&workflowTaskId=${encodeURIComponent(item.task.id)}`,
    ].join("");

    return {
      todo_type: "supplier_purchase_batch",
      title: taskTitle(item.task, "采购批次审批"),
      subtitle: joinText([projectNameOrFallback(project), batchNo], " · "),
      primary_meta: batchNo ? `批次 ${batchNo}` : null,
      secondary_meta: item.assignee.current_handler_label ?? null,
      amount_text: formatMoney(batch?.total_amount),
      people_text: joinText([
        applicantName ? `申请人 ${applicantName}` : null,
        typeof batch?.item_count === "number"
          ? `商品 ${batch.item_count} 项`
          : null,
        typeof batch?.supplier_count === "number"
          ? `供应商 ${batch.supplier_count} 家`
          : null,
      ], " · "),
      time_text: batch?.submitted_at
        ? `提交 ${formatDateText(batch.submitted_at)}`
        : formatDateText(item.task.created_at),
      target_url: targetUrl,
      project: buildProjectPayload(project),
      applicant: batch?.submitted_by_employee_id
        ? {
          id: batch.submitted_by_employee_id,
          name: applicantName ?? "申请人",
        }
        : null,
      assignee: buildAssigneePayload(item.assignee),
      business: {
        ...baseBusiness(item),
        batch_id: batchId || null,
        batch_no: batchNo,
        total_amount: batch?.total_amount ?? null,
        item_count: batch?.item_count ?? null,
        supplier_count: batch?.supplier_count ?? null,
        submitted_at: batch?.submitted_at ?? null,
      },
    };
  }

  private buildProjectAcceptanceContext(
    item: WorkflowTaskCardContextItem,
    project: WorkflowTaskProjectSummary | null,
    acceptances: WorkflowTaskProjectAcceptanceSummary[],
  ): WorkflowTaskCardContext {
    const acceptance = selectAcceptanceForTask(item, acceptances);
    const stageLabel = acceptance
      ? PROJECT_ACCEPTANCE_STAGE_LABELS[
        acceptance.stage_code as keyof typeof PROJECT_ACCEPTANCE_STAGE_LABELS
      ] || acceptance.title
      : taskTitle(item.task, "项目验收");

    return {
      todo_type: "project_acceptance",
      title: taskTitle(item.task, "验收待处理"),
      subtitle: joinText([projectNameOrFallback(project), stageLabel], " · "),
      primary_meta: stageLabel,
      secondary_meta: item.assignee.current_handler_label ?? null,
      people_text: joinText([
        acceptance?.initiator?.name ? `发起人 ${acceptance.initiator.name}` : null,
        acceptance?.reviewer?.name ? `复核人 ${acceptance.reviewer.name}` : null,
      ], " · "),
      time_text: formatDateText(
        acceptance?.submitted_at || acceptance?.updated_at || item.task.created_at,
      ),
      project: buildProjectPayload(project),
      assignee: buildAssigneePayload(item.assignee),
      business: {
        ...baseBusiness(item),
        acceptance_id: acceptance?.id ?? null,
        acceptance_type: acceptance?.acceptance_type ?? null,
        stage_code: acceptance?.stage_code ?? null,
        status: acceptance?.status ?? null,
      },
    };
  }
}

export const workflowTaskCardContextService =
  new WorkflowTaskCardContextService();
