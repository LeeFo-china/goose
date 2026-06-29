import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  AdjustFinanceReceivableDueDateSchema,
  CancelFinanceReceivableSchema,
  CreateFinanceReceivableAllocationSchema,
  CreateFinanceReceivableFollowUpSchema,
  CreateFinanceReceivableSchema,
  FinanceReceivableEventListQuerySchema,
  FinanceReceivableListQuerySchema,
  ReverseFinanceReceivableAllocationSchema,
  UpdateFinanceReceivableAllocationSchema,
  UpdateFinanceReceivableSchema,
} from "@/schema/finance-receivables";
import { projectReceivablesService } from "@/services/project-receivables";
import {
  projectReceivableAllocationsService,
} from "@/services/project-receivable-allocations";
import {
  projectReceivableOperationsService,
} from "@/services/project-receivables-operations";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const AllocationIdParamSchema = z.object({
  allocationId: z.uuid("无效的核销记录 ID"),
});

class FinanceReceivablesController extends TenantBaseController {
  constructor() {
    super("finance_receivables");
  }

  @Get("/finance/receivables")
  async listReceivables(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceReceivableListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await projectReceivablesService.listReceivables(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables")
  async createReceivable(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = CreateFinanceReceivableSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService
      .createManualReceivable(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/finance/receivables/:id")
  async updateReceivable(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = UpdateFinanceReceivableSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService.updateReceivable(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/finance/receivables/:id/due-date")
  async adjustReceivableDueDate(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = AdjustFinanceReceivableDueDateSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService.adjustDueDate(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/cancel")
  async cancelReceivable(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CancelFinanceReceivableSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService.cancelReceivable(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/follow-ups")
  async createReceivableFollowUp(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CreateFinanceReceivableFollowUpSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableOperationsService.createFollowUp(
      authContext,
      idVerify.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/finance/receivables/:id/allocation-context")
  async getReceivableAllocationContext(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await projectReceivableAllocationsService.getAllocationContext(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/allocations")
  async createReceivableAllocation(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CreateFinanceReceivableAllocationSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableAllocationsService
      .createManualAllocation(authContext, idVerify.data.id, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/finance/receivables/:id/allocations/:allocationId")
  async updateReceivableAllocation(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const allocationIdResult = AllocationIdParamSchema.safeParse(request.params);
    if (!allocationIdResult.success) {
      throw Errors.fromZod(allocationIdResult.error);
    }

    const bodyResult = UpdateFinanceReceivableAllocationSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableAllocationsService
      .adjustManualAllocation(
        authContext,
        idVerify.data.id,
        allocationIdResult.data.allocationId,
        bodyResult.data,
      );
    return ResponseHandler.success(data);
  }

  @Post("/finance/receivables/:id/allocations/:allocationId/reverse")
  async reverseReceivableAllocation(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const allocationIdResult = AllocationIdParamSchema.safeParse(request.params);
    if (!allocationIdResult.success) {
      throw Errors.fromZod(allocationIdResult.error);
    }

    const bodyResult = ReverseFinanceReceivableAllocationSchema.safeParse(
      request.body,
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await projectReceivableAllocationsService
      .reverseManualAllocation(
        authContext,
        idVerify.data.id,
        allocationIdResult.data.allocationId,
        bodyResult.data,
      );
    return ResponseHandler.success(data);
  }

  @Get("/finance/receivables/:id/events")
  async listReceivableEvents(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = FinanceReceivableEventListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await projectReceivableOperationsService.listEvents(
      authContext,
      idVerify.data.id,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new FinanceReceivablesController();
