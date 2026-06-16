import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { FinanceLedgerListQuerySchema } from "@/schema/finance";
import { financeLedgerService } from "@/services/finance-ledger";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class FinanceController extends TenantBaseController {
  constructor() {
    super("finance");
  }

  @Get("/finance/ledger")
  async listLedger(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = FinanceLedgerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await financeLedgerService.listLedger(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new FinanceController();
