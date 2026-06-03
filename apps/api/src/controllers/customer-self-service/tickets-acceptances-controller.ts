import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerServiceTicketSchema,
  CustomerServiceTicketListQuerySchema,
  CustomerServiceTicketParamsSchema,
} from "@/schema/customer-service";
import {
  CustomerProjectAcceptanceOpenTicketQuerySchema,
  VerifyProjectAcceptanceOpenTicketSchema,
} from "@/schema/project-acceptances";
import { customerServiceTicketService } from "@/services/customer-service-tickets";
import { projectAcceptanceService } from "@/services/project-acceptances";
import {
  createCustomerProjectDetailTimingSteps,
  logCustomerProjectDetailTiming,
  measureCustomerProjectDetailStep,
} from "@/utils/customer-project-detail-timing";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { CustomerSelfServiceBaseController } from "./shared";
import { CustomerProjectAcceptanceListQuerySchema } from "./ticket-schemas";

class CustomerTicketsAcceptancesController extends CustomerSelfServiceBaseController {
  @Get("/customer/service-tickets")
  async listCustomerServiceTickets(request: FastifyRequest) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const queryResult = CustomerServiceTicketListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await customerServiceTicketService.listCustomerTickets({
        customer: customer!,
        query: queryResult.data,
      }),
    );
  }

  @Post("/customer/service-tickets")
  async createCustomerServiceTicket(request: FastifyRequest) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const bodyResult = CreateCustomerServiceTicketSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await customerServiceTicketService.createCustomerTicket({
        authUserId,
        customer: customer!,
        payload: bodyResult.data,
      }),
    );
  }

  @Get("/customer/service-tickets/:id")
  async getCustomerServiceTicket(request: FastifyRequest) {
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const params = CustomerServiceTicketParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);

    return ResponseHandler.success(
      await customerServiceTicketService.getCustomerTicketDetail({
        customer: customer!,
        ticketId: params.data.id,
      }),
    );
  }

  @Get("/customer/project-acceptances")
  async listCustomerProjectAcceptances(request: FastifyRequest) {
    const startedAt = Date.now();
    const steps = createCustomerProjectDetailTimingSteps();
    const acceptanceSteps: Record<string, number> = {};
    const authUserId = await measureCustomerProjectDetailStep(
      steps,
      "auth_context_ms",
      () => this.getRequiredAuthUserId(request),
    );
    const queryResult = CustomerProjectAcceptanceListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const payload = await measureCustomerProjectDetailStep(
      steps,
      "acceptances_ms",
      () => projectAcceptanceService.listCustomerAcceptances(
        authUserId,
        queryResult.data,
        {
          tenantId: request.user?.tenant_id ?? null,
          customerId: request.user?.customer_id ?? null,
        },
        { responseMode: "summary", timing: acceptanceSteps },
      ),
    );
    logCustomerProjectDetailTiming(request, {
      route: "GET /customer/project-acceptances",
      startedAt,
      tenantId: request.user?.tenant_id ?? null,
      customerId: request.user?.customer_id ?? null,
      projectId: queryResult.data.project_id ?? null,
      query: {
        project_id: queryResult.data.project_id ?? null,
        page: queryResult.data.page,
        pageSize: queryResult.data.pageSize,
      },
      extra: { acceptance_steps: acceptanceSteps },
      steps,
    });
    return ResponseHandler.success(this.withDebugTiming(
      payload,
      queryResult.data.debug_timing,
      {
        auth_steps: this.getAuthTimingSteps(request),
        steps,
        acceptance_steps: acceptanceSteps,
      },
    ));
  }

  @Post("/customer/project-acceptances/open-ticket/verify")
  async verifyProjectAcceptanceOpenTicket(request: FastifyRequest) {
    const result = VerifyProjectAcceptanceOpenTicketSchema.safeParse(
      request.body,
    );
    if (!result.success) throw Errors.fromZod(result.error);

    return ResponseHandler.success(
      await projectAcceptanceService.verifyOpenTicket(result.data),
    );
  }

  @Get("/customer/project-acceptances/:id")
  async getCustomerProjectAcceptanceById(request: FastifyRequest) {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const queryResult = CustomerProjectAcceptanceOpenTicketQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await projectAcceptanceService.getCustomerAcceptanceByAuthOrTicket({
        authUserId: request.user?.sub,
        tenantId: request.user?.tenant_id ?? null,
        customerId: request.user?.customer_id ?? null,
        id: idVerify.data.id,
        ticketQuery: queryResult.data,
      }),
    );
  }
}

export default new CustomerTicketsAcceptancesController();
