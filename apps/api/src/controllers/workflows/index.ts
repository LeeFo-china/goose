import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  WorkflowDefinitionCreateSchema,
  WorkflowDefinitionIdParamsSchema,
  WorkflowDefinitionUpdateSchema,
  WorkflowGraphQuerySchema,
  WorkflowGraphSaveSchema,
  WorkflowListQuerySchema,
  WorkflowRuntimeCompleteNodeSchema,
  WorkflowRuntimeInstanceIdParamsSchema,
  WorkflowRuntimeInstanceListQuerySchema,
  WorkflowRuntimeRebuildSchema,
  WorkflowRuntimeInstanceStartSchema,
  WorkflowTemplateCreateSchema,
  WorkflowVersionListQuerySchema,
} from "@/schema/workflows";
import { workflowTemplateService } from "@/services/workflow-templates";
import { workflowService } from "@/services/workflows";
import { Get, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class WorkflowController extends TenantBaseController<
  typeof WorkflowDefinitionCreateSchema,
  typeof WorkflowDefinitionUpdateSchema
> {
  constructor() {
    super(
      "workflows",
      WorkflowDefinitionCreateSchema,
      WorkflowDefinitionUpdateSchema,
    );
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = WorkflowListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await workflowService.listDefinitions(authContext, queryResult.data);
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await workflowService.getDefinition(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    if (!this.createSchema) {
      throw Errors.badRequest("缺少参数类型：createSchema");
    }

    const bodyResult = this.createSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowService.createDefinition(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const bodyResult = this.updateSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowService.updateDefinition(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  };

  @Get("/workflows/:id/graph")
  async getGraph(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = WorkflowGraphQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await workflowService.getGraph(
      authContext,
      paramsResult.data.id,
      queryResult.data.version_id,
    );
    return ResponseHandler.success(data);
  }

  @Put("/workflows/:id/graph")
  async saveGraph(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = WorkflowGraphSaveSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowService.saveDraftGraph(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/workflows/:id/publish")
  async publish(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await workflowService.publishDefinition(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Get("/workflows/:id/versions")
  async listVersions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = WorkflowVersionListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await workflowService.listVersions(
      authContext,
      paramsResult.data.id,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/workflows/:id/archive")
  async archive(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await workflowService.archiveDefinition(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post("/workflows/templates")
  async createFromTemplate(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = WorkflowTemplateCreateSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowTemplateService.createFromTemplate(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/workflows/:id/runtime/instances")
  async listRuntimeInstances(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const queryResult = WorkflowRuntimeInstanceListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await workflowService.listRuntimeInstances(
      authContext,
      paramsResult.data.id,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/workflows/:id/runtime/instances")
  async startRuntimeInstance(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = WorkflowRuntimeInstanceStartSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowService.startRuntimeInstance(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/workflows/:id/runtime/instances/:instanceId/complete-node")
  async completeRuntimeNode(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowRuntimeInstanceIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = WorkflowRuntimeCompleteNodeSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowService.completeRuntimeNode(
      authContext,
      paramsResult.data.id,
      paramsResult.data.instanceId,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/workflows/:id/runtime/rebuild")
  async rebuildRuntimeInstance(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = WorkflowDefinitionIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = WorkflowRuntimeRebuildSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await workflowService.rebuildRuntimeInstance(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new WorkflowController();
