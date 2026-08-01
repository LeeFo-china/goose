import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type SupplierPaymentEvidenceFileRecord = {
  object_key: string;
  tenant_id: string | null;
  scene: string;
  status: string;
  deleted_at: string | null;
  created_by_employee_id: string | null;
};

type QueryResult = {
  data: SupplierPaymentEvidenceFileRecord[] | null;
  error: unknown;
};
type Query = {
  select(columns: string): Query;
  in(column: string, values: string[]): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  limit(value: number): Promise<QueryResult>;
};
type Client = { from(table: string): Query };

export class SupplierPaymentEvidenceFilesRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async findActiveByObjectKeys(input: {
    objectKeys: string[];
    tenantId: string;
    limit: number;
  }): Promise<SupplierPaymentEvidenceFileRecord[]> {
    const limit = Math.min(Math.max(input.limit, 1), 9);
    const objectKeys = [...new Set(input.objectKeys)].slice(0, limit);
    if (objectKeys.length === 0) return [];
    const { data, error } = await this.clientProvider()
      .from("platform_file_objects")
      .select(
        "object_key,tenant_id,scene,status,deleted_at,created_by_employee_id",
      )
      .in("object_key", objectKeys)
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(limit);
    if (error) {
      throw Errors.dbError("查询供应商付款凭证失败", error);
    }
    return data ?? [];
  }
}

export const supplierPaymentEvidenceFilesRepository =
  new SupplierPaymentEvidenceFilesRepository();
