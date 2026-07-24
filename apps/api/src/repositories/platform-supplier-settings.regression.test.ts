import { describe, expect, mock, test } from "bun:test";

import { PlatformSuppliersRepository } from "./platform-suppliers";

const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const ACTOR_USER_ID = "00000000-0000-4000-8000-000000000401";
const ACTOR_EMPLOYEE_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-07-24T00:00:00.000Z";
const setting = {
  tenant_id: TENANT_ID,
  module_enabled: false,
  require_active_contract_for_new_order: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 2,
  created_at: NOW,
  updated_at: NOW,
};

describe("PlatformSuppliersRepository settings command", () => {
  test("passes the disable reason to the settings RPC", async () => {
    const rpc = mock(async () => ({
      data: {
        status: "updated",
        idempotent: false,
        setting,
        previous_setting: { ...setting, module_enabled: true, version: 1 },
        version: 2,
      },
      error: null,
    }));
    const repository = new PlatformSuppliersRepository(
      () => ({ rpc } as never),
    );

    await repository.setTenantSupplierSettings({
      tenant_id: TENANT_ID,
      module_enabled: false,
      require_active_contract_for_new_order: false,
      expected_version: 1,
      reason: "合作策略调整",
      actor_user_id: ACTOR_USER_ID,
      actor_employee_id: ACTOR_EMPLOYEE_ID,
      idempotency_key: "settings-disable-1",
    });

    expect(rpc).toHaveBeenCalledWith("set_tenant_supplier_module", {
      p_tenant_id: TENANT_ID,
      p_module_enabled: false,
      p_require_active_contract_for_new_order: false,
      p_expected_version: 1,
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "settings-disable-1",
      p_reason: "合作策略调整",
    });

    await repository.setTenantSupplierSettings({
      tenant_id: TENANT_ID,
      module_enabled: true,
      require_active_contract_for_new_order: false,
      expected_version: 2,
      actor_user_id: ACTOR_USER_ID,
      actor_employee_id: ACTOR_EMPLOYEE_ID,
      idempotency_key: "settings-enable-1",
    });

    expect(rpc).toHaveBeenLastCalledWith("set_tenant_supplier_module", {
      p_tenant_id: TENANT_ID,
      p_module_enabled: true,
      p_require_active_contract_for_new_order: false,
      p_expected_version: 2,
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "settings-enable-1",
      p_reason: null,
    });
  });
});
