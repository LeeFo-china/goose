import { BaseController } from "@/controllers/BaseController";
import { CreatePaymentSchema, UpdatePaymentSchema } from "@/schema/payment";
import { SupabaseDB } from "@/utils/supabase/index";
// import type { Tables, Inserts, Updates } from "@/types/db";

class PaymentController extends BaseController<
  typeof CreatePaymentSchema,
  typeof UpdatePaymentSchema
> {
  constructor() {
    super("payments", CreatePaymentSchema, UpdatePaymentSchema);
  }
}

export default new PaymentController();
