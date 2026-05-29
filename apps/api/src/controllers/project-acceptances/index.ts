import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ApproveProjectAcceptanceSchema,
  CancelProjectAcceptanceSchema,
  CreateProjectAcceptanceSchema,
  CustomerConfirmProjectAcceptanceSchema,
  CustomerDisputeProjectAcceptanceSchema,
  ProjectAcceptanceCreateQuerySchema,
  NotifyProjectAcceptanceCustomerSchema,
  ProjectAcceptanceListQuerySchema,
  ProjectAcceptanceTemplateListQuerySchema,
  RejectProjectAcceptanceSchema,
  RectifyProjectAcceptanceSchema,
  SubmitProjectAcceptanceSchema,
  UpdateProjectAcceptanceSchema,
} from "@/schema/project-acceptances";
import { projectAcceptanceService } from "@/services/project-acceptances";
import { Delete, Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class ProjectAcceptancesController extends TenantBaseController<
  typeof CreateProjectAcceptanceSchema,
  typeof UpdateProjectAcceptanceSchema
> {
  constructor() {
    super(
      "project_acceptances",
      CreateProjectAcceptanceSchema,
      UpdateProjectAcceptanceSchema,
    );
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const result = ProjectAcceptanceListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.listAcceptances(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectAcceptanceService.getAcceptance(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = ProjectAcceptanceCreateQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = CreateProjectAcceptanceSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.createAcceptance(
      authContext,
      result.data,
      {
        response: queryResult.data.response,
      },
    );
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = UpdateProjectAcceptanceSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.updateAcceptance(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  @Delete("/project-acceptances/:id")
  async deleteDraft(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectAcceptanceService.deleteDraftAcceptance(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Get("/project-acceptance-templates")
  async listTemplates(request: FastifyRequest, reply: FastifyReply) {
    await this.getRequiredTenantContext(request);
    const result = ProjectAcceptanceTemplateListQuerySchema.safeParse(
      request.query,
    );
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.listTemplates(result.data);
    return ResponseHandler.success(data);
  }

  @Get("/project-acceptance-templates/:id")
  async getTemplate(request: FastifyRequest, reply: FastifyReply) {
    await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectAcceptanceService.getTemplate(idVerify.data.id);
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/submit")
  async submit(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = SubmitProjectAcceptanceSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.submitAcceptance(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/approve")
  async approve(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = ApproveProjectAcceptanceSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.approveAcceptance(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/notify-customer")
  async notifyCustomer(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = NotifyProjectAcceptanceCustomerSchema.safeParse(
      request.body ?? {},
    );
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.notifyCustomerForAcceptance(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/reject")
  async reject(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = RejectProjectAcceptanceSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.rejectAcceptance(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/customer-confirm")
  async customerConfirm(request: FastifyRequest, reply: FastifyReply) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = CustomerConfirmProjectAcceptanceSchema.safeParse(
      request.body,
    );
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.customerConfirmAcceptance(
      request.user?.sub,
      idVerify.data.id,
      result.data,
      {
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
      },
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/customer-dispute")
  async customerDispute(request: FastifyRequest, reply: FastifyReply) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = CustomerDisputeProjectAcceptanceSchema.safeParse(
      request.body,
    );
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.customerDisputeAcceptance(
      request.user?.sub,
      idVerify.data.id,
      result.data,
      {
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
      },
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/rectification")
  async rectify(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = RectifyProjectAcceptanceSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.rectifyAcceptance(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/project-acceptances/:id/cancel")
  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const result = CancelProjectAcceptanceSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectAcceptanceService.cancelAcceptance(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new ProjectAcceptancesController();
