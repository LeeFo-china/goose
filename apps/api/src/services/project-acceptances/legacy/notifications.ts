import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
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
  RectifyProjectAcceptanceInput,
  SubmitProjectAcceptanceInput,
  UpdateProjectAcceptanceTemplateInput,
  UpdateProjectAcceptanceInput,
  VerifyProjectAcceptanceOpenTicketInput,
} from "@/schema/project-acceptances";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { projectAcceptanceRepository } from "@/repositories/project-acceptances";
import {
  projectAcceptanceOpenTicketRepository,
  type ProjectAcceptanceOpenTicketRow,
} from "@/repositories/project-acceptance-open-tickets";
import { systemSettingsService } from "@/services/system-settings";
import { sendSmsTemplate } from "@/services/sms";
import { userIdentityService } from "@/services/user-identities";
import { wechatOpenLinkService } from "@/services/wechat-open-link";
import { projectStatusService } from "@/services/project-status";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { projectSer } from "@/services/projects";
import type {
  ProjectAcceptanceActionRow,
  ProjectAcceptanceCustomerRow,
  ProjectAcceptanceEmployeeRow,
  ProjectAcceptanceItemRow,
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
  ProjectAcceptanceTemplateItemRow,
  ProjectAcceptanceTemplateItemWriteRow,
  ProjectAcceptanceTemplateRow,
  ProjectAcceptanceTemplateSectionRow,
  ProjectAcceptanceTemplateSectionWriteRow,
} from "@/repositories/project-acceptances";
import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
  type ProjectAcceptanceAction,
  type ProjectAcceptanceStatus,
  type ProjectAcceptanceType,
  type ProjectLogStageCode,
} from "@gooes/domain";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
const OPEN_ACCEPTANCE_STATUSES: ProjectAcceptanceStatus[] = [
  "draft",
  "submitted",
  "leader_approved",
  "rejected",
];
const CUSTOMER_ACCEPTANCE_LIST_CACHE_TTL_MS = 10_000;
const MAX_CUSTOMER_ACCEPTANCE_LIST_CACHE_SIZE = 2_000;

type AcceptanceImageSource = "acceptance_item" | "rectification_item";

type AcceptanceImageItem = {
  id?: string;
  acceptance_id?: string;
  item_id?: string;
  item_title?: string | null;
  path: string;
  url: string;
  thumb_url: string;
  source?: AcceptanceImageSource;
  created_at?: string | null;
};

type ActionMetadata = {
  images: string[];
  image_items: AcceptanceImageItem[];
  referenced_action_id: string | null;
  referenced_item_ids: string[];
  referenced_image_ids: string[];
  referenced_image_paths: string[];
  referenced_images: AcceptanceImageItem[];
};

type AcceptanceDetailItem = ProjectAcceptanceItemRow & {
  images: string[];
  image_items: AcceptanceImageItem[];
  rectification_images: string[];
  rectification_image_items: AcceptanceImageItem[];
};

type AcceptanceDetailSection = {
  id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  items: AcceptanceDetailItem[];
};

type AcceptanceProgress = {
  total: number;
  checked: number;
  passed: number;
  failed: number;
  not_applicable: number;
  required_incomplete: number;
};

