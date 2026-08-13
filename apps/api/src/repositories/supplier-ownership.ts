import type { SupabaseClient } from "@supabase/supabase-js";

import { Errors } from "@/errors/error-factory";
import type { Database } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

const MAX_OWNERSHIP_IDS = 100;
const SUPPLIER_SELECT =
  "id,ownership_scope,owner_tenant_id,operational_status";
const STANDARD_OWNERSHIP_SELECT =
  "id,ownership_scope,owner_tenant_id,status";

type OwnershipScope = "platform" | "tenant" | null;
type OwnershipClient = SupabaseClient<Database>;
type SupplierOwnershipDatabaseRow = Pick<
  Database["public"]["Tables"]["suppliers"]["Row"],
  "id" | "ownership_scope" | "owner_tenant_id" | "operational_status"
>;
type StandardOwnershipDatabaseRow = Pick<
  Database["public"]["Tables"]["supplier_products"]["Row"],
  "id" | "ownership_scope" | "owner_tenant_id" | "status"
>;
type StandardOwnershipTable =
  | "supplier_products"
  | "catalog_categories"
  | "catalog_brands";

export type SupplierOwnershipRow = {
  id: string;
  ownership_scope: OwnershipScope;
  owner_tenant_id: string | null;
  status: string;
};

export type CatalogOwnershipInput = {
  kind: "category" | "brand";
  ids: readonly string[];
};

export class SupplierOwnershipRepository {
  private readonly client: OwnershipClient;

  constructor(
    clientFactory: () => OwnershipClient = () =>
      SupabaseDB.getAdminClient() as OwnershipClient,
  ) {
    this.client = clientFactory();
  }

  async findSupplierOwnerships(
    ids: readonly string[],
  ): Promise<Map<string, SupplierOwnershipRow>> {
    const uniqueIds = normalizeIds(ids);
    if (uniqueIds.length === 0) return new Map();

    const message = "查询供应商归属失败";
    const { data, error } = await this.client.from("suppliers")
      .select(SUPPLIER_SELECT)
      .in("id", uniqueIds)
      .limit(uniqueIds.length);
    if (error) throw Errors.dbError(message, error);

    const rows = (data ?? []) as SupplierOwnershipDatabaseRow[];
    return toOwnershipMap(
      rows.map((row) => ({
        id: row.id,
        ownership_scope: row.ownership_scope,
        owner_tenant_id: row.owner_tenant_id,
        status: row.operational_status,
      })),
      uniqueIds,
      message,
    );
  }

  async findProductOwnerships(
    ids: readonly string[],
  ): Promise<Map<string, SupplierOwnershipRow>> {
    return this.findStandardOwnerships(
      "supplier_products",
      ids,
      "查询供应商商品归属失败",
    );
  }

  async findCatalogOwnerships(
    input: CatalogOwnershipInput,
  ): Promise<Map<string, SupplierOwnershipRow>> {
    const table = input.kind === "category"
      ? "catalog_categories"
      : "catalog_brands";
    return this.findStandardOwnerships(
      table,
      input.ids,
      "查询供应商目录归属失败",
    );
  }

  private async findStandardOwnerships(
    table: StandardOwnershipTable,
    ids: readonly string[],
    message: string,
  ): Promise<Map<string, SupplierOwnershipRow>> {
    const uniqueIds = normalizeIds(ids);
    if (uniqueIds.length === 0) return new Map();

    const { data, error } = await this.client.from(table)
      .select(STANDARD_OWNERSHIP_SELECT)
      .in("id", uniqueIds)
      .limit(uniqueIds.length);
    if (error) throw Errors.dbError(message, error);

    return toOwnershipMap(
      (data ?? []) as StandardOwnershipDatabaseRow[],
      uniqueIds,
      message,
    );
  }
}

function normalizeIds(ids: readonly string[]): string[] {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > MAX_OWNERSHIP_IDS) {
    throw Errors.badRequest("归属查询 ID 数量不能超过 100 个");
  }
  return uniqueIds;
}

function toOwnershipMap(
  rows: readonly StandardOwnershipDatabaseRow[],
  requestedIds: readonly string[],
  message: string,
): Map<string, SupplierOwnershipRow> {
  const requestedIdSet = new Set(requestedIds);
  const ownerships = new Map<string, SupplierOwnershipRow>();

  for (const row of rows) {
    if (!requestedIdSet.has(row.id)) continue;
    ownerships.set(row.id, {
      id: row.id,
      ownership_scope: parseOwnershipScope(
        row.ownership_scope,
        row.id,
        message,
      ),
      owner_tenant_id: row.owner_tenant_id,
      status: row.status,
    });
  }

  return ownerships;
}

function parseOwnershipScope(
  scope: string | null,
  id: string,
  message: string,
): OwnershipScope {
  if (scope === null || scope === "platform" || scope === "tenant") {
    return scope;
  }
  throw Errors.dbError(message, { id, ownership_scope: scope });
}

const supplierOwnershipRepository = new SupplierOwnershipRepository();

export function findSupplierOwnerships(
  ids: readonly string[],
): Promise<Map<string, SupplierOwnershipRow>> {
  return supplierOwnershipRepository.findSupplierOwnerships(ids);
}

export function findProductOwnerships(
  ids: readonly string[],
): Promise<Map<string, SupplierOwnershipRow>> {
  return supplierOwnershipRepository.findProductOwnerships(ids);
}

export function findCatalogOwnerships(
  input: CatalogOwnershipInput,
): Promise<Map<string, SupplierOwnershipRow>> {
  return supplierOwnershipRepository.findCatalogOwnerships(input);
}
