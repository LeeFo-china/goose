import { Errors } from "@/errors/error-factory";
import type {
  ApproveProjectAcceptanceInput,
  CancelProjectAcceptanceInput,
  CreateProjectAcceptanceInput,
  CustomerConfirmProjectAcceptanceInput,
  CustomerDisputeProjectAcceptanceInput,
  ProjectAcceptanceListQuery,
  ProjectAcceptanceTemplateListQuery,
  RejectProjectAcceptanceInput,
  SubmitProjectAcceptanceInput,
  UpdateProjectAcceptanceInput,
} from "@/schema/project-acceptances";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { projectAcceptanceRepository } from "@/repositories/project-acceptances";
import type {
  ProjectAcceptanceActionRow,
  ProjectAcceptanceCustomerRow,
  ProjectAcceptanceEmployeeRow,
  ProjectAcceptanceItemRow,
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
  ProjectAcceptanceTemplateRow,
} from "@/repositories/project-acceptances";
import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
  type ProjectAcceptanceAction,
  type ProjectAcceptanceStatus,
  type ProjectLogStageCode,
} from "@gooes/domain";
import { SupabaseDB } from "@/utils/supabase";

const PROJECT_LOGS_BUCKET = "project-logs";
const OPEN_ACCEPTANCE_STATUSES: ProjectAcceptanceStatus[] = [
  "draft",
  "submitted",
  "leader_approved",
  "rejected",
];

type AcceptanceDetail = ProjectAcceptanceRow & {
  stage_label: string | null;
  status_label: string;
  items: Array<ProjectAcceptanceItemRow & {
    images: string[];
    rectification_images: string[];
  }>;
  actions: ProjectAcceptanceActionRow[];
  project: ProjectAcceptanceProjectRow | null;
  initiator: ProjectAcceptanceEmployeeRow | null;
  reviewer: ProjectAcceptanceEmployeeRow | null;
  customer: ProjectAcceptanceCustomerRow | null;
};

class ProjectAcceptanceWorkflowService {
  assertTransition(input: {
    currentStatus: ProjectAcceptanceStatus;
    action: ProjectAcceptanceAction;
  }) {
    const allowed: Record<ProjectAcceptanceStatus, ProjectAcceptanceAction[]> = {
      draft: ["update", "submit", "cancel"],
      rejected: ["update", "submit", "cancel"],
      submitted: ["leader_approve", "leader_reject", "cancel"],
      leader_approved: ["customer_confirm", "customer_dispute", "cancel"],
      customer_confirmed: [],
      cancelled: [],
    };

    if (!allowed[input.currentStatus].includes(input.action)) {
      throw Errors.badRequest("当前验收状态不允许该操作");
    }
  }
}

const projectAcceptanceWorkflowService = new ProjectAcceptanceWorkflowService();

class ProjectAcceptanceService {
  private getStatusLabel(status: ProjectAcceptanceStatus) {
    const labels: Record<ProjectAcceptanceStatus, string> = {
      draft: "草稿",
      submitted: "待领导复核",
      leader_approved: "待业主确认",
      customer_confirmed: "已完成",
      rejected: "需整改",
      cancelled: "已作废",
    };
    return labels[status] || status;
  }

