import type { WarehouseMaterialCommand } from '@gooes/domain';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { TenantBaseController } from '@/controllers/TenantBaseController';
import { requireSupplierIdempotencyKey } from '@/controllers/supplier-command-http';
import { Errors } from '@/errors/error-factory';
import {
  WarehouseIssueDraftSchema, WarehouseIssueListQuerySchema,
  WarehouseMaterialCommandSchema, WarehouseMaterialItemsQuerySchema,
  WarehouseMaterialParamSchema,
  WarehouseMaterialProjectQuerySchema,
} from '@/schema/warehouse-materials';
import { warehouseMaterialsService } from '@/services/warehouse-materials';
import { Get, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

class WarehouseIssuesController extends TenantBaseController {
  constructor() { super('warehouse_issue_orders'); }

  @Get('/warehouse-issues')
  async listOrders(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(WarehouseIssueListQuerySchema, request.query);
    return ResponseHandler.success(await warehouseMaterialsService.list(auth, 'issue', query));
  }

  @Get('/warehouse-issues/project-options')
  async listProjects(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(WarehouseMaterialProjectQuerySchema, request.query);
    return ResponseHandler.success(await warehouseMaterialsService.listProjects(auth, query));
  }

  @Get('/warehouse-issues/:id')
  async getOrder(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseMaterialParamSchema, request.params);
    return ResponseHandler.success(await warehouseMaterialsService.get(auth, 'issue', id));
  }

  @Get('/warehouse-issues/:id/items')
  async listOrderItems(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseMaterialParamSchema, request.params);
    const query = this.parse(WarehouseMaterialItemsQuerySchema, request.query);
    return ResponseHandler.success(await warehouseMaterialsService.listItems(auth, 'issue', id, query));
  }

  @Post('/warehouse-issues/:id/save-draft')
  async saveDraft(request: FastifyRequest) { return this.runCommand(request, 'save_draft'); }

  @Post('/warehouse-issues/:id/submit')
  async submit(request: FastifyRequest) { return this.runCommand(request, 'submit'); }

  @Post('/warehouse-issues/:id/complete')
  async complete(request: FastifyRequest) { return this.runCommand(request, 'complete'); }

  @Post('/warehouse-issues/:id/cancel')
  async cancel(request: FastifyRequest) { return this.runCommand(request, 'cancel'); }

  private async runCommand(request: FastifyRequest, command: WarehouseMaterialCommand) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(WarehouseMaterialParamSchema, request.params);
    const input = command === 'save_draft'
      ? this.parse(WarehouseIssueDraftSchema, request.body)
      : this.parse(WarehouseMaterialCommandSchema, request.body);
    return ResponseHandler.success(await warehouseMaterialsService.command(auth, 'issue', id, command, input, key));
  }

  private parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
    const result = schema.safeParse(input ?? {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}
export default new WarehouseIssuesController();