type AcceptanceDetail = ProjectAcceptanceRow & {
  stage_label: string | null;
  status_label: string;
  customer_status_label: string;
  has_customer_dispute: boolean;
  sections: AcceptanceDetailSection[];
  progress: AcceptanceProgress;
  failed_count: number;
  required_incomplete_count: number;
  can_submit: boolean;
  blocked_reason: string | null;
  items: AcceptanceDetailItem[];
  actions: Array<ProjectAcceptanceActionRow & {
    operator: ProjectAcceptanceEmployeeRow | ProjectAcceptanceCustomerRow | null;
    images: string[];
    image_items: AcceptanceImageItem[];
    referenced_action_id: string | null;
    referenced_item_ids: string[];
    referenced_image_ids: string[];
    referenced_image_paths: string[];
    referenced_images: AcceptanceImageItem[];
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

type CreateAcceptanceResponseMode = "summary" | "detail";

type AcceptanceCreateSummary = Pick<
  ProjectAcceptanceRow,
  "id" | "project_id" | "acceptance_type" | "stage_code" | "status" | "created_at"
> & {
  stage_label: string | null;
};

type CustomerAcceptanceListResult = {
  list: AcceptanceDetail[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

class ProjectAcceptanceWorkflowService {
  assertTransition(input: {
    currentStatus: ProjectAcceptanceStatus;
    action: ProjectAcceptanceAction;
  }) {
    const allowed: Record<ProjectAcceptanceStatus, ProjectAcceptanceAction[]> = {
      draft: ["update", "submit", "cancel"],
      rejected: ["update", "submit", "employee_rectify", "cancel"],
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

export async function recordAction(this: any, input: {
    row: ProjectAcceptanceRow;
    action: ProjectAcceptanceAction;
    fromStatus: ProjectAcceptanceStatus | null;
    toStatus: ProjectAcceptanceStatus;
    operatorType: "employee" | "customer" | "system";
    operatorId: string | null;
    comment?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    await projectAcceptanceRepository.createAction({
      tenant_id: input.row.tenant_id,
      acceptance_id: input.row.id,
      operator_type: input.operatorType,
      operator_id: input.operatorId,
      action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      comment: input.comment ?? null,
      metadata: input.metadata ?? {},
    });
    this.clearCustomerAcceptanceListCache();
  }

export function maskPhone(this: any, phone: string) {
    const normalized = phone.trim();
    if (normalized.length < 7) {
      return normalized.replace(/.(?=.{2})/g, "*");
    }

    return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  }

export function createTicketValue(this: any) {
    return randomBytes(32).toString("hex");
  }

export async function getAcceptanceSmsExpireHours(this: any, tenantId?: string | null) {
    const channelMode = tenantId
      ? await systemSettingsService.getTenantOverrideString(
        "SMS_CHANNEL_MODE",
        tenantId,
        "platform",
      )
      : "platform";
    const effectiveTenantId = channelMode === "tenant_aliyun" || channelMode === "tenant_tencent"
      ? tenantId
      : null;
    const value = await systemSettingsService.getNumber(
      "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
      72,
      { tenantId: effectiveTenantId },
    );
    if (!Number.isFinite(value) || value <= 0) {
      return 72;
    }

    return Math.min(Math.max(Math.floor(value), 1), 720);
  }

export async function getAcceptanceSmsLink(this: any, input: {
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

export async function getAcceptanceCustomer(this: any, row: ProjectAcceptanceRow) {
    if (!row.customer_id) {
      throw Errors.badRequest("该验收单未关联客户");
    }

    const [customer] = await projectAcceptanceRepository.listCustomers([
      row.customer_id,
    ]);
    if (!customer || customer.tenant_id !== row.tenant_id) {
      throw Errors.badRequest("验收单关联客户不存在");
    }
    if (!customer.phone?.trim()) {
      throw Errors.badRequest("客户未配置手机号，无法发送验收通知");
    }

    return customer;
  }

export async function sendAcceptanceCustomerSms(this: any, input: {
    tenantId: string | null;
    phone: string;
    stageName: string;
    link: string;
    expireHours: number;
  }) {
    await sendSmsTemplate({
      phone: input.phone,
      templateParam: {
        stageName: input.stageName,
        link: input.link,
        expireHours: input.expireHours,
      },
      tenantId: input.tenantId,
      templatePurpose: "project_acceptance",
    });
  }

export async function notifyCustomerForAcceptanceInternal(this: any, input: {
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
        tenant_id: input.row.tenant_id,
        acceptance_id: input.row.id,
        customer_id: customer.id,
        phone: customer.phone!,
      });

    if (reusable?.sent_at && reusable.send_status === "sent") {
      this.clearCustomerAcceptanceListCache();
      return {
        sent: true,
        reused: true,
        phone: this.maskPhone(reusable.phone),
        link_type: reusable.link_type || "scheme",
        expire_at: reusable.expire_at,
      };
    }

    const expireHours = await this.getAcceptanceSmsExpireHours(input.row.tenant_id);
    const expireAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);
    const ticket = this.createTicketValue();
    const { link, linkType } = await this.getAcceptanceSmsLink({
      row: input.row,
      ticket,
      expireAt,
    });
    const openTicket = await projectAcceptanceOpenTicketRepository.create({
      tenant_id: input.row.tenant_id,
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
        tenantId: input.row.tenant_id,
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
        input.row.tenant_id,
      );

      this.clearCustomerAcceptanceListCache();
      return {
        sent: true,
        reused: false,
        phone: this.maskPhone(sent.phone),
        link_type: sent.link_type || linkType,
        expire_at: sent.expire_at,
      };
    } catch (error) {
      await projectAcceptanceOpenTicketRepository.update(
        openTicket.id,
        {
          send_status: "failed",
          send_error: error instanceof Error ? error.message : "短信发送失败",
        },
        input.row.tenant_id,
      );
      this.clearCustomerAcceptanceListCache();
      throw error;
    }
  }

export async function verifyOpenTicketRow(this: any, input: VerifyProjectAcceptanceOpenTicketInput) {
    const ticket = await projectAcceptanceOpenTicketRepository.findByTicket(
      input.ticket,
    );
    if (!ticket) {
      return { valid: false as const, reason: "not_found" as const };
    }

    if (ticket.acceptance_id !== input.acceptance_id || ticket.project_id !== input.project_id) {
      return { valid: false as const, reason: "acceptance_mismatch" as const };
    }

    await this.assertTenantAvailableById(ticket.tenant_id);

    if (ticket.status === "revoked") {
      return { valid: false as const, reason: "revoked" as const };
    }

    if (ticket.status === "expired" || new Date(ticket.expire_at).getTime() <= Date.now()) {
      if (ticket.status === "active") {
        await projectAcceptanceOpenTicketRepository.update(
          ticket.id,
          { status: "expired" },
          ticket.tenant_id,
        );
      }
      return { valid: false as const, reason: "expired" as const };
    }

    const row = await projectAcceptanceRepository.getAcceptanceById(
      ticket.acceptance_id,
      ticket.tenant_id,
    );
    if (!row) {
      return { valid: false as const, reason: "not_found" as const };
    }

    if (row.customer_id !== ticket.customer_id) {
      return { valid: false as const, reason: "customer_mismatch" as const };
    }

    if (row.status !== "leader_approved" && row.status !== "customer_confirmed") {
      return { valid: false as const, reason: "not_reviewable" as const };
    }

    const now = new Date().toISOString();
    const verified = await projectAcceptanceOpenTicketRepository.update(
      ticket.id,
      {
        used_at: ticket.used_at || now,
        last_verified_at: now,
        verify_count: (ticket.verify_count || 0) + 1,
      },
      ticket.tenant_id,
    );

    return { valid: true as const, ticket: verified, row };
  }
