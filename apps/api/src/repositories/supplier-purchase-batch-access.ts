import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const AccessContextSchema = z.object({
  tenant_id: z.uuid(),
  project_id: z.uuid(),
  submitted_by_employee_id: z.uuid().nullable(),
}).strict();

type Query = {
  select: (columns: string) => Query;
  eq: (column: string, value: string) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};
type Client = { from: (table: string) => Query };

export class SupplierPurchaseBatchAccessRepository {
  constructor(private readonly clientProvider: () => Client = () =>
    SupabaseDB.getAdminClient() as unknown as Client) {}

  async findBatchAccessContext(tenantId: string, batchId: string) {
    const { data, error } = await this.clientProvider()
      .from("supplier_purchase_batches")
      .select("tenant_id,project_id,submitted_by_employee_id")
      .eq("tenant_id", tenantId)
      .eq("id", batchId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商采购批次失败", error);
    if (data === null) return null;
    const parsed = AccessContextSchema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("查询供应商采购批次失败", parsed.error.issues);
    }
    return parsed.data;
  }
}
