import { describe, expect, test } from "bun:test";
import {
  ALLOCATION_ID,
  CONTRACT_ID,
  EMPLOYEE_ID,
  FILE_ID,
  OTHER_TENANT_ID,
  NOW,
  SUPPLIER_ID,
  TENANT_ID,
  TENANT_SUPPLIER_ID,
  USER_ID,
  contract,
  createRepository,
  directorySupplier,
  eligibility,
  event,
  privateRelationship,
  relationship,
  settings,
} from "./tenant-suppliers-test-support";

describe("TenantSuppliersRepository queries", () => {
  test("returns all rollout flags for tenant-side effective mapping", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: settings,
    }));

    const result = await repository.getSettings(TENANT_ID);

    expect(result).toMatchObject({
      ownership_reads_enabled: false,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
    });
    const url = new URL(requests[0]?.url ?? "http://invalid");
    for (const flag of [
      "ownership_reads_enabled",
      "private_supplier_writes_enabled",
      "private_catalog_writes_enabled",
      "procurement_snapshot_v1_enabled",
    ]) {
      expect(url.searchParams.get("select")).toContain(flag);
    }
  });

  test("uses one tenant-scoped RPC for exact eligibility-filtered pagination", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        items: [{ ...relationship, eligibility, contract_health: "valid" }],
        total: 37,
        page: 2,
        page_size: 100,
      },
    }));

    const result = await repository.listRelationships({
      tenant_id: TENANT_ID,
      relationship_status: "active",
      keyword: " 晴天,().%_ 建材 ",
      page: 2,
      pageSize: 500,
      eligible: false,
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 100,
      total: 37,
      totalPages: 1,
    });
    expect(result.list[0]?.eligibility?.eligible).toBe(true);
    expect(result.list[0]?.contract_health).toBe("valid");
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toContain(
      "/rest/v1/rpc/list_tenant_suppliers_for_tenant",
    );
    const body = await request.clone().json() as Record<string, unknown>;
    expect(body).toMatchObject({
      p_tenant_id: TENANT_ID,
      p_keyword: "晴天 建材",
      p_relationship_status: "active",
      p_eligible: false,
      p_page: 2,
      p_page_size: 100,
    });
    expect(typeof body.p_checked_at).toBe("string");
    expect(request.url).not.toContain("select=*");
  });

  test("uses the paginated directory RPC without loading linked supplier ids", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        items: [directorySupplier],
        total: 41,
        page: 3,
        page_size: 20,
      },
    }));

    const result = await repository.listDirectory({
      tenant_id: TENANT_ID,
      keyword: "晴天",
      page: 3,
      pageSize: 20,
    });

    expect(result.list).toEqual([directorySupplier]);
    expect(result.pagination).toEqual({
      page: 3,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toContain(
      "/rest/v1/rpc/list_available_suppliers_for_tenant",
    );
    expect(requests[0]!.url).not.toContain("/tenant_suppliers");
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_keyword: "晴天",
      p_page: 3,
      p_page_size: 20,
    });
  });

  test("rejects directory snapshots that are not platform-owned", async () => {
    const { repository } = await createRepository(() => ({
      body: {
        items: [{
          ...directorySupplier,
          ownership_scope: "tenant",
          owner_tenant_id: OTHER_TENANT_ID,
        }],
        total: 1,
        page: 1,
        page_size: 20,
      },
    }));

    await expect(repository.listDirectory({
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("rejects relationship snapshots owned by another tenant", async () => {
    const { repository } = await createRepository(() => ({
      body: {
        items: [{
          ...relationship,
          supplier: {
            ...relationship.supplier,
            ownership_scope: "tenant",
            owner_tenant_id: OTHER_TENANT_ID,
          },
          eligibility,
          contract_health: "valid",
        }],
        total: 1,
        page: 1,
        page_size: 20,
      },
    }));

    await expect(repository.listRelationships({
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("filters detail and child pages by both tenant and parent ownership", async () => {
    const { repository, requests } = await createRepository((request) => {
      if (request.url.includes("supplier_contracts")) {
        return { body: [contract], count: 21 };
      }
      if (request.url.includes("supplier_command_events")) {
        return { body: [event], count: 3 };
      }
      return { body: relationship };
    });

    expect((await repository.findRelationship({
      tenant_id: TENANT_ID,
      id: TENANT_SUPPLIER_ID,
    }))?.id).toBe(TENANT_SUPPLIER_ID);
    const contracts = await repository.listContracts({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      page: 2,
      pageSize: 20,
    });
    const events = await repository.listEvents({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });

    expect(contracts.pagination.total).toBe(21);
    expect(events.pagination.total).toBe(3);
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
      expect(url.searchParams.get("select")).not.toContain("*");
    }
    const contractUrl = new URL(requests[1]!.url);
    expect(contractUrl.searchParams.get("tenant_supplier_id"))
      .toBe(`eq.${TENANT_SUPPLIER_ID}`);
    expect(contractUrl.searchParams.get("offset")).toBe("20");
    expect(requests[1]!.headers.get("prefer")).toContain("count=exact");
    const eventUrl = new URL(requests[2]!.url);
    expect(eventUrl.searchParams.get("resource_id"))
      .toBe(`eq.${TENANT_SUPPLIER_ID}`);
    expect(eventUrl.searchParams.get("resource_type")).toBe("eq.tenant_supplier");
  });

  test("calls one eligibility RPC and retains every blocking reason", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        eligible: false,
        blocking_reasons: [
          "required_qualification_expired",
          "active_contract_required",
        ],
        checked_at: NOW,
        tenant_id: TENANT_ID,
        tenant_supplier_id: TENANT_SUPPLIER_ID,
        supplier_id: SUPPLIER_ID,
        supplier_version: 4,
        tenant_supplier_version: 2,
      },
    }));

    const result = await repository.getOrderEligibility({
      tenant_id: TENANT_ID,
      id: TENANT_SUPPLIER_ID,
    });

    expect(result.blocking_reasons).toEqual([
      "required_qualification_expired",
      "active_contract_required",
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toContain(
      "/rest/v1/rpc/get_tenant_supplier_order_eligibility",
    );
    const body = await requests[0]!.clone().json() as Record<string, unknown>;
    expect(body.p_tenant_id).toBe(TENANT_ID);
    expect(body.p_tenant_supplier_id).toBe(TENANT_SUPPLIER_ID);
    expect(typeof body.p_checked_at).toBe("string");
  });
});

describe("TenantSuppliersRepository writes", () => {
  test("updates relationship and contract with tenant, parent, and version guards", async () => {
    const { repository, requests } = await createRepository((request) => ({
      body: request.url.includes("supplier_contracts")
        ? { ...contract, name: "新版合同", version: 2 }
        : { ...relationship, remark: "核心伙伴", version: 2 },
    }));

    await repository.updateRelationship({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      expected_version: 1,
      remark: "核心伙伴",
      updated_by_employee_id: EMPLOYEE_ID,
    });
    await repository.updateContract({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      contract_id: CONTRACT_ID,
      expected_version: 1,
      name: "新版合同",
      updated_by_employee_id: EMPLOYEE_ID,
    });

    const relationshipUrl = new URL(requests[0]!.url);
    expect(relationshipUrl.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(relationshipUrl.searchParams.get("id"))
      .toBe(`eq.${TENANT_SUPPLIER_ID}`);
    expect(relationshipUrl.searchParams.get("version")).toBe("eq.1");
    const relationshipBody = await requests[0]!.clone().json();
    expect(relationshipBody).not.toHaveProperty("tenant_id");
    expect(relationshipBody).not.toHaveProperty("tenant_supplier_id");

    const contractUrl = new URL(requests[1]!.url);
    expect(contractUrl.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(contractUrl.searchParams.get("tenant_supplier_id"))
      .toBe(`eq.${TENANT_SUPPLIER_ID}`);
    expect(contractUrl.searchParams.get("id")).toBe(`eq.${CONTRACT_ID}`);
    expect(contractUrl.searchParams.get("version")).toBe("eq.1");
  });

  test("tenant blacklist uses only the tenant relationship command", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        status: "updated",
        idempotent: false,
        tenant_supplier: {
          ...relationship,
          relationship_status: "blacklisted",
          version: 2,
        },
        version: 2,
      },
    }));

    await repository.mutateRelationship({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      action: "blacklist",
      expected_version: 1,
      reason: "租户内部禁用",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "blacklist-1",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toContain("/rpc/mutate_tenant_supplier");
    expect(requests[0]!.url).not.toContain("mutate_platform_supplier");
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_tenant_supplier_id: TENANT_SUPPLIER_ID,
      p_action: "blacklist",
      p_expected_version: 1,
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "blacklist-1",
      p_reason: "租户内部禁用",
    });
  });

  test("contract policy updates cannot write module_enabled", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: { ...settings, require_active_contract_for_new_order: true, version: 2 },
    }));

    await repository.updateContractPolicy({
      tenant_id: TENANT_ID,
      require_active_contract_for_new_order: true,
      expected_version: 1,
    });

    expect(requests).toHaveLength(1);
    const body = await requests[0]!.clone().json();
    expect(body).toEqual({
      require_active_contract_for_new_order: true,
      version: 2,
    });
    expect(body).not.toHaveProperty("module_enabled");
  });

  test("creates contracts through the atomic idempotent RPC", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        status: "created",
        idempotent: false,
        contract,
        version: 1,
      },
    }));

    const result = await repository.createContract({
      contract_id: CONTRACT_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      contract_no: "HT-001",
      name: "年度采购合同",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
      settlement_term_days: 30,
      invoice_required_before_payment: true,
      document_file_id: FILE_ID,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "create-contract-1",
    });

    expect(result).toEqual({
      status: "created",
      idempotent: false,
      contract,
      version: 1,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toContain("/rpc/create_supplier_contract");
    expect(requests[0]!.url).not.toContain("/supplier_contracts?");
    expect(await requests[0]!.clone().json()).toMatchObject({
      p_contract_id: CONTRACT_ID,
      p_tenant_id: TENANT_ID,
      p_tenant_supplier_id: TENANT_SUPPLIER_ID,
      p_expected_version: 0,
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "create-contract-1",
    });
  });

  test("never accepts another tenant in a direct write", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: { ...relationship, tenant_id: OTHER_TENANT_ID },
    }));

    await expect(repository.updateRelationship({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      expected_version: 1,
      remark: "越权",
      updated_by_employee_id: EMPLOYEE_ID,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
    expect(new URL(requests[0]!.url).searchParams.get("tenant_id"))
      .toBe(`eq.${TENANT_ID}`);
  });
});
