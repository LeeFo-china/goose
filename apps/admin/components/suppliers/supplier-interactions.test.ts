import { afterEach, describe, expect, test } from "bun:test";

import {
  loadPlatformTenantSupplierSettings,
  loadTenantSupplierSettings,
  updatePlatformTenantSupplierModule,
  updateTenantSupplierContractPolicy,
} from "./supplier-settings-api";
import {
  contractHealthMeta,
  currentSelectedRelationship,
  type TenantSupplierRelationship,
  type TenantSupplierSettings,
} from "./supplier-types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function settings(
  overrides: Partial<TenantSupplierSettings> = {},
): TenantSupplierSettings {
  return {
    tenant_id: "tenant-1",
    module_enabled: false,
    require_active_contract_for_new_order: false,
    ownership_reads_enabled: false,
    private_supplier_writes_enabled: false,
    private_catalog_writes_enabled: false,
    procurement_snapshot_v1_enabled: false,
    enabled_by_employee_id: null,
    enabled_at: null,
    version: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function relationship(id: string): TenantSupplierRelationship {
  return {
    id,
    tenant_id: "tenant-1",
    supplier_id: `supplier-${id}`,
    relationship_status: "active",
    settlement_term_days: 30,
    credit_limit_minor: 0,
    invoice_required_before_payment: true,
    default_currency: "CNY",
    default_tax_inclusive: true,
    tenant_owner_employee_id: null,
    started_at: null,
    ended_at: null,
    remark: null,
    version: 1,
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
    contract_health: "valid",
    supplier: {
      id: `supplier-${id}`,
      code: `S-${id}`,
      name: `供应商 ${id}`,
      legal_name: `供应商 ${id}`,
      supplier_type: "manufacturer",
      onboarding_status: "approved",
      operational_status: "active",
      version: 1,
    },
  };
}

describe("供应商设置运行时交互", () => {
  test("首次启用使用 expected_version 0，并发送独立幂等键", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({
        success: true,
        data: settings({ module_enabled: true, version: 1 }),
      });
    }) as typeof fetch;

    await updatePlatformTenantSupplierModule({
      tenantId: "tenant-1",
      current: settings(),
      intent: { moduleEnabled: true },
      idempotencyKey: "module-key-1",
    });

    expect(String(calls[0]?.input)).toBe(
      "/api/backend/platform/tenant-supplier-settings/tenant-1",
    );
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      module_enabled: true,
      require_active_contract_for_new_order: false,
      ownership_reads_enabled: false,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
      expected_version: 0,
    });
    expect(new Headers(calls[0]?.init?.headers).get("Idempotency-Key")).toBe(
      "module-key-1",
    );
  });

  test("停用保留原始操作意图、原因和幂等键，不受刷新后状态影响", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({
        success: true,
        data: settings({ module_enabled: false, version: 5 }),
      });
    }) as typeof fetch;

    await updatePlatformTenantSupplierModule({
      tenantId: "tenant-1",
      current: settings({
        module_enabled: false,
        require_active_contract_for_new_order: true,
        version: 4,
      }),
      intent: { moduleEnabled: false, reason: "合同结清后停用" },
      idempotencyKey: "module-key-disable",
    });

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      module_enabled: false,
      require_active_contract_for_new_order: true,
      ownership_reads_enabled: false,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
      expected_version: 4,
      reason: "合同结清后停用",
    });
    expect(new Headers(calls[0]?.init?.headers).get("Idempotency-Key")).toBe(
      "module-key-disable",
    );
  });

  test("配置加载失败后可再次调用并恢复最新数据", async () => {
    let attempts = 0;
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse({ success: false, message: "暂时不可用" }, 503);
      }
      return jsonResponse({
        success: true,
        data: settings({ module_enabled: true, version: 2 }),
      });
    }) as typeof fetch;

    await expect(
      loadPlatformTenantSupplierSettings("tenant-1"),
    ).rejects.toThrow("暂时不可用");
    const latest = await loadPlatformTenantSupplierSettings("tenant-1");

    expect(attempts).toBe(2);
    expect(latest?.module_enabled).toBe(true);
    expect(latest?.version).toBe(2);
  });

  test("单次 rollout 操作发送一个目标变化和完整当前状态", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({
        success: true,
        data: settings({
          module_enabled: true,
          ownership_reads_enabled: true,
          version: 3,
        }),
      });
    }) as typeof fetch;

    await updatePlatformTenantSupplierModule({
      tenantId: "tenant-1",
      current: settings({ module_enabled: true, version: 2 }),
      intent: { moduleEnabled: true, ownershipReadsEnabled: true },
      idempotencyKey: "rollout-ownership-1",
    });

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      module_enabled: true,
      require_active_contract_for_new_order: false,
      ownership_reads_enabled: true,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
      expected_version: 2,
    });
    expect(new Headers(calls[0]?.init?.headers).get("Idempotency-Key")).toBe(
      "rollout-ownership-1",
    );
  });

  test("租户合同策略只发送策略值和乐观锁版本", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({
        success: true,
        data: settings({
          module_enabled: true,
          require_active_contract_for_new_order: true,
          version: 7,
        }),
      });
    }) as typeof fetch;

    await updateTenantSupplierContractPolicy({
      requireActiveContract: true,
      expectedVersion: 6,
    });

    expect(String(calls[0]?.input)).toBe(
      "/api/backend/supplier-settings/contract-policy",
    );
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      require_active_contract_for_new_order: true,
      expected_version: 6,
    });
    expect(new Headers(calls[0]?.init?.headers).has("Idempotency-Key")).toBe(
      false,
    );
  });

  test("平台 409 刷新后仍重试原停用意图", async () => {
    const patchBodies: unknown[] = [];
    let patchAttempts = 0;
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "PATCH") {
        patchAttempts += 1;
        patchBodies.push(JSON.parse(String(init.body)));
        if (patchAttempts === 1) {
          return jsonResponse(
            { success: false, message: "数据版本已变化" },
            409,
          );
        }
        return jsonResponse({
          success: true,
          data: settings({ module_enabled: false, version: 4 }),
        });
      }
      expect(String(input)).toBe(
        "/api/backend/platform/tenant-supplier-settings/tenant-1",
      );
      return jsonResponse({
        success: true,
        data: settings({ module_enabled: false, version: 3 }),
      });
    }) as typeof fetch;
    const intent = { moduleEnabled: false, reason: "停止供应商采购" };

    await expect(updatePlatformTenantSupplierModule({
      tenantId: "tenant-1",
      current: settings({ module_enabled: true, version: 2 }),
      intent,
      idempotencyKey: "same-operation-key",
    })).rejects.toThrow("数据版本已变化");
    const latest = await loadPlatformTenantSupplierSettings("tenant-1");
    await updatePlatformTenantSupplierModule({
      tenantId: "tenant-1",
      current: latest!,
      intent,
      idempotencyKey: "same-operation-key",
    });

    expect(patchBodies).toEqual([
      {
        module_enabled: false,
        require_active_contract_for_new_order: false,
        ownership_reads_enabled: false,
        private_supplier_writes_enabled: false,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
        expected_version: 2,
        reason: "停止供应商采购",
      },
      {
        module_enabled: false,
        require_active_contract_for_new_order: false,
        ownership_reads_enabled: false,
        private_supplier_writes_enabled: false,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
        expected_version: 3,
        reason: "停止供应商采购",
      },
    ]);
  });

  test("合同策略 409 刷新后仍重试原策略意图", async () => {
    const patchBodies: unknown[] = [];
    let patchAttempts = 0;
    globalThis.fetch = (async (_input, init) => {
      if (init?.method === "PATCH") {
        patchAttempts += 1;
        patchBodies.push(JSON.parse(String(init.body)));
        if (patchAttempts === 1) {
          return jsonResponse(
            { success: false, message: "数据版本已变化" },
            409,
          );
        }
        return jsonResponse({
          success: true,
          data: settings({
            module_enabled: true,
            require_active_contract_for_new_order: true,
            version: 10,
          }),
        });
      }
      return jsonResponse({
        success: true,
        data: settings({ module_enabled: true, version: 9 }),
      });
    }) as typeof fetch;

    await expect(updateTenantSupplierContractPolicy({
      requireActiveContract: true,
      expectedVersion: 8,
    })).rejects.toThrow("数据版本已变化");
    const latest = await loadTenantSupplierSettings();
    await updateTenantSupplierContractPolicy({
      requireActiveContract: true,
      expectedVersion: latest.version,
    });

    expect(patchBodies).toEqual([
      {
        require_active_contract_for_new_order: true,
        expected_version: 8,
      },
      {
        require_active_contract_for_new_order: true,
        expected_version: 9,
      },
    ]);
  });
});

describe("合作供应商列表运行时规则", () => {
  test("合同健康直接映射后端枚举，不从准入资格推断", () => {
    expect(contractHealthMeta.valid).toEqual({
      label: "有效",
      variant: "success",
    });
    expect(contractHealthMeta.expiring).toEqual({
      label: "即将到期",
      variant: "warning",
    });
    expect(contractHealthMeta.expired).toEqual({
      label: "已过期",
      variant: "danger",
    });
    expect(contractHealthMeta.missing).toEqual({
      label: "缺失",
      variant: "secondary",
    });
  });

  test("详情始终从最新列表按 ID 派生，记录移出时自动关闭", () => {
    const first = relationship("one");
    const refreshed = { ...first, settlement_term_days: 45 };

    expect(currentSelectedRelationship([first], "one")).toBe(first);
    expect(currentSelectedRelationship([refreshed], "one")).toBe(refreshed);
    expect(currentSelectedRelationship([], "one")).toBeNull();
    expect(currentSelectedRelationship([first], null)).toBeNull();
  });
});
