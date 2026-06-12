import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import {
  BatchAssignCustomerOwnerSchema,
  type FollowUpInsert,
} from "@/schema/customer";
import {
  CustomerSourceListQuerySchema,
  CustomerSourceParamsSchema,
} from "@/schema/customer-sources";
import { PaginationQuerySchema } from "@/schema/request";
import { accessPolicyService } from "@/services/access-policy";
import { customerCoreService } from "@/services/customer-core";
import { customerFollowUpService } from "@/services/customer-follow-ups";
import { customerOwnerAssignmentService } from "@/services/customer-owner-assignments";
import {
  customerPhonePrivacyService,
  type CustomerPhoneAction,
} from "@/services/customer-phone-privacy";
import { customerSourceService } from "@/services/customer-sources";
import { Delete, Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import {
  CustomerBaseController,
  CustomerDetailQuerySchema,
  CustomerPhoneActionBodySchema,
} from "./shared";

class CustomerExtrasController extends CustomerBaseController {
  @Delete("/customers/:id")
  async deleteCustomer(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const customer = await customerCoreService.invalidateCustomer({
      authContext,
      customerId: idVerify.data.id,
    });
    return ResponseHandler.success(
      this.serializeCustomer(
        customer,
        await customerPhonePrivacyService.createPrivacyContext(authContext),
      ),
    );
  }

  @Post("/customers/assign-owner/batch")
  async batchAssignOwner(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = BatchAssignCustomerOwnerSchema.safeParse(request.body);
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    return ResponseHandler.success(
      await customerOwnerAssignmentService.batchAssignOwner({
        authContext,
        payload: result.data,
      }),
    );
  }

  @Get("/customers/:id/detail")
  async getCustomerById(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);
    const queryResult = CustomerDetailQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const includeActivity = ["1", "true", "yes"].includes(
      queryResult.data.include_activity?.toLowerCase() ?? "",
    );

    const customer = await customerCoreService.getCustomerDetail({
      authContext,
      customerId: idVerify.data.id,
      notFoundAs: "not_found",
    });

    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );
    const detail = await this.buildCustomerDetailResponse(
      customer,
      {
        includeProperties: true,
        phonePrivacyContext,
        tenantId: authContext.tenantId,
      },
    );

    if (!includeActivity) {
      return ResponseHandler.success(detail);
    }

    const [followUps, sources] = await Promise.all([
      customerFollowUpService.listAccessibleCustomerFollowUps({
        authContext,
        customer: {
          id: customer.id,
          owner_id: customer.owner_id,
          tenant_id: authContext.tenantId,
        },
        page: 1,
        pageSize: 10,
      }),
      customerSourceService.listAccessibleCustomerSources({
        tenantId: authContext.tenantId,
        customerId: customer.id,
        query: {
          page: 1,
          pageSize: 20,
        },
      }),
    ]);

    return ResponseHandler.success({
      ...detail,
      detail_activity: {
        follow_ups: followUps,
        sources,
      },
    });
  }

  private async handleCustomerPhoneAction(
    request: FastifyRequest<{ Params: { id: string } }>,
    action: CustomerPhoneAction,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const bodyResult = CustomerPhoneActionBodySchema.safeParse(request.body ?? {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await customerPhonePrivacyService.handlePhoneAction({
      action,
      authContext,
      customerId: idVerify.data.id,
      scene: bodyResult.data.scene,
      reason: bodyResult.data.reason,
      request,
    });

    return ResponseHandler.success(data);
  }

  @Post("/customers/:id/phone/reveal")
  async revealCustomerPhone(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return this.handleCustomerPhoneAction(request, "reveal");
  }

  @Post("/customers/:id/phone/call")
  async callCustomerPhone(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return this.handleCustomerPhoneAction(request, "call");
  }

  @Post("/customers/:id/phone/copy")
  async copyCustomerPhone(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return this.handleCustomerPhoneAction(request, "copy");
  }

  @Get("/customers/:id/sources")
  async listCustomerSources(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = CustomerSourceParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = CustomerSourceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await customerSourceService.listCustomerSources({
      authContext,
      customerId: paramsResult.data.id,
      query: queryResult.data,
    });

    return ResponseHandler.success(data);
  }

  @Get("/customers/:id/follow_ups")
  async getCustomerFollowUpById(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; pageSize?: string } }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = PaginationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    return ResponseHandler.success(
      await customerFollowUpService.listCustomerFollowUps({
        authContext,
        customerId: idVerify.data.id,
        page: queryResult.data.page,
        pageSize: queryResult.data.pageSize,
      }),
    );
  }

  @Post("/customers/:id/follow_ups")
  async createCustomerFollowUpById(
    request: FastifyRequest<{
      Params: { id: string };
      Body: FollowUpInsert;
    }>,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    return ResponseHandler.success(
      await customerFollowUpService.createCustomerFollowUp({
        authContext,
        customerId: idVerify.data.id,
        payload: request.body,
      }),
    );
  }
}

export default new CustomerExtrasController();
