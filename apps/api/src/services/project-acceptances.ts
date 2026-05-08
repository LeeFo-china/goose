import { Errors } from "@/errors/error-factory";
import type {
  ApproveProjectAcceptanceInput,
  CancelProjectAcceptanceInput,
  CreateProjectAcceptanceInput,
  CustomerProjectAcceptanceOpenTicketQuery,
  CustomerConfirmProjectAcceptanceInput,
  CustomerDisputeProjectAcceptanceInput,
  NotifyProjectAcceptanceCustomerInput,
  ProjectAcceptanceListQuery,
  ProjectAcceptanceTemplateListQuery,
  RejectProjectAcceptanceInput,
  SubmitProjectAcceptanceInput,
  UpdateProjectAcceptanceInput,
  VerifyProjectAcceptanceOpenTicketInput,
} from "@/schema/project-acceptances";
import { randomBytes } from "node:crypto";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { projectAcceptanceRepository } from "@/repositories/project-acceptances";
import { projectAcceptanceOpenTicketRepository } from "@/repositories/project-acceptance-open-tickets";
import { systemSettingsService } from "@/services/system-settings";
import { sendSmsTemplate } from "@/services/sms";
import { wechatOpenLinkService } from "@/services/wechat-open-link";
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
  customer_status_label: string;
  has_customer_dispute: boolean;
  items: Array<ProjectAcceptanceItemRow & {
    images: string[];
    image_items: Array<{
      path: string;
      url: string;
      thumb_url: string;
    }>;
    rectification_images: string[];
    rectification_image_items: Array<{
      path: string;
      url: string;
      thumb_url: string;
    }>;
  }>;
  actions: Array<ProjectAcceptanceActionRow & {
    operator: ProjectAcceptanceEmployeeRow | ProjectAcceptanceCustomerRow | null;
  }>;
  project: ProjectAcceptanceProjectRow | null;
  initiator: ProjectAcceptanceEmployeeRow | null;
  reviewer: ProjectAcceptanceEmployeeRow | null;
  customer: ProjectAcceptanceCustomerRow | null;
  latest_customer_notification: {
    id: string;
    status: string;
    send_status: string | null;
    send_error: string | null;
    phone: string;
    link_type: string | null;
    sent_at: string | null;
    expire_at: string;
    used_at: string | null;
    created_at: string;
  } | null;
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
    return this.normalizeImageItems(value).map((item) => item.url);
  }

  private normalizeImageItems(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as Array<{ path: string; url: string; thumb_url: string }>;
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const url = this.getImagePublicUrl(item);
        return {
          path: /^https?:\/\//i.test(item) ? "" : item,
          url,
          thumb_url: url,
        };
      });
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
    const rawActions = await projectAcceptanceRepository.listActions(row.id);
    const actionEmployeeIds = rawActions
      .filter((item) => item.operator_type === "employee" && item.operator_id)
      .map((item) => item.operator_id as string);
    const actionCustomerIds = rawActions
      .filter((item) => item.operator_type === "customer" && item.operator_id)
      .map((item) => item.operator_id as string);

    const [items, actions, project, employees, customers, latestNotification] = await Promise.all([
      projectAcceptanceRepository.listItems(row.id),
      Promise.resolve(rawActions),
      projectAcceptanceRepository.getProject(row.project_id),
      projectAcceptanceRepository.listEmployees(
        Array.from(new Set([
          row.initiator_id,
          row.reviewer_id,
          ...actionEmployeeIds,
        ].filter((item): item is string => Boolean(item)))),
      ),
      projectAcceptanceRepository.listCustomers(
        Array.from(new Set([
          row.customer_id,
          ...actionCustomerIds,
        ].filter((item): item is string => Boolean(item)))),
      ),
      projectAcceptanceOpenTicketRepository.findLatestByAcceptance(row.id),
    ]);

    const employeeMap = new Map(employees.map((item) => [item.id, item]));
    const customerMap = new Map(customers.map((item) => [item.id, item]));
    const hasCustomerDispute = actions.some((item) =>
      item.action === "customer_dispute"
    );
    const customerStatusLabel = row.status === "leader_approved" && hasCustomerDispute
      ? "整改完成，待你确认"
      : this.getStatusLabel(row.status);

    return {
      ...row,
      stage_label: this.getStageLabel(row.stage_code),
      status_label: this.getStatusLabel(row.status),
      customer_status_label: customerStatusLabel,
      has_customer_dispute: hasCustomerDispute,
      items: items.map((item) => ({
        ...item,
        images: this.normalizeImageArray(item.images),
        image_items: this.normalizeImageItems(item.images),
        rectification_images: this.normalizeImageArray(item.rectification_images),
        rectification_image_items: this.normalizeImageItems(
          item.rectification_images,
        ),
      })),
      actions: actions.map((item) => ({
        ...item,
        operator: item.operator_type === "employee" && item.operator_id
          ? employeeMap.get(item.operator_id) || null
          : item.operator_type === "customer" && item.operator_id
          ? customerMap.get(item.operator_id) || null
          : null,
      })),
      project,
      initiator: employeeMap.get(row.initiator_id) || null,
      reviewer: row.reviewer_id ? employeeMap.get(row.reviewer_id) || null : null,
      customer: row.customer_id ? customerMap.get(row.customer_id) || null : null,
      latest_customer_notification: latestNotification
        ? {
          id: latestNotification.id,
          status: latestNotification.status,
          send_status: latestNotification.send_status,
          send_error: latestNotification.send_error,
          phone: this.maskPhone(latestNotification.phone),
          link_type: latestNotification.link_type,
          sent_at: latestNotification.sent_at,
          expire_at: latestNotification.expire_at,
          used_at: latestNotification.used_at,
          created_at: latestNotification.created_at,
        }
        : null,
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

  private maskPhone(phone: string) {
    const normalized = phone.trim();
    if (normalized.length < 7) {
      return normalized.replace(/.(?=.{2})/g, "*");
    }

    return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  }

  private createTicketValue() {
    return randomBytes(32).toString("hex");
  }

  private async getAcceptanceSmsExpireHours() {
    const value = await systemSettingsService.getNumber(
      "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
      72,
    );
    if (!Number.isFinite(value) || value <= 0) {
      return 72;
    }

    return Math.min(Math.max(Math.floor(value), 1), 720);
  }

  private async getAcceptanceSmsLink(input: {
    row: ProjectAcceptanceRow;
    ticket: string;
    expireAt: Date;
  }) {
    const pagePath = (await systemSettingsService.getString(
      "WECHAT_PROJECT_ACCEPTANCE_PAGE",
      "packageCustomerPortal/pages/customer-project-acceptance/index",
    )).replace(/^\/+/, "");
    const envVersion = wechatOpenLinkService.normalizeEnvVersion(
      await systemSettingsService.getString(
        "WECHAT_MINIPROGRAM_ENV_VERSION",
        "release",
      ),
    );
    const linkType = (await systemSettingsService.getString(
      "PROJECT_ACCEPTANCE_SMS_LINK_TYPE",
      "scheme",
    )).trim().toLowerCase() === "url_link"
      ? "url_link"
      : "scheme";
    const query = new URLSearchParams({
      id: input.row.id,
      projectId: input.row.project_id,
      ticket: input.ticket,
      source: "sms_acceptance",
    }).toString();

    const link = linkType === "url_link"
      ? await wechatOpenLinkService.generateUrlLink({
        path: pagePath,
        query,
        envVersion,
        expireAt: input.expireAt,
      })
      : await wechatOpenLinkService.generateScheme({
        path: pagePath,
        query,
        envVersion,
      });

    return { link, linkType };
  }

  private async getAcceptanceCustomer(row: ProjectAcceptanceRow) {
    if (!row.customer_id) {
      throw Errors.badRequest("该验收单未关联客户");
    }

    const [customer] = await projectAcceptanceRepository.listCustomers([
      row.customer_id,
    ]);
    if (!customer) {
      throw Errors.badRequest("验收单关联客户不存在");
    }
    if (!customer.phone?.trim()) {
      throw Errors.badRequest("客户未配置手机号，无法发送验收通知");
    }

    return customer;
  }

  private async sendAcceptanceCustomerSms(input: {
    phone: string;
    stageName: string;
    link: string;
    expireHours: number;
  }) {
    const provider = (await systemSettingsService.getString("SMS_PROVIDER", "mock"))
      .trim()
      .toLowerCase();
    const templateCode = await systemSettingsService.getString(
      "ALIYUN_SMS_TEMPLATE_CODE_PROJECT_ACCEPTANCE",
    );

    if (provider === "aliyun" && !templateCode) {
      throw Errors.badRequest("缺少项目验收通知短信模板 Code");
    }

    await sendSmsTemplate({
      phone: input.phone,
      templateCode,
      templateParam: {
        stageName: input.stageName,
        link: input.link,
        expireHours: input.expireHours,
      },
    });
  }

  private async notifyCustomerForAcceptanceInternal(input: {
    row: ProjectAcceptanceRow;
    createdBy: string | null;
    force: boolean;
  }) {
    if (input.row.status !== "leader_approved") {
      throw Errors.badRequest("只有待业主确认的验收单可以发送客户通知");
    }

    const customer = await this.getAcceptanceCustomer(input.row);
    const reusable = input.force
      ? null
      : await projectAcceptanceOpenTicketRepository.findReusable({
        acceptance_id: input.row.id,
        customer_id: customer.id,
        phone: customer.phone!,
      });

    if (reusable?.sent_at && reusable.send_status === "sent") {
      return {
        sent: true,
        reused: true,
        phone: this.maskPhone(reusable.phone),
        link_type: reusable.link_type || "scheme",
        expire_at: reusable.expire_at,
      };
    }

    const expireHours = await this.getAcceptanceSmsExpireHours();
    const expireAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);
    const ticket = this.createTicketValue();
    const { link, linkType } = await this.getAcceptanceSmsLink({
      row: input.row,
      ticket,
      expireAt,
    });
    const openTicket = await projectAcceptanceOpenTicketRepository.create({
      ticket,
      acceptance_id: input.row.id,
      project_id: input.row.project_id,
      customer_id: customer.id,
      phone: customer.phone!,
      expire_at: expireAt.toISOString(),
      created_by: input.createdBy,
      link_type: linkType,
      link_url: link,
    });

    try {
      await this.sendAcceptanceCustomerSms({
        phone: customer.phone!,
        stageName: this.getStageLabel(input.row.stage_code) || input.row.title,
        link,
        expireHours,
      });

      const sent = await projectAcceptanceOpenTicketRepository.update(
        openTicket.id,
        {
          send_status: "sent",
          send_error: null,
          sent_at: new Date().toISOString(),
        },
      );

      return {
        sent: true,
        reused: false,
        phone: this.maskPhone(sent.phone),
        link_type: sent.link_type || linkType,
        expire_at: sent.expire_at,
      };
    } catch (error) {
      await projectAcceptanceOpenTicketRepository.update(openTicket.id, {
        send_status: "failed",
        send_error: error instanceof Error ? error.message : "短信发送失败",
      });
      throw error;
    }
  }

  private async verifyOpenTicketRow(input: VerifyProjectAcceptanceOpenTicketInput) {
    const ticket = await projectAcceptanceOpenTicketRepository.findByTicket(
      input.ticket,
    );
    if (!ticket) {
      return { valid: false as const, reason: "not_found" as const };
    }

    if (ticket.acceptance_id !== input.acceptance_id || ticket.project_id !== input.project_id) {
      return { valid: false as const, reason: "acceptance_mismatch" as const };
    }

    if (ticket.status === "revoked") {
      return { valid: false as const, reason: "revoked" as const };
    }

    if (ticket.status === "expired" || new Date(ticket.expire_at).getTime() <= Date.now()) {
      if (ticket.status === "active") {
        await projectAcceptanceOpenTicketRepository.update(ticket.id, {
          status: "expired",
        });
      }
      return { valid: false as const, reason: "expired" as const };
    }

    const row = await projectAcceptanceRepository.getAcceptanceById(
      ticket.acceptance_id,
    );
    if (!row) {
      return { valid: false as const, reason: "not_found" as const };
    }

    if (row.customer_id !== ticket.customer_id) {
      return { valid: false as const, reason: "customer_mismatch" as const };
    }

    if (row.status !== "leader_approved") {
      return { valid: false as const, reason: "not_reviewable" as const };
    }

    const now = new Date().toISOString();
    const verified = await projectAcceptanceOpenTicketRepository.update(ticket.id, {
      used_at: ticket.used_at || now,
      last_verified_at: now,
      verify_count: (ticket.verify_count || 0) + 1,
    });

    return { valid: true as const, ticket: verified, row };
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

  async getCustomerAcceptanceByAuthOrTicket(input: {
    authUserId?: string | null;
    id: string;
    ticketQuery?: CustomerProjectAcceptanceOpenTicketQuery;
  }) {
    const row = await this.getRequiredAcceptance(input.id);

    if (input.authUserId) {
      const customer = await projectAcceptanceRepository.getCustomerByAuthUserId(
        input.authUserId,
      );
      if (customer && row.customer_id === customer.id) {
        return this.buildDetail(row);
      }
    }

    if (input.ticketQuery?.ticket && input.ticketQuery.project_id) {
      const result = await this.verifyOpenTicketRow({
        ticket: input.ticketQuery.ticket,
        acceptance_id: row.id,
        project_id: input.ticketQuery.project_id,
      });
      if (result.valid) {
        return this.buildDetail(row);
      }

      throw Errors.business(403, "验收短信访问票据无效或已失效", "FORBIDDEN", {
        reason: result.reason,
      });
    }

    if (input.authUserId) {
      throw Errors.notFound("项目验收单不存在");
    }

    throw Errors.unauthorized("请先登录或提供有效访问票据");
  }

  async verifyOpenTicket(input: VerifyProjectAcceptanceOpenTicketInput) {
    const result = await this.verifyOpenTicketRow(input);
    if (!result.valid) {
      return result;
    }

    return {
      valid: true,
      acceptance_id: result.ticket.acceptance_id,
      project_id: result.ticket.project_id,
      customer_id: result.ticket.customer_id,
      status: result.row.status,
      expires_at: result.ticket.expire_at,
    };
  }

  private async resolveCustomerActor(input: {
    authUserId?: string | null;
    row: ProjectAcceptanceRow;
    ticket?: string;
    projectId?: string;
  }) {
    if (input.authUserId) {
      const customer = await projectAcceptanceRepository.getCustomerByAuthUserId(
        input.authUserId,
      );
      if (customer && input.row.customer_id === customer.id) {
        return customer;
      }
    }

    if (input.ticket && input.projectId) {
      const result = await this.verifyOpenTicketRow({
        ticket: input.ticket,
        acceptance_id: input.row.id,
        project_id: input.projectId,
      });
      if (result.valid) {
        const [customer] = await projectAcceptanceRepository.listCustomers([
          result.ticket.customer_id,
        ]);
        if (customer) return customer;
      }
    }

    if (input.authUserId || input.ticket) {
      throw Errors.forbidden();
    }

    throw Errors.unauthorized("请先登录或提供有效访问票据");
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

  async deleteDraftAcceptance(authContext: AuthContext, id: string) {
    const row = await this.getRequiredAcceptance(id);
    if (row.status !== "draft") {
      throw Errors.business(
        400,
        "只有草稿状态的验收单可以删除",
        "ACCEPTANCE_NOT_DRAFT",
        { status: row.status },
      );
    }

    this.assertCanUpdateOwn(authContext, row);
    await projectAcceptanceRepository.deleteAcceptance(row.id);

    return {
      id: row.id,
      deleted: true,
    };
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

    try {
      await this.notifyCustomerForAcceptanceInternal({
        row: nextRow,
        createdBy: authContext.employeeId,
        force: false,
      });
    } catch {
      // 短信是客户触达能力，不能阻断领导复核主流程。
    }

    return this.buildDetail(nextRow);
  }

  async notifyCustomerForAcceptance(
    authContext: AuthContext,
    id: string,
    input: NotifyProjectAcceptanceCustomerInput,
  ) {
    const row = await this.getRequiredAcceptance(id);
    this.assertCanReview(authContext, row);

    return this.notifyCustomerForAcceptanceInternal({
      row,
      createdBy: authContext.employeeId,
      force: input.force,
    });
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
    authUserId: string | null | undefined,
    id: string,
    input: CustomerConfirmProjectAcceptanceInput,
  ) {
    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "customer_confirm",
    });
    const customer = await this.resolveCustomerActor({
      authUserId,
      row,
      ticket: input.ticket,
      projectId: input.project_id,
    });

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
    authUserId: string | null | undefined,
    id: string,
    input: CustomerDisputeProjectAcceptanceInput,
  ) {
    const row = await this.getRequiredAcceptance(id);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "customer_dispute",
    });
    const customer = await this.resolveCustomerActor({
      authUserId,
      row,
      ticket: input.ticket,
      projectId: input.project_id,
    });

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
