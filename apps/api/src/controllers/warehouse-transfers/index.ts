import type { WarehouseTransferCommand } from '@gooes/domain';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { TenantBaseController } from '@/controllers/TenantBaseController';
import { requireSupplierIdempotencyKey } from '@/controllers/supplier-command-http';
import { Errors } from '@/errors/error-factory';
import { WarehouseTransferDraftSchema, WarehouseTransferListQuerySchema, WarehouseTransferCommandSchema,
  WarehouseTransferItemsQuerySchema, WarehouseTransferParamSchema, WarehouseTransferSettingsQuerySchema,
} from '@/schema/warehouse-transfers';
import { warehouseTransfersService } from '@/services/warehouse-transfers';
import { Get, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

class WarehouseTransfersController extends TenantBaseController {
  constructor() { super('warehouse_transfer_orders'); }

  @Get('/warehouse-transfers')
  async listOrders(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await warehouseTransfersService.list(auth, this.parse(WarehouseTransferListQuerySchema, request.query)));
  }

  @Get('/warehouse-transfers/settings')
  async getSettings(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    this.parse(WarehouseTransferSettingsQuerySchema, request.query);
    return ResponseHandler.success(await warehouseTransfersService.getSettings(auth));
  }

  @Get('/warehouse-transfers/:id')
  async getOrder(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseTransferParamSchema, request.params);
    this.parse(WarehouseTransferSettingsQuerySchema, request.query);
    return ResponseHandler.success(await warehouseTransfersService.get(auth, id));
  }

  @Get('/warehouse-transfers/:id/items')
  async listOrderItems(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseTransferParamSchema, request.params);
    return ResponseHandler.success(await warehouseTransfersService.listItems(auth, id, this.parse(WarehouseTransferItemsQuerySchema, request.query)));
  }

  @Post('/warehouse-transfers/:id/save-draft')
  async saveDraft(request: FastifyRequest) { return this.runCommand(request, 'save_draft'); }

  @Post('/warehouse-transfers/:id/submit')
  async submit(request: FastifyRequest) { return this.runCommand(request, 'submit'); }

  @Post('/warehouse-transfers/:id/complete')
  async complete(request: FastifyRequest) { return this.runCommand(request, 'complete'); }

  @Post('/warehouse-transfers/:id/cancel')
  async cancel(request: FastifyRequest) { return this.runCommand(request, 'cancel'); }

  private async runCommand(request: FastifyRequest, command: WarehouseTransferCommand) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(WarehouseTransferParamSchema, request.params);
    const input = command === 'save_draft' ? this.parse(WarehouseTransferDraftSchema, request.body) : this.parse(WarehouseTransferCommandSchema, request.body);
    return ResponseHandler.success(await warehouseTransfersService.command(auth, id, command, input, key));
  }

  private parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
    const result = schema.safeParse(input ?? {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}
export default new WarehouseTransfersController();
