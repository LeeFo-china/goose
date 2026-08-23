import { requestBackendJson } from "@/lib/backend-client";

export type SupplierCodeState =
  | {
    code_source: "generated";
    internal_supplier_code: string;
    allocation_id: string;
  }
  | {
    code_source: "manual";
    internal_supplier_code: string;
  };

export type SupplierCodeAllocation = {
  allocation_id: string;
  code: string;
  idempotent: boolean;
};

export function manualSupplierCodeState(value: string): SupplierCodeState {
  return {
    code_source: "manual",
    internal_supplier_code: value.trim().toUpperCase(),
  };
}

export function allocateTenantSupplierCode(idempotencyKey: string) {
  return requestBackendJson<SupplierCodeAllocation>(
    "/suppliers/code-allocations",
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({}),
      fallbackMessage: "生成供应商内部编码失败",
    },
  );
}

export function createTenantSharedRelationship(
  input: SupplierCodeState & { supplier_id: string },
  idempotencyKey: string,
) {
  return requestBackendJson("/suppliers", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
    fallbackMessage: "添加平台共享供应商失败",
  });
}

export function createTenantPrivateSupplier(
  input: {
    name: string;
    primary_contact?: {
      name: string;
      phone?: string | null;
      email?: string | null;
    };
  },
  idempotencyKey: string,
) {
  return requestBackendJson("/suppliers/private", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
    fallbackMessage: "新建租户私有供应商失败",
  });
}

export function isSupplierCodeConflict(error: unknown) {
  return typeof error === "object" && error !== null &&
    "code" in error && [
      "SUPPLIER_CODE_CONFLICT",
      "SUPPLIER_CODE_ALLOCATION_CONFLICT",
    ].includes(String(error.code));
}

export function isSupplierIdentityConflict(error: unknown) {
  return typeof error === "object" && error !== null &&
    "code" in error && String(error.code) === "SUPPLIER_IDENTITY_CONFLICT";
}
