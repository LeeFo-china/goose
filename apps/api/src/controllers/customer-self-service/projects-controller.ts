import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { customerProjectDetailService } from "@/services/customer-project-detail";
import { customerProjectDetailLogsService } from "@/services/customer-project-detail-logs";
import { customerSelfServiceService } from "@/services/customer-self-service";
import {
  createCustomerProjectDetailTimingSteps,
  logCustomerProjectDetailTiming,
  measureCustomerProjectDetailStep,
} from "@/utils/customer-project-detail-timing";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import {
  CustomerProjectListQuerySchema,
  CustomerProjectLogCommentListQuerySchema,
  CustomerProjectLogCommentParamSchema,
  CustomerProjectLogListQuerySchema,
} from "./shared";
import { CustomerSelfServiceProjectBaseController } from "./project-base";

class CustomerProjectsController extends CustomerSelfServiceProjectBaseController {
  @Get("/customer/projects")
  async listCustomerProjects(request: FastifyRequest) {
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const customer = await measureCustomerProjectDetailStep(
      steps,
      "customer_context_ms",
      () => this.getCustomerProfileFromRequest(request, {
        required: true,
      }),
    );
    const queryResult = CustomerProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, include } = queryResult.data;
    const payload = await this.buildCustomerProjectsPayload({
      customer: customer!,
      page,
      pageSize,
      include,
      request,
      timingSteps: steps,
    });
    logCustomerProjectDetailTiming(request, {
      route: "GET /customer/projects",
      startedAt,
      tenantId: customer?.tenant_id ?? null,
      customerId: customer?.id ?? null,
      query: {
        include: include ?? null,
        page,
        pageSize,
      },
      steps,
    });
    return ResponseHandler.success(this.withDebugTiming(
      payload,
      queryResult.data.debug_timing,
      { auth_steps: this.getAuthTimingSteps(request), steps },
    ));
  }

  @Get("/customer/projects/:id")
  async getCustomerProjectById(request: FastifyRequest) {
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const customer = await measureCustomerProjectDetailStep(
      steps,
      "customer_context_ms",
      () => this.getCustomerProfileFromRequest(request, {
        required: true,
      }),
    );
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await measureCustomerProjectDetailStep(
      steps,
      "project_detail_ms",
      () => this.getOwnedProject(idVerify.data.id, customer!.id, customer!.tenant_id),
    );
    const payload = await measureCustomerProjectDetailStep(
      steps,
      "serialize_ms",
      () => this.serializeCustomerProjectDetailItem(project),
    );
    logCustomerProjectDetailTiming(request, {
      route: "GET /customer/projects/:id",
      startedAt,
      tenantId: customer?.tenant_id ?? null,
      customerId: customer?.id ?? null,
      projectId: idVerify.data.id,
      steps,
    });
    return ResponseHandler.success(payload);
  }

  @Get("/customer/projects/:id/construction-stages")
  async listCustomerProjectConstructionStages(request: FastifyRequest) {
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const customer = await measureCustomerProjectDetailStep(
      steps,
      "customer_context_ms",
      () => this.getCustomerProfileFromRequest(request, {
        required: true,
      }),
    );
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await measureCustomerProjectDetailStep(
      steps,
      "project_detail_ms",
      () => this.getOwnedProject(
        idVerify.data.id,
        customer!.id,
        customer!.tenant_id,
      ),
    );

    const payload = await measureCustomerProjectDetailStep(
      steps,
      "construction_stages_ms",
      () => constructionStageStatusService.listProjectConstructionStagesForProject({
        projectId: project.id,
        tenantId: project.tenant_id,
      }),
    );
    logCustomerProjectDetailTiming(request, {
      route: "GET /customer/projects/:id/construction-stages",
      startedAt,
      tenantId: customer?.tenant_id ?? null,
      customerId: customer?.id ?? null,
      projectId: project.id,
      steps,
    });
    return ResponseHandler.success(payload);
  }

  @Get("/customer/projects/:id/logs")
  async getCustomerProjectLogs(request: FastifyRequest) {
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const customer = await measureCustomerProjectDetailStep(
      steps,
      "customer_context_ms",
      () => this.getCustomerProfileFromRequest(request, {
        required: true,
      }),
    );
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const queryResult = CustomerProjectLogListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const projectAccess = await measureCustomerProjectDetailStep(
      steps,
      "project_access_ms",
      () => customerProjectDetailService.getOwnedProjectAccess({
        projectId: idVerify.data.id,
        customerId: customer!.id,
        tenantId: customer!.tenant_id!,
      }),
    );
    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const projectTenantId = projectAccess.tenant_id ?? null;

    const payload = projectTenantId && page === 1
      ? await this.buildCustomerProjectLogsRpcPayload({
        customerId: customer!.id,
        pageSize,
        projectId: idVerify.data.id,
        tenantId: projectTenantId,
        steps,
      })
      : await this.buildCustomerProjectLogsLegacyPayload({
        customerId: customer!.id,
        page,
        pageSize,
        projectId: idVerify.data.id,
        projectTenantId,
        from,
        to,
        steps,
      });
    logCustomerProjectDetailTiming(request, {
      route: "GET /customer/projects/:id/logs",
      startedAt,
      tenantId: customer?.tenant_id ?? null,
      customerId: customer?.id ?? null,
      projectId: projectAccess.id,
      query: {
        page,
        pageSize,
        imageMode: queryResult.data.imageMode,
      },
      steps,
    });
    return ResponseHandler.success(this.withDebugTiming(
      payload,
      queryResult.data.debug_timing,
      { auth_steps: this.getAuthTimingSteps(request), steps },
    ));
  }

  private async buildCustomerProjectLogsRpcPayload(input: {
    customerId: string;
    pageSize: number;
    projectId: string;
    tenantId: string;
    steps: ReturnType<typeof createCustomerProjectDetailTimingSteps>;
  }) {
    const logs = await measureCustomerProjectDetailStep(
      input.steps,
      "logs_ms",
      () => customerProjectDetailLogsService.listLogs({
        projectId: input.projectId,
        tenantId: input.tenantId,
        customerId: input.customerId,
        pageSize: input.pageSize,
      }),
    );

    return measureCustomerProjectDetailStep(input.steps, "serialize_ms", async () => ({
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
    }));
  }

  private async buildCustomerProjectLogsLegacyPayload(input: {
    customerId: string;
    page: number;
    pageSize: number;
    projectId: string;
    projectTenantId: string | null;
    from: number;
    to: number;
    steps: ReturnType<typeof createCustomerProjectDetailTimingSteps>;
  }) {
    const { list: logs, count } = await measureCustomerProjectDetailStep(
      input.steps,
      "logs_ms",
      () => customerSelfServiceService.listProjectLogs({
        projectId: input.projectId,
        tenantId: input.projectTenantId,
        from: input.from,
        to: input.to,
        includeCount: false,
      }),
    );
    const aggregateRows = await measureCustomerProjectDetailStep(
      input.steps,
      "logs_ms",
      () => customerSelfServiceService.listProjectLogCommentAggregates({
        logIds: logs.map((item) => item.id),
        tenantId: input.projectTenantId,
      }),
    );
    const aggregateMap = this.buildProjectLogAggregates(aggregateRows, input.customerId);

    return measureCustomerProjectDetailStep(input.steps, "serialize_ms", async () => ({
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
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    }));
  }

  @Get("/customer/projects/:id/logs/:logId/comments")
  async getCustomerProjectLogComments(request: FastifyRequest) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const paramsResult = CustomerProjectLogCommentParamSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = CustomerProjectLogCommentListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const project = await this.getOwnedProject(
      paramsResult.data.id,
      customer!.id,
      customer!.tenant_id,
    );
    await this.getOwnedProjectLog(
      paramsResult.data.logId,
      paramsResult.data.id,
      project.tenant_id,
    );

    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { list, count } = await customerSelfServiceService.listProjectLogComments({
      logId: paramsResult.data.logId,
      tenantId: project.tenant_id ?? null,
      from,
      to,
    });

    return ResponseHandler.success({
      list: await this.attachCustomerProjectLogCommentAuthors(list),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }
}

export default new CustomerProjectsController();
