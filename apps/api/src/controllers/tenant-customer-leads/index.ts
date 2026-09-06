import type { FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { CustomerLeadListQuerySchema, CustomerLeadPageQuerySchema,
  CustomerLeadAssigneeCandidatesQuerySchema, CustomerLeadAssigneeFilterOptionsQuerySchema,
  CustomerLeadParamsSchema, CustomerLeadEmptyQuerySchema, CustomerLeadAssignSchema,
  CustomerLeadFollowUpSchema, CustomerLeadConvertSchema, CustomerLeadMarkInvalidSchema } from
  "@/schema/tenant-customer-leads";
import { tenantCustomerLeadsService, type TenantCustomerLeadsService } from "@/services/tenant-customer-leads";
import { parseRequest } from "@/services/tenant-douyin-leads-service-helpers";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

type ServicePort = Pick<TenantCustomerLeadsService, "list" | "getDetail" | "listAppointments"
  | "listFollowUps" | "listAssigneeCandidates" | "listAssigneeFilterOptions"
  | "assign" | "appendFollowUp" | "convert" | "markInvalid">;

export class TenantCustomerLeadsController extends TenantBaseController {
  constructor(private readonly service: ServicePort = tenantCustomerLeadsService) {
    super("tenant-customer-leads");
  }

  @Get("/tenant/customer-leads")
  async listLeads(request: FastifyRequest) {
    const query = parseRequest(CustomerLeadListQuerySchema, request.query || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.list(auth, query));
  }

  @Get("/tenant/customer-leads/assignee-candidates")
  async listAssigneeCandidates(request: FastifyRequest) {
    const query = parseRequest(CustomerLeadAssigneeCandidatesQuerySchema, request.query || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.listAssigneeCandidates(auth, query));
  }

  @Get("/tenant/customer-leads/assignee-filter-options")
  async listAssigneeFilterOptions(request: FastifyRequest) {
    const query = parseRequest(CustomerLeadAssigneeFilterOptionsQuerySchema, request.query || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.listAssigneeFilterOptions(auth, query));
  }

  @Get("/tenant/customer-leads/:id")
  async getDetail(request: FastifyRequest) {
    const { id } = parseRequest(CustomerLeadParamsSchema, request.params || {});
    parseRequest(CustomerLeadEmptyQuerySchema, request.query || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.getDetail(auth, id));
  }

  @Get("/tenant/customer-leads/:id/appointments")
  async listAppointments(request: FastifyRequest) {
    const { id } = parseRequest(CustomerLeadParamsSchema, request.params || {});
    const query = parseRequest(CustomerLeadPageQuerySchema, request.query || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.listAppointments(auth, id, query));
  }

  @Get("/tenant/customer-leads/:id/follow-ups")
  async listFollowUps(request: FastifyRequest) {
    const { id } = parseRequest(CustomerLeadParamsSchema, request.params || {});
    const query = parseRequest(CustomerLeadPageQuerySchema, request.query || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.listFollowUps(auth, id, query));
  }

  @Post("/tenant/customer-leads/:id/assign")
  async assign(request: FastifyRequest) {
    const { id } = parseRequest(CustomerLeadParamsSchema, request.params || {});
    const body = parseRequest(CustomerLeadAssignSchema, request.body || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.assign(auth, id, body));
  }

  @Post("/tenant/customer-leads/:id/follow-ups")
  async appendFollowUp(request: FastifyRequest) {
    const { id } = parseRequest(CustomerLeadParamsSchema, request.params || {});
    const body = parseRequest(CustomerLeadFollowUpSchema, request.body || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.appendFollowUp(auth, id, body));
  }

  @Post("/tenant/customer-leads/:id/convert-customer")
  async convert(request: FastifyRequest) {
    const { id } = parseRequest(CustomerLeadParamsSchema, request.params || {});
    const body = parseRequest(CustomerLeadConvertSchema, request.body || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.convert(auth, id, body));
  }

  @Post("/tenant/customer-leads/:id/mark-invalid")
  async markInvalid(request: FastifyRequest) {
    const { id } = parseRequest(CustomerLeadParamsSchema, request.params || {});
    const body = parseRequest(CustomerLeadMarkInvalidSchema, request.body || {});
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.service.markInvalid(auth, id, body));
  }
}

export default new TenantCustomerLeadsController();
