import { BaseController } from "@/controllers/BaseController";
import { CreatePaymentSchema, UpdatePaymentSchema } from "@/schema/payment";
import type { FastifyInstance } from "fastify";
import { SupabaseDB } from "@/utils/supabase/index";
// import type { Tables, Inserts, Updates } from "@/types/db";

class PaymentController extends BaseController<
  typeof CreatePaymentSchema,
  typeof UpdatePaymentSchema
> {
  constructor() {
    super("payments", CreatePaymentSchema, UpdatePaymentSchema);
  }

  public override registerExtraRoutes = async (
    app: FastifyInstance,
    tableName: string,
  ): Promise<void> => {};
}

export default new PaymentController();
