import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPayableFilterOptionQuerySchema,
  SupplierPayableListQuerySchema,
} from "@/schema/supplier-payments";
import { supplierPayablesService } from "@/services/supplier-payables";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierPayablesController extends TenantBaseController {
  constructor() {
    super("supplier-payables");
  }

  @Get("/supplier-payables")
  async listPayables(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPayableListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPayablesService.list(auth, query),
    );
  }

  @Get("/supplier-payable-filter-options")
  async listFilterOptions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPayableFilterOptionQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPayablesService.listFilterOptions(auth, query),
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

export default new SupplierPayablesController();
