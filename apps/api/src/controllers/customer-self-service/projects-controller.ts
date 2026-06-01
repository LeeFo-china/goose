import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { customerSelfServiceService } from "@/services/customer-self-service";
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
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const queryResult = CustomerProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, include } = queryResult.data;
    return ResponseHandler.success(
      await this.buildCustomerProjectsPayload({
        customer: customer!,
        page,
        pageSize,
        include,
        request,
      }),
    );
  }

  @Get("/customer/projects/:id")
  async getCustomerProjectById(request: FastifyRequest) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    return ResponseHandler.success(
      await this.serializeCustomerProjectDetailItem(
        await this.getOwnedProject(idVerify.data.id, customer!.id, customer!.tenant_id),
      ),
    );
  }

  @Get("/customer/projects/:id/construction-stages")
  async listCustomerProjectConstructionStages(request: FastifyRequest) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const project = await this.getOwnedProject(
      idVerify.data.id,
      customer!.id,
      customer!.tenant_id,
    );

    return ResponseHandler.success(
      await constructionStageStatusService.listProjectConstructionStagesForProject({
        projectId: project.id,
        tenantId: project.tenant_id,
      }),
    );
  }

  @Get("/customer/projects/:id/logs")
  async getCustomerProjectLogs(request: FastifyRequest) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const queryResult = CustomerProjectLogListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const project = await this.getOwnedProject(
      idVerify.data.id,
      customer!.id,
      customer!.tenant_id,
    );
    const { page, pageSize } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const projectTenantId = project.tenant_id ?? null;

    const { list: logs, count } = await customerSelfServiceService.listProjectLogs({
      projectId: idVerify.data.id,
      tenantId: projectTenantId,
      from,
      to,
    });
    const logIds = logs.map((item) => item.id);
    const aggregateMap = this.buildProjectLogAggregates(
      await customerSelfServiceService.listProjectLogCommentAggregates({
        logIds,
        tenantId: projectTenantId,
      }),
      customer!.id,
    );

    return ResponseHandler.success({
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
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
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
