import type { FastifyInstance, FastifyRequest } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { AuthMeProfileUpdateSchema } from "@/schema/user-profile";
import { customerServiceTicketService } from "@/services/customer-service-tickets";
import { customerSelfServiceService } from "@/services/customer-self-service";
import type { CustomerHomeProjectListItem } from "@/services/customer-home-projects";
import {
  createCustomerProjectDetailTimingSteps,
  logCustomerProjectDetailTiming,
  measureCustomerProjectDetailStep,
} from "@/utils/customer-project-detail-timing";
import { Get, Patch } from "@/utils/decorators/route";
import { registerRoutes } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import customerProjectDetailBootstrapController from "./detail-bootstrap-controller";
import customerProjectsController from "./projects-controller";
import { CustomerSelfServiceProjectBaseController } from "./project-base";
import {
  CustomerBootstrapQuerySchema,
} from "./shared";
import customerTicketsAcceptancesController from "./tickets-acceptances-controller";

class CustomerSelfServiceController extends CustomerSelfServiceProjectBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    customerProjectsController.registerExtraRoutes(fastify);
    customerProjectDetailBootstrapController.registerExtraRoutes(fastify);
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
    const steps = createCustomerProjectDetailTimingSteps();
    const authUserId = await measureCustomerProjectDetailStep(
      steps,
      "auth_context_ms",
      () => this.getRequiredAuthUserId(request),
    );
    const customerStartedAt = Date.now();
    const customer = await measureCustomerProjectDetailStep(
      steps,
      "customer_context_ms",
      () => this.getCustomerProfileFromRequest(request, {
        required: true,
      }),
    );
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
    const queryResult = await measureCustomerProjectDetailStep(
      steps,
      "query_parse_ms",
      () => CustomerBootstrapQuerySchema.safeParse(request.query),
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, include, projects_mode: projectsMode } = queryResult.data;
    const userProfileStartedAt = Date.now();
    const preloadedUserProfile = this.getPreloadedUserProfile(request);
    const cachedUserProfile = await measureCustomerProjectDetailStep(
      steps,
      "user_profile_ms",
      async () => preloadedUserProfile !== undefined
        ? preloadedUserProfile
        : customerSelfServiceService.getCachedUserProfileByAuthUserId(authUserId),
    );
    if (!cachedUserProfile && preloadedUserProfile === undefined) {
      void this.getUserProfileByAuthUserId(authUserId);
    }
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - userProfileStartedAt,
        authUserId,
        hasUserProfile: Boolean(cachedUserProfile),
        source: preloadedUserProfile !== undefined
          ? "preload"
          : cachedUserProfile ? "cache" : "background",
      },
      "[customer-bootstrap] user profile loaded",
    );
    const projectsPromise = projectsMode === "inline"
      ? this.buildCustomerBootstrapProjectsPayload({
        customer: customer!,
        page,
        pageSize,
        include,
        includeDesigner: false,
        includeCount: false,
        recentLogsTimeoutMs: 50,
        request,
        timingSteps: steps,
      })
      : Promise.resolve(null);
    const customerServiceConfigPromise = Promise.race([
      measureCustomerProjectDetailStep(
        steps,
        "customer_service_ms",
      () => customerServiceTicketService.getCustomerServiceConfig(
        customer!.tenant_id,
      ),
    ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
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

    const [projects, customerServiceConfig] = await Promise.all([
      projectsPromise,
      customerServiceConfigPromise,
    ]);
    const response = await measureCustomerProjectDetailStep(
      steps,
      "serialize_ms",
      async () => ({
        context: this.serializeCustomerContext(
          authUserId,
          customer!,
          cachedUserProfile,
        ),
        customer_service: customerServiceConfig,
        projects,
        projects_mode: projectsMode,
      }),
    );
    logCustomerProjectDetailTiming(request, {
      route: "GET /customer/bootstrap",
      startedAt,
      tenantId: customer?.tenant_id ?? null,
      customerId: customer?.id ?? null,
      query: {
        include,
        projects_mode: projectsMode,
        page,
        pageSize,
      },
      steps,
    });
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
    return ResponseHandler.success(this.withDebugTiming(
      response,
      queryResult.data.debug_timing,
      { auth_steps: this.getAuthTimingSteps(request), steps },
    ));
  }

  private getPreloadedCustomerHomeProjects(
    request: FastifyRequest,
    page: number,
    pageSize: number,
  ) {
    const preloaded = (request as FastifyRequest & {
      preloadedCustomerHomeProjects?: {
        page?: unknown;
        pageSize?: unknown;
        list?: unknown;
      };
    }).preloadedCustomerHomeProjects;
    if (
      preloaded?.page !== page ||
      preloaded.pageSize !== pageSize ||
      !Array.isArray(preloaded.list)
    ) {
      return null;
    }

    return preloaded.list as CustomerHomeProjectListItem[];
  }

  private async buildCustomerBootstrapProjectsPayload(input: {
    customer: NonNullable<Awaited<ReturnType<
      CustomerSelfServiceController["getCustomerProfileFromRequest"]
    >>>;
    page: number;
    pageSize: number;
    include: "home_summary";
    includeDesigner: false;
    includeCount: false;
    recentLogsTimeoutMs: number;
    request: FastifyRequest;
    timingSteps: ReturnType<typeof createCustomerProjectDetailTimingSteps>;
  }) {
    const preloaded = this.getPreloadedCustomerHomeProjects(
      input.request,
      input.page,
      input.pageSize,
    );
    if (!preloaded) return this.buildCustomerProjectsPayload(input);

    return measureCustomerProjectDetailStep(input.timingSteps, "projects_ms", async () => ({
      list: preloaded.map((row) => ({
        ...this.serializeCustomerProjectListItem(row),
        recent_logs: Array.isArray(row.recent_logs)
          ? row.recent_logs.map((log) => this.serializeCustomerProjectRecentLog(log))
          : [],
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: 0,
        totalPages: 0,
      },
    }));
  }
}

export default new CustomerSelfServiceController();
