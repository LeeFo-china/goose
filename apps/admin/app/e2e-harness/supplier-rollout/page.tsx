import { notFound } from "next/navigation";

import { TenantSupplierSettingsCard } from "@/components/platform-tenants/tenant-supplier-settings-card";
import type { TenantSupplierSettings } from "@/components/suppliers/supplier-types";

const TEST_TENANT_ID = "91000000-0000-4000-8000-000000000001";

function initialSettings(level: number): TenantSupplierSettings {
  const now = "2026-08-13T10:00:00.000Z";
  return {
    tenant_id: TEST_TENANT_ID,
    module_enabled: level >= 1,
    require_active_contract_for_new_order: false,
    ownership_reads_enabled: level >= 2,
    private_supplier_writes_enabled: level >= 3,
    private_catalog_writes_enabled: level >= 4,
    procurement_snapshot_v1_enabled: level >= 5,
    enabled_by_employee_id: level >= 1
      ? "91000000-0000-4000-8000-000000000002"
      : null,
    enabled_at: level >= 1 ? now : null,
    version: level,
    created_at: now,
    updated_at: now,
  };
}

function rolloutLevel(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 5 ? parsed : 0;
}

export default async function SupplierRolloutTestHarness({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.GOOES_E2E_TEST_HARNESS !== "1") notFound();

  const params = await searchParams;
  const level = rolloutLevel(params.level);
  const canManage = params.readonly !== "1";

  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">供应商灰度测试台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            仅用于确定性端到端测试，不加入生产导航。
          </p>
        </div>
        <TenantSupplierSettingsCard
          tenantId={TEST_TENANT_ID}
          initialSettings={initialSettings(level)}
          canManage={canManage}
        />
      </div>
    </main>
  );
}
