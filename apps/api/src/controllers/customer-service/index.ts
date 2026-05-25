import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  AssignCustomerServiceTicketSchema,
  CustomerServiceTicketActionSchema,
  CustomerServiceTicketListQuerySchema,
  CustomerServiceTicketParamsSchema,
} from "@/schema/customer-service";
import { customerServiceTicketService } from "@/services/customer-service-tickets";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class CustomerServiceController extends TenantBaseController {
  constructor() {
    super("customer_service");
  }

  @Get("/customer-service-tickets")
  async listTickets(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = CustomerServiceTicketListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await customerServiceTicketService.listTickets(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/customer-service-tickets/:id")
  async getTicket(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const params = CustomerServiceTicketParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);

    const data = await customerServiceTicketService.getTicket(
      authContext,
      params.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/customer-service-tickets/:id/assign")
  async assignTicket(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const params = CustomerServiceTicketParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const body = AssignCustomerServiceTicketSchema.safeParse(request.body || {});
    if (!body.success) throw Errors.fromZod(body.error);

    const data = await customerServiceTicketService.assignTicket(
      authContext,
      params.data.id,
      body.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/customer-service-tickets/:id/action")
  async executeAction(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const params = CustomerServiceTicketParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const body = CustomerServiceTicketActionSchema.safeParse(request.body || {});
    if (!body.success) throw Errors.fromZod(body.error);

    const data = await customerServiceTicketService.executeAction(
      authContext,
      params.data.id,
      body.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new CustomerServiceController();
