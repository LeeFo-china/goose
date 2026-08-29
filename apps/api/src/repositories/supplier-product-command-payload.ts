const COMMAND_CONTEXT_KEYS = new Set([
  "tenant_id",
  "tenant_supplier_id",
  "supplier_id",
  "actor_user_id",
  "actor_employee_id",
  "idempotency_key",
  "expected_version",
  "action",
]);

type SupplierCommandActor = {
  tenant_id: string | null;
  tenant_supplier_id: string | null;
  supplier_id: string;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

export function supplierCommandBaseParams(
  scope: "platform" | "tenant",
  input: SupplierCommandActor,
) {
  return {
    p_ownership_scope: scope,
    p_tenant_id: input.tenant_id,
    p_tenant_supplier_id: input.tenant_supplier_id,
    p_supplier_id: input.supplier_id,
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  };
}

export function supplierProductCommandPayload(
  input: Record<string, unknown>,
  resourceKeys: string[],
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key]) =>
    !COMMAND_CONTEXT_KEYS.has(key) && !resourceKeys.includes(key)
  ));
}
