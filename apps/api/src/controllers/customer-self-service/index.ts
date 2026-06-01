import type { FastifyInstance, FastifyRequest } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { AuthMeProfileUpdateSchema } from "@/schema/user-profile";
import { customerServiceTicketService } from "@/services/customer-service-tickets";
import { customerSelfServiceService } from "@/services/customer-self-service";
import { Get, Patch } from "@/utils/decorators/route";
import { registerRoutes } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import customerProjectsController from "./projects-controller";
import { CustomerSelfServiceProjectBaseController } from "./project-base";
import {
  CustomerBootstrapQuerySchema,
} from "./shared";
import customerTicketsAcceptancesController from "./tickets-acceptances-controller";

class CustomerSelfServiceController extends CustomerSelfServiceProjectBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    customerProjectsController.registerExtraRoutes(fastify);
    customerTicketsAcceptancesController.registerExtraRoutes(fastify);
    registerRoutes(fastify, this);
  };

  @Get("/auth/me/customer-context")
  async getCustomerContext(request: FastifyRequest) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileByAuthUserId(authUserId, {
      tenantId: request.user?.tenant_id ?? null,
      customerId: request.user?.customer_id ?? null,
    });
    if (!customer && (request.user?.customer_id || request.user?.tenant_id)) {
      throw Errors.business(
        403,
        "当前客户身份已失效，请重新登录",
        ErrorCodes.CUSTOMER_CONTEXT_MISSING,
      );
    }
    this.assertCustomerTenantAvailable(customer);
    const userProfile = await this.getUserProfileByAuthUserId(authUserId);

    return ResponseHandler.success(
      this.serializeCustomerContext(authUserId, customer, userProfile),
    );
  }

  @Get("/auth/me/profile")
  async getAuthMeProfile(request: FastifyRequest) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const userProfile = await this.getUserProfileByAuthUserId(authUserId);
    const roles = Array.isArray(request.user?.roles)
      ? request.user.roles.filter((item): item is string => typeof item === "string")
      : [];

    return ResponseHandler.success(
      this.serializeAuthProfile(authUserId, userProfile, roles),
    );
  }

  @Patch("/auth/me/profile")
  async patchAuthMeProfile(request: FastifyRequest) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const verify = AuthMeProfileUpdateSchema.safeParse(request.body);
    if (!verify.success) {
      throw Errors.fromZod(verify.error);
    }

    const userProfile = await customerSelfServiceService.saveAuthUserProfile(
      authUserId,
      verify.data,
    );
    const roles = Array.isArray(request.user?.roles)
      ? request.user.roles.filter((item): item is string => typeof item === "string")
      : [];

    return ResponseHandler.success(
      this.serializeAuthProfile(authUserId, userProfile, roles),
    );
  }

  @Get("/customer/profile")
  async getCustomerProfile(request: FastifyRequest) {
    const authUserId = await this.getRequiredAuthUserId(request);
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    const userProfile = await this.getUserProfileByAuthUserId(authUserId);

    return ResponseHandler.success(
      this.serializeCustomerProfile(customer!, userProfile),
    );
  }

  @Get("/customer/bootstrap")
  async getCustomerBootstrap(request: FastifyRequest) {
    const startedAt = Date.now();
    const authUserId = await this.getRequiredAuthUserId(request);
    const customerStartedAt = Date.now();
    const customer = await this.getCustomerProfileFromRequest(request, {
      required: true,
    });
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - customerStartedAt,
        authUserId,
        customerId: customer?.id ?? null,
        tenantId: customer?.tenant_id ?? null,
      },
      "[customer-bootstrap] customer context loaded",
    );
    const queryResult = CustomerBootstrapQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, include, projects_mode: projectsMode } = queryResult.data;
    const userProfileStartedAt = Date.now();
    const cachedUserProfile = customerSelfServiceService
      .getCachedUserProfileByAuthUserId(authUserId);
    if (!cachedUserProfile) {
      void this.getUserProfileByAuthUserId(authUserId);
    }
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - userProfileStartedAt,
        authUserId,
        hasUserProfile: Boolean(cachedUserProfile),
        source: cachedUserProfile ? "cache" : "background",
      },
      "[customer-bootstrap] user profile loaded",
    );
    const projects = projectsMode === "inline"
      ? await this.buildCustomerProjectsPayload({
        customer: customer!,
        page,
        pageSize,
        include,
        request,
      })
      : null;
    if (projectsMode === "defer") {
      void customerSelfServiceService.prewarmCustomerHomeProjects({
        customerId: customer!.id,
        tenantId: customer!.tenant_id!,
        pageSize,
      });
      request.log.info(
        {
          requestId: request.id,
          durationMs: 0,
          customerId: customer!.id,
          tenantId: customer!.tenant_id,
          page,
          pageSize,
          source: "defer",
        },
        "[customer-bootstrap] owned projects deferred",
      );
    }

    const response = {
      context: this.serializeCustomerContext(authUserId, customer!, cachedUserProfile),
      customer_service: await customerServiceTicketService.getCustomerServiceConfig(
        customer!.tenant_id,
      ),
      projects,
      projects_mode: projectsMode,
    };
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - startedAt,
        authUserId,
        customerId: customer?.id ?? null,
        projectCount: projects?.list.length ?? 0,
        projectsMode,
      },
      "[customer-bootstrap] bootstrap resolved",
    );
    return ResponseHandler.success(response);
  }
}

export default new CustomerSelfServiceController();
