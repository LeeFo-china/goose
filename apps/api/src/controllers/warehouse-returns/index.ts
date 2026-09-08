import type { WarehouseMaterialCommand } from '@gooes/domain';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { TenantBaseController } from '@/controllers/TenantBaseController';
import { requireSupplierIdempotencyKey } from '@/controllers/supplier-command-http';
import { Errors } from '@/errors/error-factory';
import {
  WarehouseReturnDraftSchema, WarehouseReturnListQuerySchema,
  WarehouseMaterialCommandSchema, WarehouseMaterialItemsQuerySchema,
  WarehouseMaterialParamSchema,
} from '@/schema/warehouse-materials';
import { warehouseMaterialsService } from '@/services/warehouse-materials';
import { Get, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

class WarehouseReturnsController extends TenantBaseController {
  constructor() { super('warehouse_return_orders'); }

  @Get('/warehouse-returns')
  async listOrders(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(WarehouseReturnListQuerySchema, request.query);
    return ResponseHandler.success(await warehouseMaterialsService.list(auth, 'return', query));
  }

  @Get('/warehouse-returns/:id')
  async getOrder(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseMaterialParamSchema, request.params);
    return ResponseHandler.success(await warehouseMaterialsService.get(auth, 'return', id));
  }

  @Get('/warehouse-returns/:id/items')
  async listOrderItems(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseMaterialParamSchema, request.params);
    const query = this.parse(WarehouseMaterialItemsQuerySchema, request.query);
    return ResponseHandler.success(await warehouseMaterialsService.listItems(auth, 'return', id, query));
  }

  @Post('/warehouse-returns/:id/save-draft')
  async saveDraft(request: FastifyRequest) { return this.runCommand(request, 'save_draft'); }

  @Post('/warehouse-returns/:id/complete')
  async complete(request: FastifyRequest) { return this.runCommand(request, 'complete'); }

  @Post('/warehouse-returns/:id/cancel')
  async cancel(request: FastifyRequest) { return this.runCommand(request, 'cancel'); }

  private async runCommand(request: FastifyRequest, command: WarehouseMaterialCommand) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(WarehouseMaterialParamSchema, request.params);
    const input = command === 'save_draft'
      ? this.parse(WarehouseReturnDraftSchema, request.body)
      : this.parse(WarehouseMaterialCommandSchema, request.body);
    return ResponseHandler.success(await warehouseMaterialsService.command(auth, 'return', id, command, input, key));
  }

  private parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
    const result = schema.safeParse(input ?? {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}
export default new WarehouseReturnsController();