  private normalizeImageArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => this.getImagePublicUrl(item));
  }

  private getImagePublicUrl(path: string) {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return SupabaseDB.getAdminClient()
      .storage
      .from(PROJECT_LOGS_BUCKET)
      .getPublicUrl(path)
      .data.publicUrl;
  }

  private getStageLabel(stageCode: string | null | undefined) {
    if (!isProjectLogStageCode(stageCode)) {
      return null;
    }

    return PROJECT_ACCEPTANCE_STAGE_LABELS[stageCode] ||
      PROJECT_LOG_STAGE_CONFIG[stageCode].label;
  }

  private async buildDetail(row: ProjectAcceptanceRow): Promise<AcceptanceDetail> {
    const [items, actions, project, employees, customers] = await Promise.all([
      projectAcceptanceRepository.listItems(row.id),
      projectAcceptanceRepository.listActions(row.id),
      projectAcceptanceRepository.getProject(row.project_id),
      projectAcceptanceRepository.listEmployees(
        Array.from(new Set([
          row.initiator_id,
          row.reviewer_id,
        ].filter((item): item is string => Boolean(item)))),
      ),
      projectAcceptanceRepository.listCustomers(
        row.customer_id ? [row.customer_id] : [],
      ),
    ]);

    const employeeMap = new Map(employees.map((item) => [item.id, item]));
    const customerMap = new Map(customers.map((item) => [item.id, item]));

    return {
      ...row,
      stage_label: this.getStageLabel(row.stage_code),
      status_label: this.getStatusLabel(row.status),
      items: items.map((item) => ({
        ...item,
        images: this.normalizeImageArray(item.images),
        rectification_images: this.normalizeImageArray(item.rectification_images),
      })),
      actions,
      project,
      initiator: employeeMap.get(row.initiator_id) || null,
      reviewer: row.reviewer_id ? employeeMap.get(row.reviewer_id) || null : null,
      customer: row.customer_id ? customerMap.get(row.customer_id) || null : null,
    };
  }

  private async getRequiredAcceptance(id: string) {
    const row = await projectAcceptanceRepository.getAcceptanceById(id);
    if (!row) {
      throw Errors.badRequest("项目验收单不存在");
    }
    return row;
  }

  private async assertCanRead(authContext: AuthContext, row: ProjectAcceptanceRow) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      row.project_id,
      "project_acceptance.read",
    );
    if (!hasAccess) throw Errors.forbidden();
  }

  private assertCurrentEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private async assertCanCreate(
    authContext: AuthContext,
    projectId: string,
  ) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      "project_acceptance.create",
    );
    if (!hasAccess) throw Errors.forbidden();
  }

  private assertCanUpdateOwn(authContext: AuthContext, row: ProjectAcceptanceRow) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const manageScope = accessPolicyService.getScope(
      authContext,
      "project_acceptance.manage",
    );
    if (manageScope === "all") {
      return;
    }

    accessPolicyService.assertPermission(authContext, "project_acceptance.update_own");
    if (row.initiator_id !== employeeId) {
      throw Errors.forbidden();
    }
  }

  private assertCanSubmit(authContext: AuthContext, row: ProjectAcceptanceRow) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "project_acceptance.submit",
    );
    if (scope === "all") {
      return;
    }

    if (row.initiator_id !== employeeId) {
      throw Errors.forbidden();
    }
  }

  private assertCanReview(authContext: AuthContext, row: ProjectAcceptanceRow) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "project_acceptance.review",
    );

    if (scope === "all") {
      return;
    }

    if (row.reviewer_id && row.reviewer_id === employeeId) {
      return;
    }

    throw Errors.forbidden();
  }

  private assertCanReject(authContext: AuthContext, row: ProjectAcceptanceRow) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "project_acceptance.reject",
    );

    if (scope === "all") {
      return;
    }

    if (row.reviewer_id && row.reviewer_id === employeeId) {
      return;
    }

    throw Errors.forbidden();
  }

  private assertCanManage(authContext: AuthContext) {
    accessPolicyService.assertPermission(authContext, "project_acceptance.manage");
  }

  private async resolveTemplate(input: CreateProjectAcceptanceInput) {
    const template = input.template_id
      ? await projectAcceptanceRepository.getTemplateById(input.template_id)
      : await projectAcceptanceRepository.getActiveTemplateByStage(input.stage_code);

    if (!template) {
      throw Errors.badRequest("验收模板不存在");
    }

    if (template.status !== "active") {
      throw Errors.badRequest("验收模板未启用");
    }

    if (template.stage_code !== input.stage_code) {
      throw Errors.badRequest("验收模板与工序不匹配");
    }

    const items = await projectAcceptanceRepository.listTemplateItems(template.id);
    if (items.length === 0) {
      throw Errors.badRequest("验收模板没有可用标准项");
    }

    return { template, items };
  }

  private async resolveReviewer(
    project: ProjectAcceptanceProjectRow,
    inputReviewerId?: string | null,
  ) {
    if (inputReviewerId) {
      return inputReviewerId;
    }

    return await projectAcceptanceRepository.findPrimaryConstructionManager(project.id);
  }

  private async recordAction(input: {
    row: ProjectAcceptanceRow;
    action: ProjectAcceptanceAction;
    fromStatus: ProjectAcceptanceStatus | null;
    toStatus: ProjectAcceptanceStatus;
    operatorType: "employee" | "customer" | "system";
    operatorId: string | null;
    comment?: string | null;
  }) {
    await projectAcceptanceRepository.createAction({
      acceptance_id: input.row.id,
      operator_type: input.operatorType,
      operator_id: input.operatorId,
      action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      comment: input.comment ?? null,
    });
  }

  async listTemplates(input: ProjectAcceptanceTemplateListQuery) {
    const templates = await projectAcceptanceRepository.listTemplates({
      stage_code: input.stage_code,
      status: input.status ?? "active",
    });

    return {
      list: await Promise.all(
        templates.map(async (template) => ({
          ...template,
          stage_label: this.getStageLabel(template.stage_code),
          items: await projectAcceptanceRepository.listTemplateItems(template.id),
        })),
      ),
    };
  }

  async getTemplate(id: string) {
    const template = await projectAcceptanceRepository.getTemplateById(id);
    if (!template) {
      throw Errors.badRequest("验收模板不存在");
    }
    return {
      ...template,
      stage_label: this.getStageLabel(template.stage_code),
      items: await projectAcceptanceRepository.listTemplateItems(template.id),
    };
  }

  async listAcceptances(
    authContext: AuthContext,
    query: ProjectAcceptanceListQuery,
  ) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project_acceptance.read",
    );
    const { list, total } = await projectAcceptanceRepository.listAcceptances({
      ...query,
      visibleProjectIds,
    });

    return {
      list: await Promise.all(list.map((item) => this.buildDetail(item))),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async getAcceptance(authContext: AuthContext, id: string) {
    const row = await this.getRequiredAcceptance(id);
    await this.assertCanRead(authContext, row);
    return this.buildDetail(row);
  }

  async listCustomerAcceptances(
    authUserId: string,
    query: {
      project_id: string;
      page: number;
      pageSize: number;
      status?: ProjectAcceptanceStatus;
      stage_code?: ProjectLogStageCode;
    },
  ) {
    const customer = await projectAcceptanceRepository.getCustomerByAuthUserId(
      authUserId,
    );
    if (!customer) throw Errors.forbidden();

    const project = await projectAcceptanceRepository.getProject(query.project_id);
    if (!project || project.customer_id !== customer.id) {
      throw Errors.notFound("项目不存在");
    }

    const { list, total } = await projectAcceptanceRepository.listAcceptances({
      ...query,
      customer_id: customer.id,
    });

    return {
      list: await Promise.all(list.map((item) => this.buildDetail(item))),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async getCustomerAcceptance(authUserId: string, id: string) {
    const customer = await projectAcceptanceRepository.getCustomerByAuthUserId(
      authUserId,
    );
    if (!customer) throw Errors.forbidden();

    const row = await this.getRequiredAcceptance(id);
    if (row.customer_id !== customer.id) {
      throw Errors.notFound("项目验收单不存在");
    }

    return this.buildDetail(row);
  }

  async createAcceptance(
    authContext: AuthContext,
    input: CreateProjectAcceptanceInput,
  ) {
    const employeeId = this.assertCurrentEmployee(authContext);
    await this.assertCanCreate(authContext, input.project_id);

    const project = await projectAcceptanceRepository.getProject(input.project_id);
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    const open = await projectAcceptanceRepository.hasOpenAcceptance(
      input.project_id,
      input.stage_code,
    );
    if (open) {
      throw Errors.badRequest("该工序已有进行中的验收单，请处理完成后再发起");
    }

    const { template, items } = await this.resolveTemplate(input);
    const reviewerId = await this.resolveReviewer(project, input.reviewer_id);

    const title = PROJECT_ACCEPTANCE_STAGE_LABELS[input.stage_code] || template.name;
    const row = await projectAcceptanceRepository.createAcceptance({
      project_id: input.project_id,
      stage_code: input.stage_code,
      template_id: template.id,
      template_version: template.version,
      title,
      status: "draft",
      initiator_id: employeeId,
      reviewer_id: reviewerId,
      customer_id: project.customer_id,
      summary: input.summary ?? null,
    });

    await projectAcceptanceRepository.createItems(
      items.map((item) => ({
        acceptance_id: row.id,
        template_item_id: item.id,
        category: item.category,
        title: item.title,
        standard: item.standard,
        required: item.required,
        allow_not_applicable: item.allow_not_applicable,
        photo_required: item.photo_required,
        photo_min_count: item.photo_min_count,
        photo_max_count: item.photo_max_count,
        result: null,
        remark: null,
        rectification_remark: null,
        rectification_images: [],
        images: [],
        sort_order: item.sort_order,
      })),
    );

    await this.recordAction({
      row,
      action: "create",
      fromStatus: null,
      toStatus: "draft",
      operatorType: "employee",
      operatorId: employeeId,
    });

    return this.buildDetail(row);
  }

  private async applyUpdate(
    row: ProjectAcceptanceRow,
    input: UpdateProjectAcceptanceInput,
  ) {
    let nextRow = row;
    const patch: Record<string, unknown> = {};
    if (input.summary !== undefined) patch.summary = input.summary;
    if (input.reviewer_id !== undefined) patch.reviewer_id = input.reviewer_id;

    if (Object.keys(patch).length > 0) {
      nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, patch);
    }

    if (input.items) {
      for (const item of input.items) {
        await projectAcceptanceRepository.updateItem(row.id, item.id, {
          ...(item.result !== undefined ? { result: item.result } : {}),
          ...(item.remark !== undefined ? { remark: item.remark } : {}),
          ...(item.images !== undefined ? { images: item.images } : {}),
          ...(item.rectification_remark !== undefined
            ? { rectification_remark: item.rectification_remark }
            : {}),
          ...(item.rectification_images !== undefined
            ? { rectification_images: item.rectification_images }
            : {}),
        });
      }
    }

    return nextRow;
  }

  async updateAcceptance(
    authContext: AuthContext,
    id: string,
    input: UpdateProjectAcceptanceInput,
  ) {
    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "update",
    });
    this.assertCanUpdateOwn(authContext, row);

    const nextRow = await this.applyUpdate(row, input);
    await this.recordAction({
      row: nextRow,
      action: "update",
      fromStatus: row.status,
      toStatus: nextRow.status,
      operatorType: "employee",
      operatorId: authContext.employeeId,
    });

    return this.buildDetail(nextRow);
  }

  private validateSubmitItems(input: {
    beforeItems: ProjectAcceptanceItemRow[];
    afterItems: ProjectAcceptanceItemRow[];
    isResubmit: boolean;
  }) {
    const beforeFailIds = new Set(
      input.beforeItems
        .filter((item) => item.result === "fail")
        .map((item) => item.id),
    );

    const failedItems: ProjectAcceptanceItemRow[] = [];

    for (const item of input.afterItems) {
      if (item.required && !item.result) {
        throw Errors.badRequest(`验收项「${item.title}」必须填写结果`);
      }

      if (item.result === "not_applicable") {
        if (!item.allow_not_applicable) {
          throw Errors.badRequest(`验收项「${item.title}」不允许选择不适用`);
        }
        if (!item.remark?.trim()) {
          throw Errors.badRequest(`验收项「${item.title}」选择不适用时必须填写说明`);
        }
      }

      const images = this.normalizeImageArray(item.images);
      if (item.photo_required && images.length < Math.max(1, item.photo_min_count)) {
        throw Errors.badRequest(`验收项「${item.title}」必须上传现场照片`);
      }

      if (images.length > item.photo_max_count) {
        throw Errors.badRequest(`验收项「${item.title}」图片数量超过上限`);
      }

      if (input.isResubmit && beforeFailIds.has(item.id)) {
        if (item.result !== "pass" && item.result !== "not_applicable") {
          throw Errors.badRequest(`整改项「${item.title}」必须重新验证通过`);
        }
        if (!item.rectification_remark?.trim()) {
          throw Errors.badRequest(`整改项「${item.title}」必须填写整改说明`);
        }
        const rectificationImages = this.normalizeImageArray(
          item.rectification_images,
        );
        if (item.photo_required && rectificationImages.length === 0) {
          throw Errors.badRequest(`整改项「${item.title}」必须上传整改后照片`);
        }
      }

      if (item.result === "fail") {
        failedItems.push(item);
      }
    }

    return failedItems;
  }

  async submitAcceptance(
    authContext: AuthContext,
    id: string,
    input: SubmitProjectAcceptanceInput,
  ) {
    let row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "submit",
    });
    this.assertCanSubmit(authContext, row);

    const beforeItems = await projectAcceptanceRepository.listItems(row.id);
    row = await this.applyUpdate(row, input);
    const afterItems = await projectAcceptanceRepository.listItems(row.id);

    const failedItems = this.validateSubmitItems({
      beforeItems,
      afterItems,
      isResubmit: row.status === "rejected",
    });

    if (failedItems.length > 0) {
      const reason = `存在 ${failedItems.length} 个未通过验收项：${
        failedItems.map((item) => item.title).join("、")
      }`;
      const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
        status: "rejected",
        submitted_at: new Date().toISOString(),
        rejected_at: new Date().toISOString(),
        reject_reason: reason,
        reject_source: null,
      });

      await this.recordAction({
        row: nextRow,
        action: "submit",
        fromStatus: row.status,
        toStatus: "rejected",
        operatorType: "employee",
        operatorId: authContext.employeeId,
        comment: reason,
      });

      return this.buildDetail(nextRow);
    }

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "submitted",
      submitted_at: new Date().toISOString(),
      rejected_at: null,
      reject_reason: null,
      reject_source: null,
    });

    await this.recordAction({
      row: nextRow,
      action: "submit",
      fromStatus: row.status,
      toStatus: "submitted",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.summary,
    });

    return this.buildDetail(nextRow);
  }

  async approveAcceptance(
    authContext: AuthContext,
    id: string,
    input: ApproveProjectAcceptanceInput,
  ) {
    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "leader_approve",
    });
    this.assertCanReview(authContext, row);

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "leader_approved",
      reviewed_at: new Date().toISOString(),
    });

    await this.recordAction({
      row: nextRow,
      action: "leader_approve",
      fromStatus: row.status,
      toStatus: "leader_approved",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.comment,
    });

    return this.buildDetail(nextRow);
  }

  async rejectAcceptance(
    authContext: AuthContext,
    id: string,
    input: RejectProjectAcceptanceInput,
  ) {
    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "leader_reject",
    });
    this.assertCanReject(authContext, row);

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "rejected",
      rejected_at: new Date().toISOString(),
      reject_reason: input.comment,
      reject_source: "leader",
    });

    await this.recordAction({
      row: nextRow,
      action: "leader_reject",
      fromStatus: row.status,
      toStatus: "rejected",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.comment,
    });

    return this.buildDetail(nextRow);
  }

  async customerConfirmAcceptance(
    authUserId: string,
    id: string,
    input: CustomerConfirmProjectAcceptanceInput,
  ) {
    const customer = await projectAcceptanceRepository.getCustomerByAuthUserId(
      authUserId,
    );
    if (!customer) throw Errors.forbidden();

    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "customer_confirm",
    });

    if (row.customer_id !== customer.id) {
      throw Errors.forbidden();
    }

    const now = new Date().toISOString();
    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "customer_confirmed",
      customer_confirmed_at: now,
      completed_at: now,
    });

    await this.recordAction({
      row: nextRow,
      action: "customer_confirm",
      fromStatus: row.status,
      toStatus: "customer_confirmed",
      operatorType: "customer",
      operatorId: customer.id,
      comment: input.comment,
    });

    return this.buildDetail(nextRow);
  }

  async customerDisputeAcceptance(
    authUserId: string,
    id: string,
    input: CustomerDisputeProjectAcceptanceInput,
  ) {
    const customer = await projectAcceptanceRepository.getCustomerByAuthUserId(
      authUserId,
    );
    if (!customer) throw Errors.forbidden();

    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "customer_dispute",
    });

    if (row.customer_id !== customer.id) {
      throw Errors.forbidden();
    }

    const comment = input.images?.length
      ? `${input.comment}\n图片：${input.images.join(",")}`
      : input.comment;
    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "rejected",
      rejected_at: new Date().toISOString(),
      reject_reason: input.comment,
      reject_source: "customer",
    });

    await this.recordAction({
      row: nextRow,
      action: "customer_dispute",
      fromStatus: row.status,
      toStatus: "rejected",
      operatorType: "customer",
      operatorId: customer.id,
      comment,
    });

    return this.buildDetail(nextRow);
  }

  async cancelAcceptance(
    authContext: AuthContext,
    id: string,
    input: CancelProjectAcceptanceInput,
  ) {
    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "cancel",
    });
    this.assertCanManage(authContext);

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "cancelled",
    });

    await this.recordAction({
      row: nextRow,
      action: "cancel",
      fromStatus: row.status,
      toStatus: "cancelled",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.comment,
    });

    return this.buildDetail(nextRow);
  }
}

export const projectAcceptanceService = new ProjectAcceptanceService();
