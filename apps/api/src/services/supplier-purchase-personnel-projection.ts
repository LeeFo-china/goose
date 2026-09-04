type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type SupplierPurchaseEmployeeSnapshot = {
  employee_id: string;
  name: string;
  phone_masked: string | null;
  role_name: string | null;
};

export type SupplierPurchaseApprovalSummary = {
  status: "not_submitted" | "pending" | "approved" | "rejected" | "cancelled";
  current_approvers: SupplierPurchaseEmployeeSnapshot[];
  last_reviewer: SupplierPurchaseEmployeeSnapshot | null;
  reviewed_at: string | null;
  rejected_at: string | null;
  review_remark: string | null;
};

type SnapshotCarrier = Record<string, unknown> & {
  creator_snapshot?: unknown;
  applicant_snapshot?: unknown;
  last_reviewer_snapshot?: unknown;
  purchase_batch?: unknown;
};

export function attachSupplierPurchaseBatchPagePersonnel<
  T extends SnapshotCarrier,
>(
  page: Page<T>,
  currentApproversByBatchId: Map<string, SupplierPurchaseEmployeeSnapshot[]> =
    new Map(),
) {
  return {
    ...page,
    list: page.list.map((batch) =>
      attachSupplierPurchaseBatchPersonnel(
        batch,
        currentApproversByBatchId.get(stringValue(batch.id)) ?? [],
      )
    ),
  };
}

export function attachSupplierPurchaseBatchPersonnel<T extends SnapshotCarrier>(
  batch: T,
  currentApprovers: SupplierPurchaseEmployeeSnapshot[] = [],
) {
  const {
    creator_snapshot: creatorSnapshot,
    applicant_snapshot: applicantSnapshot,
    last_reviewer_snapshot: lastReviewerSnapshot,
    ...publicBatch
  } = batch;
  return {
    ...publicBatch,
    creator: normalizeSnapshot(creatorSnapshot),
    applicant: normalizeSnapshot(applicantSnapshot),
    approval_summary: buildApprovalSummary(
      batch,
      lastReviewerSnapshot,
      currentApprovers,
    ),
  };
}

export function attachSupplierPurchaseOrderPagePersonnel<
  T extends SnapshotCarrier,
>(
  page: Page<T>,
  currentApproversByBatchId: Map<string, SupplierPurchaseEmployeeSnapshot[]> =
    new Map(),
) {
  return {
    ...page,
    list: page.list.map((order) =>
      attachSupplierPurchaseOrderPersonnel(
        order,
        currentApproversByBatchId.get(sourceBatchId(order)) ?? [],
      )
    ),
  };
}

export function attachSupplierPurchaseOrderPersonnel<T extends SnapshotCarrier>(
  order: T,
  currentApprovers: SupplierPurchaseEmployeeSnapshot[] = [],
) {
  const {
    creator_snapshot: creatorSnapshot,
    applicant_snapshot: ownApplicantSnapshot,
    last_reviewer_snapshot: _ownReviewerSnapshot,
    purchase_batch: purchaseBatch,
    ...publicOrder
  } = order;
  const batch = asRecord(purchaseBatch);
  const approvalSource = batch ?? order;
  const applicantSource = batch?.applicant_snapshot ?? ownApplicantSnapshot;
  const lastReviewerSource = batch?.last_reviewer_snapshot ??
    order.last_reviewer_snapshot;
  return {
    ...publicOrder,
    submitted_at: stringOrNull(approvalSource.submitted_at),
    creator: normalizeSnapshot(creatorSnapshot),
    applicant: normalizeSnapshot(applicantSource),
    approval_summary: buildApprovalSummary(
      approvalSource,
      lastReviewerSource,
      currentApprovers,
    ),
  };
}

export function groupWorkflowTaskApproversBySubjectId(
  tasks: Array<Record<string, unknown>>,
): Map<string, SupplierPurchaseEmployeeSnapshot[]> {
  const approversBySubjectId = new Map<
    string,
    SupplierPurchaseEmployeeSnapshot[]
  >();
  const seenBySubjectId = new Map<string, Set<string>>();
  for (const task of tasks) {
    const instance = asRecord(task.instance);
    const subjectId = stringValue(instance?.subject_id);
    if (!subjectId || instance?.subject_type !== "supplier_purchase_batch") {
      continue;
    }
    const employee = asRecord(task.assignee_employee);
    const employeeId = stringValue(task.assignee_employee_id) ||
      stringValue(employee?.id);
    const name = stringValue(employee?.name);
    if (!employeeId || !name) continue;
    const seen = seenBySubjectId.get(subjectId) ?? new Set<string>();
    if (seen.has(employeeId)) continue;
    seen.add(employeeId);
    seenBySubjectId.set(subjectId, seen);
    approversBySubjectId.set(subjectId, [
      ...(approversBySubjectId.get(subjectId) ?? []),
      {
        employee_id: employeeId,
        name,
        phone_masked: null,
        role_name: null,
      },
    ]);
  }
  return approversBySubjectId;
}

export async function loadSupplierPurchaseBatchCurrentApprovers(input: {
  tenantId: string;
  batchIds: string[];
  workflowTasks: {
    listPendingBySubjectIds(params: {
      tenantId: string;
      subjectType: "supplier_purchase_batch";
      subjectIds: string[];
      limit: number;
    }): Promise<Array<Record<string, unknown>>>;
  };
}) {
  if (input.batchIds.length === 0) return new Map();
  const tasks = await input.workflowTasks.listPendingBySubjectIds({
    tenantId: input.tenantId,
    subjectType: "supplier_purchase_batch",
    subjectIds: input.batchIds,
    limit: Math.min(input.batchIds.length * 3, 300),
  });
  return groupWorkflowTaskApproversBySubjectId(tasks);
}

function buildApprovalSummary(
  source: Record<string, unknown>,
  lastReviewerSnapshot: unknown,
  currentApprovers: SupplierPurchaseEmployeeSnapshot[],
): SupplierPurchaseApprovalSummary {
  const status = approvalStatus(source.status);
  const reviewedAt = stringOrNull(source.reviewed_at);
  return {
    status,
    current_approvers: status === "pending" ? currentApprovers : [],
    last_reviewer: normalizeSnapshot(lastReviewerSnapshot),
    reviewed_at: reviewedAt,
    rejected_at: status === "rejected" ? reviewedAt : null,
    review_remark: stringOrNull(source.review_remark),
  };
}

function approvalStatus(value: unknown): SupplierPurchaseApprovalSummary["status"] {
  switch (value) {
    case "draft":
      return "not_submitted";
    case "pending_approval":
      return "pending";
    case "ordered":
    case "submitted":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    default:
      return "not_submitted";
  }
}

function normalizeSnapshot(value: unknown): SupplierPurchaseEmployeeSnapshot | null {
  const record = asRecord(value);
  const employeeId = stringValue(record?.employee_id);
  const name = stringValue(record?.name);
  if (!employeeId || !name) return null;
  return {
    employee_id: employeeId,
    name,
    phone_masked: stringOrNull(record?.phone_masked),
    role_name: stringOrNull(record?.role_name),
  };
}

function sourceBatchId(order: Record<string, unknown>): string {
  const batch = asRecord(order.purchase_batch);
  return stringValue(batch?.id) || stringValue(order.purchase_batch_id);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
