import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerCoreService } from "@/services/customer-core";
import { customerSelfServiceService } from "@/services/customer-self-service";
import {
  employeePersonalizationService,
  type EmployeePersonalizationPayload,
} from "@/services/employee-personalization";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import { homeDashboardService } from "@/services/home-dashboard";
import { projectSer } from "@/services/projects";
import { taskCenterService } from "@/services/task-center";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";

function optionalEmployeeQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

const EmployeeBootstrapQuerySchema = z.object({
  home_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
  tasks_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
});

const EmployeePersonalizationQuerySchema = z.object({
  scene: optionalEmployeeQueryValue(z.string().trim().min(1).max(64)).default("employee_home"),
});

const EMPLOYEE_BOOTSTRAP_CACHE_TTL_MS = 15_000;
const EMPLOYEE_BOOTSTRAP_PROFILE_WAIT_MS = 250;
const MAX_EMPLOYEE_BOOTSTRAP_CACHE_SIZE = 1_000;

type EmployeeBootstrapQuery = z.infer<typeof EmployeeBootstrapQuerySchema>;
type EmployeeBootstrapUserProfile = Awaited<ReturnType<typeof customerSelfServiceService.getUserProfileByAuthUserId>>;
type EmployeeBootstrapProfile = ReturnType<EmployeeSelfServiceController["serializeAuthProfile"]>;
type EmployeeBootstrapResponse = {
  context: AuthContext & { tenantId: string };
  profile: EmployeeBootstrapProfile;
  home_stats: Awaited<ReturnType<typeof homeDashboardService.getStats>> | null;
  home_mode: EmployeeBootstrapQuery["home_mode"];
  task_summary: Awaited<ReturnType<typeof taskCenterService.getSummary>> | null;
  tasks_mode: EmployeeBootstrapQuery["tasks_mode"];
  personalization: EmployeePersonalizationPayload;
  projects_mode: "defer";
  projects: null;
  customers_mode: "defer";
  customers: null;
};

class EmployeeSelfServiceController extends TenantBaseController {
  private bootstrapCache = new Map<string, {
    expiresAt: number;
    value: EmployeeBootstrapResponse;
  }>();
  private bootstrapInFlight = new Map<string, Promise<EmployeeBootstrapResponse>>();

  constructor() {
    super("employee_self_service");
  }

  private getCachedBootstrap(cacheKey: string) {
    const item = this.bootstrapCache.get(cacheKey);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.bootstrapCache.delete(cacheKey);
      return null;
    }

