import type { WarehouseStocktakeCommand } from '@gooes/domain';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { TenantBaseController } from '@/controllers/TenantBaseController';
import { requireSupplierIdempotencyKey } from '@/controllers/supplier-command-http';
import { Errors } from '@/errors/error-factory';
import { WarehouseStocktakeCommandSchema, WarehouseStocktakeCountsSchema, WarehouseStocktakeDraftSchema,
  WarehouseStocktakeItemsQuerySchema, WarehouseStocktakeListQuerySchema, WarehouseStocktakeParamSchema,
  WarehouseStocktakeSettingsQuerySchema } from '@/schema/warehouse-stocktakes';
import { warehouseStocktakesService } from '@/services/warehouse-stocktakes';
import { Get, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

class WarehouseStocktakesController extends TenantBaseController {
  constructor() { super('warehouse_stocktake_orders'); }
  @Get('/warehouse-stocktakes') async listOrders(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await warehouseStocktakesService.list(auth, this.parse(WarehouseStocktakeListQuerySchema, request.query)));
  }
  @Get('/warehouse-stocktakes/settings') async getSettings(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    this.parse(WarehouseStocktakeSettingsQuerySchema, request.query);
    return ResponseHandler.success(await warehouseStocktakesService.getSettings(auth));
  }
  @Get('/warehouse-stocktakes/:id') async getOrder(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseStocktakeParamSchema, request.params);
    this.parse(WarehouseStocktakeSettingsQuerySchema, request.query);
    return ResponseHandler.success(await warehouseStocktakesService.get(auth, id));
  }
  @Get('/warehouse-stocktakes/:id/items') async listOrderItems(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseStocktakeParamSchema, request.params);
    return ResponseHandler.success(await warehouseStocktakesService.listItems(auth, id,
      this.parse(WarehouseStocktakeItemsQuerySchema, request.query)));
  }
  @Post('/warehouse-stocktakes/:id/save-draft') async saveDraft(request: FastifyRequest) { return this.runCommand(request, 'save_draft'); }
  @Post('/warehouse-stocktakes/:id/start') async start(request: FastifyRequest) { return this.runCommand(request, 'start'); }
  @Post('/warehouse-stocktakes/:id/record-counts') async recordCounts(request: FastifyRequest) { return this.runCommand(request, 'record_counts'); }
  @Post('/warehouse-stocktakes/:id/submit') async submit(request: FastifyRequest) { return this.runCommand(request, 'submit'); }
  @Post('/warehouse-stocktakes/:id/complete') async complete(request: FastifyRequest) { return this.runCommand(request, 'complete'); }
  @Post('/warehouse-stocktakes/:id/cancel') async cancel(request: FastifyRequest) { return this.runCommand(request, 'cancel'); }
  private async runCommand(request: FastifyRequest, command: WarehouseStocktakeCommand) {
    const auth = await this.getRequiredTenantContext(request);
    this.parse(WarehouseStocktakeSettingsQuerySchema, request.query);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(WarehouseStocktakeParamSchema, request.params);
    const schema = command === 'save_draft' ? WarehouseStocktakeDraftSchema
      : command === 'record_counts' ? WarehouseStocktakeCountsSchema : WarehouseStocktakeCommandSchema;
    const input = this.parse(schema, request.body);
    return ResponseHandler.success(await warehouseStocktakesService.command(auth, id, command, input, key));
  }
  private parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
    const result = schema.safeParse(input ?? {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}
export default new WarehouseStocktakesController();
