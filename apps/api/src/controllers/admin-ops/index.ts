import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  OpsScriptKeyParamsSchema,
  OpsScriptRunListQuerySchema,
  RunOpsScriptSchema,
} from "@/schema/ops-scripts";
import {
  ReleaseCreateRollbackTagSchema,
  ReleaseCreateTagSchema,
  ReleaseDispatchSchema,
  ReleaseRefListQuerySchema,
  ReleaseRunListQuerySchema,
  ReleaseSuccessfulRefListQuerySchema,
} from "@/schema/release-deployments";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { dockerServiceHealthService } from "@/services/docker-service-health";
import { opsScriptService } from "@/services/ops-scripts";
import { releaseDeploymentService } from "@/services/release-deployments";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class AdminOpsController extends BaseController {
  constructor() {
    super("ops_script_runs");
  }

  private assertOpsPermission(
    authContext: AuthContext,
    permissionCode: "system.ops.read" | "system.ops.run" | "system.release.read" | "system.release.run",
  ) {
    if (authContext.isPlatformAdmin) {
      return;
    }

    accessPolicyService.assertPermission(authContext, permissionCode);
  }

  @Get("/admin/ops/scripts")
  async listScripts(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.release.read");

    return ResponseHandler.success(opsScriptService.listScripts());
  }

  @Get("/admin/ops/script-runs")
  async listScriptRuns(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.release.read");

    const queryResult = OpsScriptRunListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await opsScriptService.listRuns(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/system-metrics")
  async getSystemMetrics(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.ops.read");

    const data = await opsScriptService.getSystemMetrics();
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/service-health")
  async getServiceHealth(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.ops.read");

    const data = await dockerServiceHealthService.getSnapshot();
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/options")
  async getReleaseOptions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.ops.read");

    return ResponseHandler.success(releaseDeploymentService.getOptions());
  }

  @Get("/admin/ops/releases/runs")
  async listReleaseRuns(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.ops.read");

    const queryResult = ReleaseRunListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await releaseDeploymentService.listRuns(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/successful-refs")
  async listSuccessfulReleaseRefs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.release.read");

    const queryResult = ReleaseSuccessfulRefListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await releaseDeploymentService.listSuccessfulRefs(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/refs")
  async listReleaseRefs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.release.read");

    const queryResult = ReleaseRefListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await releaseDeploymentService.listRefs(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/tags")
  async createReleaseTag(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.release.run");

    const bodyResult = ReleaseCreateTagSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.createTag(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/rollback-tag")
  async createReleaseRollbackTag(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.release.run");

    const bodyResult = ReleaseCreateRollbackTagSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.createRollbackTag(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/dispatch")
  async dispatchRelease(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.release.run");

    const bodyResult = ReleaseDispatchSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.dispatch(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/scripts/:scriptKey/run")
  async runScript(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    this.assertOpsPermission(authContext, "system.ops.run");

    const paramsResult = OpsScriptKeyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = RunOpsScriptSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await opsScriptService.runScript(
      authContext,
      paramsResult.data.scriptKey,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new AdminOpsController();
