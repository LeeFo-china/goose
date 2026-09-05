import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  WarehouseCreateSchema,
  WarehouseListQuerySchema,
  WarehouseParamSchema,
  WarehouseUpdateSchema,
} from "@/schema/warehouses";
import { warehousesService } from "@/services/warehouses";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class WarehousesController extends TenantBaseController {
  constructor() {
    super("warehouses");
  }

  @Get("/warehouses")
  async listWarehouses(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(WarehouseListQuerySchema, request.query);
    return ResponseHandler.success(
      await warehousesService.list(auth, query),
    );
  }

  @Get("/warehouses/:id")
  async getWarehouse(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(WarehouseParamSchema, request.params);
    return ResponseHandler.success(
      await warehousesService.get(auth, id),
    );
  }

  @Post("/warehouses")
  async createWarehouse(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const input = this.parse(WarehouseCreateSchema, request.body);
    return ResponseHandler.success(
      await warehousesService.create(auth, input, key),
    );
  }

  @Patch("/warehouses/:id")
  async updateWarehouse(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(WarehouseParamSchema, request.params);
    const input = this.parse(WarehouseUpdateSchema, request.body);
    return ResponseHandler.success(
      await warehousesService.update(auth, id, input, key),
    );
  }

  private parse<Schema extends z.ZodTypeAny>(
    schema: Schema,
    input: unknown,
  ): z.infer<Schema> {
    const result = schema.safeParse(input || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

export default new WarehousesController();
