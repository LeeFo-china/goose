import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { employeePersonalizationService } from "@/services/employee-personalization";
import { employeeServiceAccessService } from "@/services/employee-service-access";
import { homeDashboardService } from "@/services/home-dashboard";
import { taskCenterService } from "@/services/task-center";
import type { FastifyRequest } from "fastify";
import {
  buildServiceBlockedBootstrapResponse,
} from "./bootstrap-service-access";
import {
  getUserProfileForBootstrap,
  serializeAuthProfile,
} from "./bootstrap-profile";
import {
  prewarmDeferredHomeData,
  prewarmDeferredSummaryData,
} from "./bootstrap-prewarm";
import {
  EmployeeBootstrapQuerySchema,
  type EmployeeBootstrapQuery,
} from "./bootstrap-schema";
import type {
  EmployeeBootstrapResponse,
  TenantAuthContext,
} from "./bootstrap-types";

const EMPLOYEE_BOOTSTRAP_CACHE_TTL_MS = 15_000;
const MAX_EMPLOYEE_BOOTSTRAP_CACHE_SIZE = 1_000;

type EmployeeBootstrapDebugTiming = Record<string, number | string | null>;

type EmployeeBootstrapHandlerOptions = {
  getRequiredTenantContext: (request: FastifyRequest) => Promise<TenantAuthContext>;
  resolveServiceAccess?: typeof employeeServiceAccessService.resolve;
};

export class EmployeeBootstrapHandler {
  private bootstrapCache = new Map<string, {
    expiresAt: number;
    value: EmployeeBootstrapResponse;
  }>();
  private bootstrapInFlight = new Map<string, Promise<EmployeeBootstrapResponse>>();

  constructor(private readonly options: EmployeeBootstrapHandlerOptions) {}

  private resolveServiceAccess(
    input: Parameters<typeof employeeServiceAccessService.resolve>[0],
  ) {
    return this.options.resolveServiceAccess
      ? this.options.resolveServiceAccess(input)
      : employeeServiceAccessService.resolve(input);
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
      value: this.stripBootstrapDebugTiming(value),
    });
  }

  private stripBootstrapDebugTiming(
    response: EmployeeBootstrapResponse,
  ): EmployeeBootstrapResponse {
    const { debug_timing: _debugTiming, ...payload } = response;
    return payload;
  }

  private withBootstrapDebugTiming(
    response: EmployeeBootstrapResponse,
    query: EmployeeBootstrapQuery,
    timing: EmployeeBootstrapDebugTiming,
  ): EmployeeBootstrapResponse {
    if (!query.debug_timing) {
      return response;
    }

    return {
      ...response,
      debug_timing: timing,
    };
  }

  private bootstrapCacheKey(
    authContext: TenantAuthContext,
    query: EmployeeBootstrapQuery,
  ) {
    return [
      authContext.authUserId,
      authContext.tenantId,
      authContext.employeeId,
      query.home_mode,
      query.tasks_mode,
      employeePersonalizationService.getRulesVersionForTenant(
        authContext.tenantId,
      ),
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

  private async resolveBootstrapPersonalization(
    request: FastifyRequest,
    authContext: TenantAuthContext,
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
          rulesVersion: payload.rules_version,
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
    authContext: TenantAuthContext,
    query: EmployeeBootstrapQuery,
    serviceAccess: EmployeeBootstrapResponse["service_access"],
    debugTiming?: EmployeeBootstrapDebugTiming,
  ): Promise<EmployeeBootstrapResponse> {
    const startedAt = Date.now();
    const { home_mode: homeMode, tasks_mode: tasksMode } = query;
    prewarmDeferredHomeData(request, authContext);
    prewarmDeferredSummaryData(request, authContext, {
      includeHomeStats: homeMode === "defer",
      includeTaskSummary: tasksMode === "defer",
    });

    const profileStartedAt = Date.now();
    const [homeStats, taskSummary, profileResult, personalization] = await Promise.all([
      homeMode === "inline" ? homeDashboardService.getStats(authContext) : Promise.resolve(null),
      tasksMode === "inline" ? taskCenterService.getSummary(authContext) : Promise.resolve(null),
      getUserProfileForBootstrap(request, authContext),
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
    if (debugTiming) {
      debugTiming.synchronous_ms = Date.now() - profileStartedAt;
      debugTiming.profile_source = profileResult.source;
    }

    const response = {
      context: authContext,
      profile: serializeAuthProfile(authContext, profileResult.userProfile),
      service_access: serviceAccess,
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
  ) {
    const debugTiming: EmployeeBootstrapDebugTiming = {};
    const authContextStartedAt = Date.now();
    const authContext = await this.options.getRequiredTenantContext(request);
    debugTiming.auth_context_ms = Date.now() - authContextStartedAt;
    request.log.info(
      {
        requestId: request.id,
        durationMs: debugTiming.auth_context_ms,
        employeeId: authContext.employeeId ?? null,
        tenantId: authContext.tenantId,
      },
      "[employee-bootstrap] auth context resolved",
    );

    if (!authContext.employeeId) {
      throw Errors.business(403, "员工身份缺失，无法加载员工首页", "EMPLOYEE_MISSING");
    }

    const serviceAccessStartedAt = Date.now();
    const serviceAccess = await this.resolveServiceAccess({
      tenantId: authContext.tenantId,
      permissionCodes: authContext.permissions.map(({ code }) => code),
    });
    debugTiming.service_access_ms = Date.now() - serviceAccessStartedAt;
    if (!serviceAccess.can_enter_workspace) {
      return this.withBootstrapDebugTiming(
        await buildServiceBlockedBootstrapResponse(
          request,
          authContext,
          serviceAccess,
        ),
        query,
        { ...debugTiming, total_ms: Date.now() - startedAt },
      );
    }

    const permissionsStartedAt = Date.now();
    accessPolicyService.assertPermission(authContext, "dashboard.read");
    this.assertTaskSummaryReadable(authContext);
    debugTiming.permissions_ms = Date.now() - permissionsStartedAt;

    const cacheKey = this.bootstrapCacheKey(authContext, query);
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

      return this.withBootstrapDebugTiming({
        ...cached,
        service_access: serviceAccess,
      }, query, {
        ...debugTiming,
        cache: "hit",
        total_ms: Date.now() - startedAt,
      });
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

      return this.withBootstrapDebugTiming({
        ...response,
        service_access: serviceAccess,
      }, query, {
        ...debugTiming,
        cache: "in_flight",
        total_ms: Date.now() - startedAt,
      });
    }

    const buildStartedAt = Date.now();
    const responsePromise = this.buildEmployeeBootstrapResponse(
      request,
      authContext,
      query,
      serviceAccess,
      debugTiming,
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
    debugTiming.build_ms = Date.now() - buildStartedAt;

    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - startedAt,
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
      },
      "[employee-bootstrap] bootstrap resolved",
    );

    return this.withBootstrapDebugTiming(response, query, {
      ...debugTiming,
      cache: "miss",
      total_ms: Date.now() - startedAt,
    });
  }

  async getEmployeeBootstrap(request: FastifyRequest) {
    const startedAt = Date.now();
    const queryResult = EmployeeBootstrapQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    return this.resolveEmployeeBootstrap(
      request,
      queryResult.data,
      startedAt,
    );
  }
}
