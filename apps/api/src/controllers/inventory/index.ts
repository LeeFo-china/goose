import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  InventoryBalanceListQuerySchema,
  InventoryTransactionListQuerySchema,
} from "@/schema/inventory";
import { inventoryService } from "@/services/inventory";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class InventoryController extends TenantBaseController {
  constructor() {
    super("inventory");
  }

  @Get("/inventory/balances")
  async listBalances(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(InventoryBalanceListQuerySchema, request.query);
    return ResponseHandler.success(
      await inventoryService.listBalances(auth, query),
    );
  }

  @Get("/inventory/transactions")
  async listTransactions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      InventoryTransactionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await inventoryService.listTransactions(auth, query),
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

export default new InventoryController();
