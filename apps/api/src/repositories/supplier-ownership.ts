import type { SupabaseClient } from "@supabase/supabase-js";

import { Errors } from "@/errors/error-factory";
import type { Database } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

const MAX_OWNERSHIP_IDS = 100;
const SUPPLIER_SELECT =
  "id,ownership_scope,owner_tenant_id,operational_status";
const STANDARD_OWNERSHIP_SELECT =
  "id,ownership_scope,owner_tenant_id,status";

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
type CatalogOwnershipTable = Exclude<
  StandardOwnershipTable,
  "supplier_products"
>;

type OwnershipRowBase = {
  id: string;
  status: string;
};

export type SupplierOwnershipRow = OwnershipRowBase & (
  | { ownership_scope: "platform"; owner_tenant_id: null }
  | { ownership_scope: "tenant"; owner_tenant_id: string }
);

export type ProductOwnershipRow = SupplierOwnershipRow | (
  OwnershipRowBase & { ownership_scope: null; owner_tenant_id: null }
);

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
      false,
    );
  }

  async findProductOwnerships(
    ids: readonly string[],
  ): Promise<Map<string, ProductOwnershipRow>> {
    return this.findStandardOwnerships(
      "supplier_products",
      ids,
      "查询供应商商品归属失败",
      true,
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
      false,
    );
  }

  private async findStandardOwnerships(
    table: "supplier_products",
    ids: readonly string[],
    message: string,
    allowLegacyNullOwnership: true,
  ): Promise<Map<string, ProductOwnershipRow>>;
  private async findStandardOwnerships(
    table: CatalogOwnershipTable,
    ids: readonly string[],
    message: string,
    allowLegacyNullOwnership: false,
  ): Promise<Map<string, SupplierOwnershipRow>>;
  private async findStandardOwnerships(
    table: StandardOwnershipTable,
    ids: readonly string[],
    message: string,
    allowLegacyNullOwnership: boolean,
  ): Promise<Map<string, ProductOwnershipRow>> {
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
      allowLegacyNullOwnership,
    );
  }
}

function normalizeIds(ids: readonly string[]): string[] {
  if (ids.length > MAX_OWNERSHIP_IDS) {
    throw Errors.badRequest("归属查询 ID 数量不能超过 100 个");
  }
  return [...new Set(ids)];
}

function toOwnershipMap(
  rows: readonly StandardOwnershipDatabaseRow[],
  requestedIds: readonly string[],
  message: string,
  allowLegacyNullOwnership: true,
): Map<string, ProductOwnershipRow>;
function toOwnershipMap(
  rows: readonly StandardOwnershipDatabaseRow[],
  requestedIds: readonly string[],
  message: string,
  allowLegacyNullOwnership: false,
): Map<string, SupplierOwnershipRow>;
function toOwnershipMap(
  rows: readonly StandardOwnershipDatabaseRow[],
  requestedIds: readonly string[],
  message: string,
  allowLegacyNullOwnership: boolean,
): Map<string, ProductOwnershipRow>;
function toOwnershipMap(
  rows: readonly StandardOwnershipDatabaseRow[],
  requestedIds: readonly string[],
  message: string,
  allowLegacyNullOwnership: boolean,
): Map<string, ProductOwnershipRow> {
  const requestedIdSet = new Set(requestedIds);
  const ownerships = new Map<string, ProductOwnershipRow>();

  for (const row of rows) {
    if (!requestedIdSet.has(row.id)) continue;
    ownerships.set(
      row.id,
      parseOwnershipRow(row, message, allowLegacyNullOwnership),
    );
  }

  return ownerships;
}

function parseOwnershipRow(
  row: StandardOwnershipDatabaseRow,
  message: string,
  allowLegacyNullOwnership: boolean,
): ProductOwnershipRow {
  const base = { id: row.id, status: row.status };

  if (row.ownership_scope === "platform" && row.owner_tenant_id === null) {
    return {
      ...base,
      ownership_scope: "platform",
      owner_tenant_id: null,
    };
  }
  if (
    row.ownership_scope === "tenant" &&
    typeof row.owner_tenant_id === "string" &&
    row.owner_tenant_id.length > 0
  ) {
    return {
      ...base,
      ownership_scope: "tenant",
      owner_tenant_id: row.owner_tenant_id,
    };
  }
  if (
    allowLegacyNullOwnership &&
    row.ownership_scope === null &&
    row.owner_tenant_id === null
  ) {
    return {
      ...base,
      ownership_scope: null,
      owner_tenant_id: null,
    };
  }
  throw Errors.dbError(message, {
    id: row.id,
    ownership_scope: row.ownership_scope,
    owner_tenant_id: row.owner_tenant_id,
  });
}

const supplierOwnershipRepository = new SupplierOwnershipRepository();

export function findSupplierOwnerships(
  ids: readonly string[],
): Promise<Map<string, SupplierOwnershipRow>> {
  return supplierOwnershipRepository.findSupplierOwnerships(ids);
}

export function findProductOwnerships(
  ids: readonly string[],
): Promise<Map<string, ProductOwnershipRow>> {
  return supplierOwnershipRepository.findProductOwnerships(ids);
}

export function findCatalogOwnerships(
  input: CatalogOwnershipInput,
): Promise<Map<string, SupplierOwnershipRow>> {
  return supplierOwnershipRepository.findCatalogOwnerships(input);
}
