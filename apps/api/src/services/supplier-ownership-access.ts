import type {
  SupplierOwnershipRef,
  TenantSupplierRelationshipStatus,
} from "@gooes/domain";

export type SupplierAccessDecisionReason =
  | "allowed"
  | "foreign_tenant"
  | "inactive_relationship"
  | "platform_read_only"
  | "permission_denied";

export type SupplierAccessDecision = {
  visible: boolean;
  writable: boolean;
  historicalOnly: boolean;
  reason: SupplierAccessDecisionReason;
};

export type SupplierAccessActor =
  | { kind: "platform"; tenantId: null }
  | { kind: "tenant"; tenantId: string };

export type SupplierOwnershipAccessInput = {
  actor: SupplierAccessActor;
  resourceKind: "supplier" | "product" | "catalog";
  ownership: SupplierOwnershipRef;
  relationshipStatus: TenantSupplierRelationshipStatus | null;
  operation: "read" | "write";
  permissionGranted: boolean;
};

const denied = (
  reason: Exclude<SupplierAccessDecisionReason, "allowed">,
  options: { visible?: boolean; historicalOnly?: boolean } = {},
): SupplierAccessDecision => ({
  visible: options.visible ?? false,
  writable: false,
  historicalOnly: options.historicalOnly ?? false,
  reason,
});

export function resolveSupplierOwnershipAccess(
  input: SupplierOwnershipAccessInput,
): SupplierAccessDecision {
  if (!input.permissionGranted) return denied("permission_denied");

  if (input.ownership.ownershipScope === "tenant") {
    if (
      input.actor.kind === "platform" ||
      input.ownership.ownerTenantId !== input.actor.tenantId
    ) {
      return denied("foreign_tenant");
    }
  }

  if (input.resourceKind === "product" && input.actor.kind === "tenant") {
    if (input.relationshipStatus === null) {
      return denied("inactive_relationship");
    }
    if (input.relationshipStatus !== "active") {
      return denied("inactive_relationship", {
        visible: true,
        historicalOnly: true,
      });
    }
  }

  if (
    input.operation === "write" &&
    input.actor.kind === "tenant" &&
    input.ownership.ownershipScope === "platform"
  ) {
    return denied("platform_read_only", { visible: true });
  }

  return {
    visible: true,
    writable: input.operation === "write",
    historicalOnly: false,
    reason: "allowed",
  };
}
