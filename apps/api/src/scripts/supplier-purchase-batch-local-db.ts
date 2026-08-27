declare const localSupplierPurchaseBatchDatabaseUrl: unique symbol;

export type LocalSupplierPurchaseBatchDatabaseUrl = string & {
  readonly [localSupplierPurchaseBatchDatabaseUrl]: true;
};

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_DATABASE_PORT = "54322";
const LOCAL_DATABASE_PATH = "/postgres";
const LOCAL_DATABASE_ERROR =
  "SUPPLIER_PURCHASE_BATCH_LOCAL_DATABASE_REQUIRED";

export function assertLocalSupplierPurchaseBatchDatabaseUrl(
  databaseUrl: string | undefined,
): LocalSupplierPurchaseBatchDatabaseUrl {
  if (!databaseUrl) throw new Error(LOCAL_DATABASE_ERROR);
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(LOCAL_DATABASE_ERROR);
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !LOCAL_DATABASE_HOSTS.has(parsed.hostname) ||
    parsed.port !== LOCAL_DATABASE_PORT ||
    parsed.pathname !== LOCAL_DATABASE_PATH ||
    parsed.search !== "" || parsed.hash !== ""
  ) throw new Error(LOCAL_DATABASE_ERROR);
  return databaseUrl as LocalSupplierPurchaseBatchDatabaseUrl;
}
