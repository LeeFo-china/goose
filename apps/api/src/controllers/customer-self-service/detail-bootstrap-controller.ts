import type { FastifyRequest } from "fastify";
import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { customerCampaignBootstrapService } from "@/services/customer-campaign-bootstrap";
import { customerProjectLogShareService } from "@/services/customer-project-log-shares";
import { customerProjectDetailService } from "@/services/customer-project-detail";
import { customerProjectDetailLogsService } from "@/services/customer-project-detail-logs";
import { customerServiceConfigService } from "@/services/customer-service-config";
import { customerSelfServiceService } from "@/services/customer-self-service";
import { projectAcceptanceService } from "@/services/project-acceptances";
import {
  createCustomerProjectDetailTimingSteps,
  logCustomerProjectDetailTiming,
  measureCustomerProjectDetailStep,
} from "@/utils/customer-project-detail-timing";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { CustomerSelfServiceProjectBaseController } from "./project-base";
import { CustomerProjectDetailBootstrapQuerySchema } from "./shared";

type PartialError = {
  module: string;
  code: string;
  message: string;
};

const OPTIONAL_MODULE_TIMEOUT_MS = 1_200;
const DETAIL_LOGS_TIMEOUT_MS = 2_500;
const DETAIL_ACCEPTANCES_TIMEOUT_MS = 2_500;
const DETAIL_CONSTRUCTION_STAGES_TIMEOUT_MS = 1_800;

