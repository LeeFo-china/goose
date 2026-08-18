import { createHash } from "node:crypto";

const SUPPLIER_CATALOG_NAMESPACE = Buffer.from(
  "a0b7f5f03e9e4cafa7140b46544143f7",
  "hex",
);

export type SupplierCatalogCommandIdFactory = (
  namespace: string,
  actorUserId: string,
  idempotencyKey: string,
) => string;

export const deriveSupplierCatalogCommandId: SupplierCatalogCommandIdFactory = (
  namespace,
  actorUserId,
  idempotencyKey,
) => {
  const bytes = createHash("sha1")
    .update(SUPPLIER_CATALOG_NAMESPACE)
    .update(namespace)
    .update("\0")
    .update(actorUserId)
    .update("\0")
    .update(idempotencyKey)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};
