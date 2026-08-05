import { PlatformBaseController } from "@/controllers/PlatformBaseController";
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
  ReleaseProductionCandidateDeploySchema,
  ReleaseProductionCandidateParamsSchema,
  ReleaseProductionMigrationDispatchSchema,
  ReleaseProductionMigrationPrecheckDispatchSchema,
  ReleaseRefListQuerySchema,
  ReleaseRunFailureSummaryParamsSchema,
  ReleaseRunListQuerySchema,
  ReleaseSuccessfulRefListQuerySchema,
} from "@/schema/release-deployments";
import { dockerServiceHealthService } from "@/services/docker-service-health";
import { locationGovernanceService } from "@/services/location-governance";
import { opsScriptService } from "@/services/ops-scripts";
import { releaseDeploymentService } from "@/services/release-deployments";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class AdminOpsController extends PlatformBaseController {
  constructor() {
    super("ops_script_runs");
  }

  @Get("/admin/ops/scripts")
  async listScripts(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    return ResponseHandler.success(opsScriptService.listScripts());
  }

  @Get("/admin/ops/script-runs")
  async listScriptRuns(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const queryResult = OpsScriptRunListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await opsScriptService.listRuns(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/system-metrics")
  async getSystemMetrics(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const data = await opsScriptService.getSystemMetrics();
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/service-health")
  async getServiceHealth(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const data = await dockerServiceHealthService.getSnapshot();
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/location-metrics")
  async getLocationMetrics(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

    const data = await locationGovernanceService.getMetrics(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/options")
  async getReleaseOptions(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    return ResponseHandler.success(releaseDeploymentService.getOptions());
  }

  @Get("/admin/ops/releases/runtime-versions")
  async getReleaseRuntimeVersions(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const data = await releaseDeploymentService.getRuntimeVersions();
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/runs")
  async listReleaseRuns(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const queryResult = ReleaseRunListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await releaseDeploymentService.listRuns(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/runs/:runId/failure-summary")
  async getReleaseRunFailureSummary(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const paramsResult = ReleaseRunFailureSummaryParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await releaseDeploymentService.getRunFailureSummary(paramsResult.data.runId);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/successful-refs")
  async listSuccessfulReleaseRefs(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const queryResult = ReleaseSuccessfulRefListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await releaseDeploymentService.listSuccessfulRefs(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/refs")
  async listReleaseRefs(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const queryResult = ReleaseRefListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await releaseDeploymentService.listRefs(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/tags")
  async createReleaseTag(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

    const bodyResult = ReleaseCreateTagSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.createTag(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/rollback-tag")
  async createReleaseRollbackTag(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

    const bodyResult = ReleaseCreateRollbackTagSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.createRollbackTag(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/dispatch")
  async dispatchRelease(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

    const bodyResult = ReleaseDispatchSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.dispatch(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/production-candidates/:runId")
  async getProductionReleaseCandidate(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const paramsResult = ReleaseProductionCandidateParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await releaseDeploymentService.getProductionCandidate(paramsResult.data.runId);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/production-candidates/:runId/deploy")
  async deployProductionReleaseCandidate(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

    const paramsResult = ReleaseProductionCandidateParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = ReleaseProductionCandidateDeploySchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.dispatchProductionCandidate(
      authContext,
      paramsResult.data.runId,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/production-migrations/dispatch")
  async dispatchProductionMigration(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

    const bodyResult = ReleaseProductionMigrationDispatchSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.dispatchProductionMigration(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/releases/production-migrations/precheck")
  async dispatchProductionMigrationPrecheck(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

    const bodyResult = ReleaseProductionMigrationPrecheckDispatchSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await releaseDeploymentService.dispatchProductionMigrationPrecheck(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/admin/ops/releases/production-migrations/precheck/:runId")
  async getProductionMigrationPrecheck(request: FastifyRequest, reply: FastifyReply) {
    await this.getOpsContext(request);

    const paramsResult = ReleaseProductionCandidateParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await releaseDeploymentService.getProductionMigrationPrecheck(paramsResult.data.runId);
    return ResponseHandler.success(data);
  }

  private getOpsContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.ops.execute");
  }

  @Post("/admin/ops/scripts/:scriptKey/run")
  async runScript(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getOpsContext(request);

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
