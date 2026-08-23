import type { CatalogSpecValue } from "@gooes/domain";

import { relationshipStatusMeta } from "@/components/suppliers/supplier-types";

import type {
  CatalogSpecDefinition,
  SupplierPriceList,
  SupplierProduct,
  SupplierProductSource,
  SupplierSku,
  SupplierSkuUnitConversionInput,
  TenantSupplierRelationship,
  UnitOption,
} from "./supplier-product-types";

export function canReadSupplierProductWorkspace({
  canViewProducts,
  canManageProducts,
  canViewCostPrice,
  canManageCostPrice,
}: {
  canViewProducts: boolean;
  canManageProducts: boolean;
  canViewCostPrice: boolean;
  canManageCostPrice: boolean;
}) {
  return canViewProducts || canManageProducts || canViewCostPrice ||
    canManageCostPrice;
}

export function shouldLoadPriceLists(
  canViewCostPrice: boolean,
  tenantSupplierId: string | null,
) {
  return canViewCostPrice && Boolean(tenantSupplierId);
}

export function supplierProductSource(
  product: Pick<SupplierProduct, "ownership_scope">,
): SupplierProductSource {
  return product.ownership_scope === "platform"
    ? "platform_shared"
    : "tenant_private";
}

export function relationshipIsWritable(
  relationship: TenantSupplierRelationship,
) {
  const tenantOwnedPrivateSupplier =
    relationship.supplier.ownership_scope === "tenant" &&
    relationship.supplier.owner_tenant_id === relationship.tenant_id;
  const platformReady =
    relationship.supplier.onboarding_status === "approved" &&
    relationship.supplier.operational_status === "active";
  const privateReady = tenantOwnedPrivateSupplier &&
    relationship.supplier.operational_status === "active";
  return relationship.relationship_status === "active" &&
    (platformReady || privateReady);
}

export function relationshipReadOnlyMessage(
  relationship: TenantSupplierRelationship,
): string | null {
  if (relationshipIsWritable(relationship)) return null;
  const status = relationshipStatusMeta[relationship.relationship_status].label;
  return `当前合作状态为“${status}”，仅保留历史只读；不能新增、编辑、定价或创建新采购。`;
}

export function getProductWriteState({
  canManage,
  relationship,
  product,
}: {
  canManage: boolean;
  relationship: TenantSupplierRelationship;
  product?: SupplierProduct | null;
}) {
  if (!canManage) return { writable: false, reason: "缺少商品管理权限" };
  const relationshipReason = relationshipReadOnlyMessage(relationship);
  if (relationshipReason) {
    return { writable: false, reason: relationshipReason };
  }
  if (product?.ownership_scope === "platform") {
    return { writable: false, reason: "平台共享商品只读" };
  }
  return { writable: true, reason: null };
}

export function getPriceWriteState({
  canManage,
  relationship,
}: {
  canManage: boolean;
  relationship: TenantSupplierRelationship;
}) {
  if (!canManage) return { writable: false, reason: "缺少采购价管理权限" };
  const relationshipReason = relationshipReadOnlyMessage(relationship);
  return relationshipReason
    ? { writable: false, reason: relationshipReason }
    : { writable: true, reason: null };
}

export function nextProductAction(product: SupplierProduct) {
  return product.status === "active" ? "deactivate" : "activate";
}

export function nextSkuAction(sku: SupplierSku) {
  return sku.status === "active" ? "deactivate" : "activate";
}

export function canEditPriceList(priceList: SupplierPriceList) {
  return priceList.lifecycle_status === "draft";
}

export function buildSuggestedSkuName(
  product: Pick<SupplierProduct, "name" | "brand">,
  definitions: CatalogSpecDefinition[],
  values: Record<string, CatalogSpecValue>,
) {
  const pieces = [product.brand.name, product.name];
  for (const definition of [...definitions].sort(
    (left, right) => left.sort_order - right.sort_order,
  )) {
    if (!definition.participates_in_sku_name) continue;
    const value = values[definition.code];
    const text = Array.isArray(value) ? value.join("、") : String(value ?? "").trim();
    if (text && !pieces.includes(text)) pieces.push(text);
  }
  return pieces.filter(Boolean).join(" ");
}

export function summarizeUnitConversionChain(
  edges: SupplierSkuUnitConversionInput[],
  units: UnitOption[],
  startUnitId: string,
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const validEdges = edges.filter((edge) =>
    edge.from_unit_id && edge.to_unit_id && positiveDecimal(edge.factor));
  const segments = [`1 ${byId.get(startUnitId)?.name ?? "?"}`];
  const visited = new Set<string>();
  let currentId = startUnitId;
  let cumulative = "1";
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const outgoing = validEdges.filter(({ from_unit_id }) => from_unit_id === currentId);
    if (outgoing.length !== 1) break;
    const edge = outgoing[0];
    cumulative = multiplyDecimals(cumulative, edge.factor);
    segments.push(`${cumulative} ${byId.get(edge.to_unit_id)?.name ?? "?"}`);
    currentId = edge.to_unit_id;
  }
  return segments.length > 1 ? segments.join(" = ") : "尚未形成可解释换算链";
}

export function positiveDecimal(value: string) {
  return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value) &&
    !/^0(?:\.0+)?$/.test(value);
}

export function unitConversionChainError(
  edges: SupplierSkuUnitConversionInput[],
  purchaseUnitId: string,
  baseUnitId: string,
): string | null {
  if (!purchaseUnitId || !baseUnitId) return "请选择采购单位和库存基本单位";
  if (edges.length > 100) return "单位换算边不能超过 100 条";

  const outgoing = new Map<string, SupplierSkuUnitConversionInput>();
  const incoming = new Set<string>();
  for (const edge of edges) {
    if (!edge.from_unit_id || !edge.to_unit_id || !positiveDecimal(edge.factor)) {
      return "请完整填写每条换算边和正数换算系数";
    }
    if (edge.from_unit_id === edge.to_unit_id) return "换算边不能连接相同单位";
    if (outgoing.has(edge.from_unit_id)) return "单位换算链不能分叉";
    if (incoming.has(edge.to_unit_id)) return "单位换算链不能合流";
    outgoing.set(edge.from_unit_id, edge);
    incoming.add(edge.to_unit_id);
  }

  const visited = new Set([purchaseUnitId]);
  let current = purchaseUnitId;
  let traversed = 0;
  let reachedBase = current === baseUnitId;
  while (outgoing.has(current)) {
    const edge = outgoing.get(current)!;
    if (visited.has(edge.to_unit_id)) return "单位换算链不能形成循环";
    visited.add(edge.to_unit_id);
    current = edge.to_unit_id;
    traversed += 1;
    if (current === baseUnitId) reachedBase = true;
  }
  if (traversed !== edges.length) return "所有换算边必须从采购单位形成一条连续链";
  if (!reachedBase) return "单位换算链必须包含库存基本单位";
  return null;
}

function multiplyDecimals(left: string, right: string) {
  const first = decimalParts(left);
  const second = decimalParts(right);
  const value = first.value * second.value;
  const scale = first.scale + second.scale;
  const padded = value.toString().padStart(scale + 1, "0");
  if (scale === 0) return padded;
  const integer = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function decimalParts(value: string) {
  const [integer, fraction = ""] = value.split(".");
  return {
    value: BigInt(`${integer}${fraction}`),
    scale: fraction.length,
  };
}

export function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