class CustomerProjectDetailBootstrapController
  extends CustomerSelfServiceProjectBaseController {
  private withOptionalModuleTimeout<T>(
    module: string,
    promise: Promise<T>,
    timeoutMs = OPTIONAL_MODULE_TIMEOUT_MS,
  ) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeout = setTimeout(() => {
        reject(Errors.business(
          504,
          `${module} 模块加载超时`,
          ErrorCodes.INTERNAL_ERROR,
          { module, timeout_ms: timeoutMs },
        ));
      }, timeoutMs);
    });

    return Promise.race([
      promise.finally(() => {
        if (timeout) clearTimeout(timeout);
      }),
      timeoutPromise,
    ]);
  }

  private buildPartialError(module: string, error: unknown): PartialError {
    if (error instanceof AppError) {
      return { module, code: error.code, message: error.message };
    }

    return {
      module,
      code: ErrorCodes.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : "模块加载失败",
    };
  }

  private isOptionalCampaignMiss(error: unknown) {
    return error instanceof AppError &&
      (
        error.code === ErrorCodes.APPOINTMENT_REWARD_CAMPAIGN_NOT_FOUND ||
        error.code === ErrorCodes.SHARE_CAMPAIGN_CONFIG_NOT_FOUND
      );
  }

  private buildDisabledShareCampaignSummary(projectId: string) {
    return {
      project_id: projectId,
      campaign_type: "share_assist",
      config_enabled: false,
      display_mode: "disabled",
      config_status: null,
      focus_campaign: null,
      recommended_log: null,
    };
  }

  private buildDisabledAppointmentRewardCampaign(projectId: string) {
    return {
      instance_id: null,
      campaign_id: null,
      campaign_type: "appointment_reward",
      status: "not_configured",
      reward_claim_status: "unclaimed",
      project_id: projectId,
      project_name: null,
      appointment_name: null,
      appointment_phone: null,
      appointment_time: null,
      achieved_at: null,
      reward_claimed_at: null,
      reward_title: null,
      reward_claim_instruction: null,
      display_title: null,
      display_subtitle: null,
      reward_claim_voucher: null,
      config_enabled: false,
      display_mode: "disabled",
    };
  }

  @Get("/customer/projects/:id/detail-bootstrap")
  async getCustomerProjectDetailBootstrap(request: FastifyRequest) {
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const authUserId = await measureCustomerProjectDetailStep(
      steps,
      "auth_context_ms",
      () => this.getRequiredAuthUserId(request),
    );
    const customer = await measureCustomerProjectDetailStep(
      steps,
      "customer_context_ms",
      () => this.getCustomerProfileFromRequest(request, { required: true }),
    );
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const queryResult = CustomerProjectDetailBootstrapQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const project = await measureCustomerProjectDetailStep(
      steps,
      "project_detail_ms",
      () => customerProjectDetailService.getOwnedProject({
        projectId: idVerify.data.id,
        customerId: customer!.id,
        tenantId: customer!.tenant_id!,
      }),
    );
    const projectTenantId = project.tenant_id ?? null;
    const partialErrors: PartialError[] = [];
    const addPartialError = (module: string, error: unknown) => {
      partialErrors.push(this.buildPartialError(module, error));
      request.log.warn(
        {
          requestId: request.id,
          module,
          err: error,
          projectId: project.id,
          customerId: customer!.id,
          tenantId: projectTenantId,
        },
        "[customer-project-detail] optional module failed",
      );
    };

    const logsPromise = this.withOptionalModuleTimeout("logs", this.loadLogs({
      customerId: customer!.id,
      pageSize: queryResult.data.log_page_size,
      projectId: project.id,
      tenantId: projectTenantId,
      steps,
    }), DETAIL_LOGS_TIMEOUT_MS).catch((error) => {
      addPartialError("logs", error);
      return {
        list: [],
        pagination: {
          page: 1,
          pageSize: queryResult.data.log_page_size,
          total: 0,
          totalPages: 0,
        },
      };
    });

    const projectPromise = measureCustomerProjectDetailStep(
      steps,
      "serialize_ms",
      async () => this.serializeCustomerProjectListItem(project),
    );
    const customerServicePromise = this.withOptionalModuleTimeout(
      "customer_service",
      measureCustomerProjectDetailStep(
        steps,
        "customer_service_ms",
        () => customerServiceConfigService.getCustomerServiceConfig(projectTenantId),
      ),
    ).catch((error) => {
      addPartialError("customer_service", error);
      return null;
    });
    const acceptancesPromise = queryResult.data.include_acceptances
      ? this.withOptionalModuleTimeout(
        "acceptances",
        measureCustomerProjectDetailStep(
          steps,
          "acceptances_ms",
          () => projectAcceptanceService.listCustomerAcceptances(
            authUserId,
            { project_id: project.id, page: 1, pageSize: 20 },
            {
              tenantId: request.user?.tenant_id ?? null,
              customerId: request.user?.customer_id ?? null,
            },
            { responseMode: "summary" },
          ),
        ),
        DETAIL_ACCEPTANCES_TIMEOUT_MS,
      ).catch((error) => {
        addPartialError("acceptances", error);
        return null;
      })
      : Promise.resolve(undefined);
    const stagesPromise = queryResult.data.include_stages
      ? this.withOptionalModuleTimeout(
        "construction_stages",
        measureCustomerProjectDetailStep(
          steps,
          "construction_stages_ms",
          () => projectTenantId
            ? constructionStageStatusService.listCustomerProjectConstructionStages({
              projectId: project.id,
              tenantId: projectTenantId,
              customerId: customer!.id,
            })
            : constructionStageStatusService.listProjectConstructionStagesForProject({
              projectId: project.id,
              tenantId: projectTenantId,
            }),
        ),
        DETAIL_CONSTRUCTION_STAGES_TIMEOUT_MS,
      ).catch((error) => {
        addPartialError("construction_stages", error);
        return null;
      })
      : Promise.resolve(undefined);
    const campaignSummaryPromise = queryResult.data.include_campaigns
      ? this.withOptionalModuleTimeout(
        "campaign_summary",
        this.loadCampaignSummary(authUserId, project.id, request, steps),
      )
        .catch((error) => {
          if (!this.isOptionalCampaignMiss(error)) {
            addPartialError("campaign_summary", error);
          }
          return this.buildDisabledShareCampaignSummary(project.id);
        })
      : Promise.resolve(undefined);
    const appointmentRewardPromise = queryResult.data.include_campaigns
      ? this.withOptionalModuleTimeout(
        "appointment_reward_campaign",
        this.loadAppointmentReward(authUserId, project.id, request, steps),
      )
        .catch((error) => {
          if (!this.isOptionalCampaignMiss(error)) {
            addPartialError("appointment_reward_campaign", error);
          }
          return this.buildDisabledAppointmentRewardCampaign(project.id);
        })
      : Promise.resolve(undefined);

    const [
      projectPayload,
      customerService,
      logs,
      acceptances,
      constructionStages,
      campaignSummary,
      appointmentRewardCampaign,
    ] = await Promise.all([
      projectPromise,
      customerServicePromise,
      logsPromise,
      acceptancesPromise,
      stagesPromise,
      campaignSummaryPromise,
      appointmentRewardPromise,
    ]);

    const payload = await measureCustomerProjectDetailStep(
      steps,
      "serialize_ms",
      async () => ({
        project: projectPayload,
        customer_service: customerService,
        logs,
        ...(acceptances !== undefined ? { acceptances } : {}),
        ...(constructionStages !== undefined
          ? { construction_stages: constructionStages }
          : {}),
        ...(campaignSummary !== undefined
          ? { campaign_summary: campaignSummary }
          : {}),
        ...(appointmentRewardCampaign !== undefined
          ? { appointment_reward_campaign: appointmentRewardCampaign }
          : {}),
        partial_errors: partialErrors,
        server_time: new Date().toISOString(),
      }),
    );

    logCustomerProjectDetailTiming(request, {
      route: "GET /customer/projects/:id/detail-bootstrap",
      startedAt,
      tenantId: projectTenantId,
      customerId: customer?.id ?? null,
      projectId: project.id,
      query: {
        log_page_size: queryResult.data.log_page_size,
        include_acceptances: queryResult.data.include_acceptances,
        include_stages: queryResult.data.include_stages,
        include_campaigns: queryResult.data.include_campaigns,
      },
      steps,
    });

    return ResponseHandler.success(this.withDebugTiming(
      payload,
      queryResult.data.debug_timing,
      { auth_steps: this.getAuthTimingSteps(request), steps },
    ));
  }

  private async loadLogs(input: {
    customerId: string;
    pageSize: number;
    projectId: string;
    tenantId: string | null;
    steps: ReturnType<typeof createCustomerProjectDetailTimingSteps>;
  }) {
    if (input.tenantId) {
      const logs = await measureCustomerProjectDetailStep(
        input.steps,
        "logs_ms",
        () => customerProjectDetailLogsService.listLogs({
          projectId: input.projectId,
          tenantId: input.tenantId!,
          customerId: input.customerId,
          pageSize: input.pageSize,
        }),
      );
      return {
        list: logs.map((item) => {
          const base = this.serializeCustomerProjectLog({
            ...item,
            employee: item.employee_id
              ? { id: item.employee_id, name: item.employee_name, avatar: item.employee_avatar }
              : null,
          });
          const ratingCount = Number(item.rating_count ?? 0);
          const ratingSum = Number(item.rating_sum ?? 0);
          return {
            ...base,
            comment_count: Number(item.comment_count ?? 0),
            rating_count: ratingCount,
            average_rating: ratingCount ? Number((ratingSum / ratingCount).toFixed(1)) : null,
            my_rating: item.my_rating == null ? null : Number(item.my_rating),
          };
        }),
        pagination: { page: 1, pageSize: input.pageSize, total: 0, totalPages: 0 },
      };
    }

    const { list: logs, count } = await measureCustomerProjectDetailStep(
      input.steps,
      "logs_ms",
      () => customerSelfServiceService.listProjectLogs({
        projectId: input.projectId,
        tenantId: input.tenantId,
        from: 0,
        to: input.pageSize - 1,
        includeCount: false,
      }),
    );
    const aggregateRows = await measureCustomerProjectDetailStep(
      input.steps,
      "logs_ms",
      () => customerSelfServiceService.listProjectLogCommentAggregates({
        logIds: logs.map((item) => item.id),
        tenantId: input.tenantId,
      }),
    );
    const aggregateMap = this.buildProjectLogAggregates(
      aggregateRows,
      input.customerId,
    );

    return {
      list: logs.map((item) => {
        const base = this.serializeCustomerProjectLog(item);
        const aggregate = aggregateMap.get(item.id);
        return {
          ...base,
          comment_count: aggregate?.comment_count ?? 0,
          rating_count: aggregate?.rating_count ?? 0,
          average_rating: aggregate?.rating_count
            ? Number((aggregate.rating_sum / aggregate.rating_count).toFixed(1))
            : null,
          my_rating: aggregate?.my_rating ?? null,
        };
      }),
      pagination: {
        page: 1,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  private loadCampaignSummary(
    authUserId: string,
    projectId: string,
    request: FastifyRequest,
    steps: ReturnType<typeof createCustomerProjectDetailTimingSteps>,
  ) {
    return measureCustomerProjectDetailStep(
      steps,
      "campaign_summary_ms",
      async () => {
        const tenantId = request.user?.tenant_id ?? null;
        const hasEntry = await customerCampaignBootstrapService.hasShareAssistEntry({
          projectId,
          tenantId,
        });
        if (hasEntry === false) {
          return this.buildDisabledShareCampaignSummary(projectId);
        }
        return customerProjectLogShareService.getCustomerProjectCampaignSummary(
          authUserId,
          projectId,
          {
            tenantId,
            customerId: request.user?.customer_id ?? null,
          },
        );
      },
    );
  }

  private loadAppointmentReward(
    authUserId: string,
    projectId: string,
    request: FastifyRequest,
    steps: ReturnType<typeof createCustomerProjectDetailTimingSteps>,
  ) {
    return measureCustomerProjectDetailStep(
      steps,
      "appointment_reward_ms",
      async () => {
        const tenantId = request.user?.tenant_id ?? null;
        const hasEntry =
          await customerCampaignBootstrapService.hasAppointmentRewardEntry({
            projectId,
            tenantId,
          });
        if (hasEntry === false) {
          return this.buildDisabledAppointmentRewardCampaign(projectId);
        }
        return customerProjectLogShareService.getCustomerAppointmentRewardCampaign(
          authUserId,
          projectId,
          {
            tenantId,
            customerId: request.user?.customer_id ?? null,
          },
        );
      },
    );
  }
}

export default new CustomerProjectDetailBootstrapController();