    return item.value;
  }

  private setCachedBootstrap(cacheKey: string, value: EmployeeBootstrapResponse) {
    const now = Date.now();
    if (this.bootstrapCache.size >= MAX_EMPLOYEE_BOOTSTRAP_CACHE_SIZE) {
      for (const [key, item] of this.bootstrapCache.entries()) {
        if (item.expiresAt <= now) {
          this.bootstrapCache.delete(key);
        }
      }

      if (this.bootstrapCache.size >= MAX_EMPLOYEE_BOOTSTRAP_CACHE_SIZE) {
        this.bootstrapCache.clear();
      }
    }

    this.bootstrapCache.set(cacheKey, {
      expiresAt: now + EMPLOYEE_BOOTSTRAP_CACHE_TTL_MS,
      value,
    });
  }

  private bootstrapCacheKey(
    authContext: AuthContext & { tenantId: string },
    query: EmployeeBootstrapQuery,
  ) {
    return [
      authContext.authUserId,
      authContext.tenantId,
      authContext.employeeId,
      query.home_mode,
      query.tasks_mode,
    ].join(":");
  }

  private bootstrapTokenCacheKey(
    user: FastifyRequest["user"],
    query: EmployeeBootstrapQuery,
  ) {
    if (!user?.sub || !user.tenant_id || !user.employee_id) {
      return null;
    }

    return [
      user.sub,
      user.tenant_id,
      user.employee_id,
      query.home_mode,
      query.tasks_mode,
    ].join(":");
  }

  private assertTaskSummaryReadable(authContext: AuthContext) {
    if (accessPolicyService.hasPermission(authContext, "task_center.read")) {
      return;
    }

    if (accessPolicyService.hasPermission(authContext, "dashboard.read")) {
      return;
    }

    throw Errors.forbidden();
  }

  private prewarmDeferredHomeData(
    request: FastifyRequest,
    authContext: AuthContext & { tenantId: string },
  ) {
    const startedAt = Date.now();
    void Promise.allSettled([
      projectSer.listProjects({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          ownership: "self",
          mode: "home",
        },
      }),
      customerCoreService.listCustomers({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          mode: "home",
        },
      }),
    ]).then((results) => {
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          rejectedCount: results.filter((item) => item.status === "rejected").length,
        },
        "[employee-bootstrap] deferred home data prewarmed",
      );
    }).catch((error) => {
      request.log.error(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          error,
        },
        "[employee-bootstrap] deferred home data prewarm failed",
      );
    });
  }

  private prewarmDeferredSummaryData(
    request: FastifyRequest,
    authContext: AuthContext & { tenantId: string },
    options: {
      includeHomeStats: boolean;
      includeTaskSummary: boolean;
    },
  ) {
    if (!options.includeHomeStats && !options.includeTaskSummary) {
      return;
    }

    const startedAt = Date.now();
    const tasks: Promise<unknown>[] = [];
    if (options.includeHomeStats) {
      tasks.push(homeDashboardService.getStats(authContext));
    }
    if (options.includeTaskSummary) {
      tasks.push(taskCenterService.getSummary(authContext));
    }

    void Promise.allSettled(tasks).then((results) => {
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          includeHomeStats: options.includeHomeStats,
          includeTaskSummary: options.includeTaskSummary,
          rejectedCount: results.filter((item) => item.status === "rejected").length,
        },
        "[employee-bootstrap] deferred summary data prewarmed",
      );
    }).catch((error) => {
      request.log.error(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          error,
        },
        "[employee-bootstrap] deferred summary data prewarm failed",
      );
    });
  }

  private serializeAuthProfile(
    authContext: AuthContext,
    userProfile: EmployeeBootstrapUserProfile,
  ) {
    return {
      auth_user_id: authContext.authUserId,
      nickname: userProfile?.nickname ?? null,
      avatar: resolveStoredFileUrl(userProfile?.avatar_path),
      avatar_path: userProfile?.avatar_path ?? null,
      profile_completed: Boolean(userProfile?.profile_completed_at),
      profile_completed_at: userProfile?.profile_completed_at ?? null,
      roles: authContext.roleCodes,
    };
  }

  private async getUserProfileForBootstrap(
    request: FastifyRequest,
    authContext: AuthContext & { tenantId: string },
  ): Promise<{
    userProfile: EmployeeBootstrapUserProfile;
    source: "cache" | "remote" | "timeout" | "error";
  }> {
    const cached = customerSelfServiceService.getCachedUserProfileEntryByAuthUserId(
      authContext.authUserId,
    );
    if (cached) {
      return {
        userProfile: cached.value,
        source: "cache",
      };
    }

    const profileRequest = customerSelfServiceService.getUserProfileByAuthUserId(
      authContext.authUserId,
    );
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<{ source: "timeout"; userProfile: null }>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({ source: "timeout", userProfile: null });
      }, EMPLOYEE_BOOTSTRAP_PROFILE_WAIT_MS);
    });

    const result = await Promise.race([
      profileRequest.then((userProfile) => ({
        source: "remote" as const,
        userProfile,
      })).catch((error) => {
        request.log.warn(
          {
            requestId: request.id,
            employeeId: authContext.employeeId,
            tenantId: authContext.tenantId,
            error,
          },
          "[employee-bootstrap] user profile load failed",
        );
        return {
          source: "error" as const,
          userProfile: null,
        };
      }),
      timeout,
    ]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (result.source === "timeout") {
      void profileRequest.catch((error) => {
        request.log.warn(
          {
            requestId: request.id,
            employeeId: authContext.employeeId,
            tenantId: authContext.tenantId,
            error,
          },
          "[employee-bootstrap] deferred user profile load failed",
        );
      });
    }

    return result;
  }

  private async resolveBootstrapPersonalization(
    request: FastifyRequest,
    authContext: AuthContext & { tenantId: string },
    scene: string,
  ) {
    const startedAt = Date.now();

    try {
      const payload = await employeePersonalizationService.resolveForEmployee(
        authContext,
        scene,
      );
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          scene,
          matchedRuleId: payload.matched_rule?.id ?? null,
          matchedScope: payload.matched_rule?.scope ?? null,
          version: payload.version,
        },
        "[employee-bootstrap] personalization resolved",
      );

      return payload;
    } catch (error) {
      request.log.warn(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          scene,
          error,
        },
        "[employee-bootstrap] personalization load failed",
      );

      return employeePersonalizationService.getEmptyPayload(scene);
    }
  }

  private async buildEmployeeBootstrapResponse(
    request: FastifyRequest,
    authContext: AuthContext & { tenantId: string },
    query: EmployeeBootstrapQuery,
  ): Promise<EmployeeBootstrapResponse> {
    const startedAt = Date.now();
    const { home_mode: homeMode, tasks_mode: tasksMode } = query;
    this.prewarmDeferredHomeData(request, authContext);
    this.prewarmDeferredSummaryData(request, authContext, {
      includeHomeStats: homeMode === "defer",
      includeTaskSummary: tasksMode === "defer",
    });

    const profileStartedAt = Date.now();
    const [homeStats, taskSummary, profileResult, personalization] = await Promise.all([
      homeMode === "inline" ? homeDashboardService.getStats(authContext) : Promise.resolve(null),
      tasksMode === "inline" ? taskCenterService.getSummary(authContext) : Promise.resolve(null),
      this.getUserProfileForBootstrap(request, authContext),
      this.resolveBootstrapPersonalization(request, authContext, "employee_home"),
    ]);

    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - profileStartedAt,
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
        homeMode,
        tasksMode,
        profileSource: profileResult.source,
        hasUserProfile: Boolean(profileResult.userProfile),
      },
      "[employee-bootstrap] synchronous data resolved",
    );

    const response = {
      context: authContext,
      profile: this.serializeAuthProfile(authContext, profileResult.userProfile),
      home_stats: homeStats,
      home_mode: homeMode,
      task_summary: taskSummary,
      tasks_mode: tasksMode,
      personalization,
      projects_mode: "defer" as const,
      projects: null,
      customers_mode: "defer" as const,
      customers: null,
    };

    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - startedAt,
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
      },
      "[employee-bootstrap] response built",
    );

    return response;
  }

  private async resolveEmployeeBootstrap(
    request: FastifyRequest,
    query: EmployeeBootstrapQuery,
    startedAt: number,
    options: {
      skipCacheLookup?: boolean;
    } = {},
  ) {
    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - authContextStartedAt,
        employeeId: authContext.employeeId ?? null,
        tenantId: authContext.tenantId,
      },
      "[employee-bootstrap] auth context resolved",
    );

    if (!authContext.employeeId) {
      throw Errors.business(403, "员工身份缺失，无法加载员工首页", "EMPLOYEE_MISSING");
    }

    this.assertPermission(authContext, "dashboard.read");
    this.assertTaskSummaryReadable(authContext);

    const cacheKey = this.bootstrapCacheKey(authContext, query);
    if (!options.skipCacheLookup) {
      const cached = this.getCachedBootstrap(cacheKey);
      if (cached) {
        request.log.info(
          {
            requestId: request.id,
            durationMs: Date.now() - startedAt,
            employeeId: authContext.employeeId,
            tenantId: authContext.tenantId,
          },
          "[employee-bootstrap] bootstrap cache hit",
        );

        return cached;
      }

      const existingRequest = this.bootstrapInFlight.get(cacheKey);
      if (existingRequest) {
        const response = await existingRequest;
        request.log.info(
          {
            requestId: request.id,
            durationMs: Date.now() - startedAt,
            employeeId: authContext.employeeId,
            tenantId: authContext.tenantId,
          },
          "[employee-bootstrap] bootstrap in-flight reused",
        );

        return response;
      }
    } else {
      const response = await this.buildEmployeeBootstrapResponse(
        request,
        authContext,
        query,
      );
      this.setCachedBootstrap(cacheKey, response);
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
        },
        "[employee-bootstrap] bootstrap resolved",
      );

      return response;
    }

    const responsePromise = this.buildEmployeeBootstrapResponse(
      request,
      authContext,
      query,
    ).then((response) => {
      this.setCachedBootstrap(cacheKey, response);
      return response;
    }).finally(() => {
      if (this.bootstrapInFlight.get(cacheKey) === responsePromise) {
        this.bootstrapInFlight.delete(cacheKey);
      }
    });
    this.bootstrapInFlight.set(cacheKey, responsePromise);
    const response = await responsePromise;

    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - startedAt,
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
      },
      "[employee-bootstrap] bootstrap resolved",
    );

    return response;
  }

  @Get("/employee/bootstrap")
  async getEmployeeBootstrap(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const queryResult = EmployeeBootstrapQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const tokenCacheKey = this.bootstrapTokenCacheKey(request.user, queryResult.data);
    if (tokenCacheKey) {
      const cached = this.getCachedBootstrap(tokenCacheKey);
      if (cached) {
        request.log.info(
          {
            requestId: request.id,
            durationMs: Date.now() - startedAt,
            authUserId: request.user?.sub ?? null,
            employeeId: request.user?.employee_id ?? null,
            tenantId: request.user?.tenant_id ?? null,
          },
          "[employee-bootstrap] bootstrap token cache hit",
        );

        return ResponseHandler.success(cached);
      }

      const existingRequest = this.bootstrapInFlight.get(tokenCacheKey);
      if (existingRequest) {
        const response = await existingRequest;
        request.log.info(
          {
            requestId: request.id,
            durationMs: Date.now() - startedAt,
            authUserId: request.user?.sub ?? null,
            employeeId: request.user?.employee_id ?? null,
            tenantId: request.user?.tenant_id ?? null,
          },
          "[employee-bootstrap] bootstrap token in-flight reused",
        );

        return ResponseHandler.success(response);
      }

      const responsePromise = this.resolveEmployeeBootstrap(
        request,
        queryResult.data,
        startedAt,
        { skipCacheLookup: true },
      ).then((response) => {
        this.setCachedBootstrap(tokenCacheKey, response);
        return response;
      }).finally(() => {
        if (this.bootstrapInFlight.get(tokenCacheKey) === responsePromise) {
          this.bootstrapInFlight.delete(tokenCacheKey);
        }
      });
      this.bootstrapInFlight.set(tokenCacheKey, responsePromise);
      const response = await responsePromise;
      return ResponseHandler.success(response);
    }

    const response = await this.resolveEmployeeBootstrap(
      request,
      queryResult.data,
      startedAt,
    );
    return ResponseHandler.success(response);
  }

  @Get("/employee/personalization")
  async getEmployeePersonalization(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = EmployeePersonalizationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const authContext = await this.getRequiredTenantContext(request);
    if (!authContext.employeeId) {
      throw Errors.business(403, "员工身份缺失，无法加载个性化配置", "EMPLOYEE_MISSING");
    }

    this.assertPermission(authContext, "dashboard.read");

    const payload = await employeePersonalizationService.resolveForEmployee(
      authContext,
      queryResult.data.scene,
    );
    return ResponseHandler.success(payload);
  }
}

export default new EmployeeSelfServiceController();
