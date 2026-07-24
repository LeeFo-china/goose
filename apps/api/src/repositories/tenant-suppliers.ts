import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  SupplierCommandContext,
} from "@/schema/platform-suppliers";
import type {
  SupplierContractCreateCommand,
  SupplierContractLifecycleCommand,
  SupplierContractUpdateCommand,
  TenantOwnedId,
  TenantSupplierChildPageInput,
  TenantSupplierContractPolicyCommand,
  TenantSupplierCreateCommand,
  TenantSupplierDirectoryInput,
  TenantSupplierLifecycleCommand,
  TenantSupplierListInput,
  TenantSupplierUpdateCommand,
} from "@/schema/tenant-suppliers";
import { SupabaseDB } from "@/utils/supabase";

import {
  CONTRACT_SELECT,
  ContractSchema,
  DirectoryEnvelopeSchema,
  EligibilitySchema,
  EVENT_SELECT,
  EventSchema,
  MutationEnvelopeSchema,
  RELATIONSHIP_SELECT,
  RelationshipPageEnvelopeSchema,
  RelationshipSchema,
  SETTINGS_SELECT,
  SettingsSchema,
  compact,
  envelopeToPage,
  normalizePage,
  parse,
  sanitizeKeyword,
  toPage,
  toRange,
  versionConflict,
  type SupplierContract,
  type SupplierContractMutationResult,
  type SupplierContractPage,
  type SupplierDirectoryPage,
  type SupplierEventPage,
  type SupplierOrderEligibility,
  type TenantSupplierDetail,
  type TenantSupplierListItem,
  type TenantSupplierMutationResult,
  type TenantSupplierPage,
  type TenantSupplierSettings,
} from "./tenant-suppliers-mappers";

export type {
  SupplierContract,
  SupplierContractMutationResult,
  SupplierContractPage,
  SupplierDirectoryPage,
  SupplierEventPage,
  SupplierOrderEligibility,
  TenantSupplierDetail,
  TenantSupplierListItem,
  TenantSupplierMutationResult,
  TenantSupplierPage,
  TenantSupplierSettings,
} from "./tenant-suppliers-mappers";

export type AtomicSupplierContractCreateCommand =
  SupplierContractCreateCommand &
  SupplierCommandContext & {
    contract_id: string;
  };
export type AtomicSupplierContractLifecycleCommand =
  SupplierContractLifecycleCommand & {
    tenant_supplier_id: string;
  };

export interface TenantSuppliersRepositoryPort {
  getSettings(tenantId: string): Promise<TenantSupplierSettings | null>;
  updateContractPolicy(input: TenantSupplierContractPolicyCommand):
    Promise<TenantSupplierSettings>;
  listRelationships(input: TenantSupplierListInput): Promise<TenantSupplierPage>;
  listDirectory(input: TenantSupplierDirectoryInput): Promise<SupplierDirectoryPage>;
  findRelationship(input: TenantOwnedId): Promise<TenantSupplierDetail | null>;
  createRelationship(input: TenantSupplierCreateCommand):
    Promise<TenantSupplierMutationResult>;
  updateRelationship(input: TenantSupplierUpdateCommand):
    Promise<TenantSupplierMutationResult>;
  mutateRelationship(input: TenantSupplierLifecycleCommand):
    Promise<TenantSupplierMutationResult>;
  getOrderEligibility(input: TenantOwnedId): Promise<SupplierOrderEligibility>;
  listContracts(input: TenantSupplierChildPageInput): Promise<SupplierContractPage>;
  createContract(input: AtomicSupplierContractCreateCommand):
    Promise<SupplierContractMutationResult>;
  updateContract(input: SupplierContractUpdateCommand): Promise<SupplierContract>;
  mutateContract(input: AtomicSupplierContractLifecycleCommand):
    Promise<SupplierContractMutationResult>;
  listEvents(input: TenantSupplierChildPageInput): Promise<SupplierEventPage>;
}

type Result = { data: unknown; error: unknown; count: number | null };
type Query = {
  select: (...args: unknown[]) => Query;
  update: (value: Record<string, unknown>) => Query;
  eq: (column: string, value: unknown) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<Result>["then"];
};
type Client = {
  from: (table: string) => Query;
  rpc: (name: string, params: Record<string, unknown>) => Query;
};

export class TenantSuppliersRepository implements TenantSuppliersRepositoryPort {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client() {
    return this.clientProvider();
  }

  async getSettings(tenantId: string) {
    const { data, error } = await this.client.from("tenant_supplier_settings")
      .select(SETTINGS_SELECT)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询租户供应商设置失败", error);
    return data === null
      ? null
      : parse(SettingsSchema, data, "查询租户供应商设置失败");
  }

  async updateContractPolicy(input: TenantSupplierContractPolicyCommand) {
    const { data, error } = await this.client.from("tenant_supplier_settings")
      .update({
        require_active_contract_for_new_order:
          input.require_active_contract_for_new_order,
        version: input.expected_version + 1,
      })
      .eq("tenant_id", input.tenant_id)
      .eq("version", input.expected_version)
      .select(SETTINGS_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新供应商合同策略失败", error);
    if (data === null) throw versionConflict();
    return parse(SettingsSchema, data, "更新供应商合同策略失败");
  }

  async listRelationships(input: TenantSupplierListInput) {
    const pagination = normalizePage(input);
    const envelope = parse(
      RelationshipPageEnvelopeSchema,
      await this.rpc("list_tenant_suppliers_for_tenant", {
        p_tenant_id: input.tenant_id,
        p_keyword: sanitizeKeyword(input.keyword) || null,
        p_relationship_status: input.relationship_status ?? null,
        p_eligible: input.eligible ?? null,
        p_checked_at: new Date().toISOString(),
        p_page: pagination.page,
        p_page_size: pagination.pageSize,
      }, "查询租户供应商列表失败"),
      "查询租户供应商列表失败",
    );
    return envelopeToPage(envelope);
  }

  async listDirectory(input: TenantSupplierDirectoryInput) {
    const pagination = normalizePage(input);
    const envelope = parse(
      DirectoryEnvelopeSchema,
      await this.rpc("list_available_suppliers_for_tenant", {
        p_tenant_id: input.tenant_id,
        p_keyword: sanitizeKeyword(input.keyword) || null,
        p_page: pagination.page,
        p_page_size: pagination.pageSize,
      }, "查询可合作供应商目录失败"),
      "查询可合作供应商目录失败",
    );
    return envelopeToPage(envelope);
  }

  async findRelationship(input: TenantOwnedId) {
    const { data, error } = await this.client.from("tenant_suppliers")
      .select(RELATIONSHIP_SELECT)
      .eq("tenant_id", input.tenant_id)
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw Errors.dbError("查询租户供应商详情失败", error);
    return data === null
      ? null
      : parse(RelationshipSchema, data, "查询租户供应商详情失败");
  }

  createRelationship(input: TenantSupplierCreateCommand) {
    return this.mutationRpc("create_tenant_supplier", {
      p_tenant_supplier_id: input.tenant_supplier_id,
      p_tenant_id: input.tenant_id,
      p_supplier_id: input.supplier_id,
      p_expected_version: 0,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    }, "关联租户供应商失败");
  }

  async updateRelationship(input: TenantSupplierUpdateCommand) {
    const {
      tenant_id,
      tenant_supplier_id,
      expected_version,
      updated_by_employee_id,
      ...fields
    } = input;
    const { data, error } = await this.client.from("tenant_suppliers")
      .update(compact({
        ...fields,
        updated_by_employee_id,
        version: expected_version + 1,
      }))
      .eq("tenant_id", tenant_id)
      .eq("id", tenant_supplier_id)
      .eq("version", expected_version)
      .select(RELATIONSHIP_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新租户供应商失败", error);
    if (data === null) {
      return await this.findRelationship({ tenant_id, id: tenant_supplier_id })
        ? conflictResult("version_conflict", "SUPPLIER_VERSION_CONFLICT")
        : conflictResult(
          "tenant_supplier_not_found",
          "TENANT_SUPPLIER_NOT_FOUND",
        );
    }
    const tenantSupplier = parse(
      RelationshipSchema,
      data,
      "更新租户供应商失败",
    );
    if (tenantSupplier.tenant_id !== tenant_id) {
      throw Errors.dbError("更新租户供应商返回了错误的租户数据");
    }
    return {
      status: "updated" as const,
      idempotent: false,
      tenant_supplier: tenantSupplier,
      version: tenantSupplier.version,
    };
  }

  mutateRelationship(input: TenantSupplierLifecycleCommand) {
    return this.mutationRpc("mutate_tenant_supplier", {
      p_tenant_id: input.tenant_id,
      p_tenant_supplier_id: input.tenant_supplier_id,
      p_action: input.action,
      p_expected_version: input.expected_version,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
      p_reason: input.reason ?? null,
    }, "变更租户供应商状态失败");
  }

  async getOrderEligibility(input: TenantOwnedId) {
    return parse(
      EligibilitySchema,
      await this.rpc("get_tenant_supplier_order_eligibility", {
        p_tenant_id: input.tenant_id,
        p_tenant_supplier_id: input.id,
        p_checked_at: new Date().toISOString(),
      }, "查询供应商下单资格失败"),
      "查询供应商下单资格失败",
    );
  }

  listContracts(input: TenantSupplierChildPageInput) {
    return this.listChildren(
      "supplier_contracts",
      CONTRACT_SELECT,
      ContractSchema,
      input,
      "查询供应商合同失败",
    );
  }

  createContract(input: AtomicSupplierContractCreateCommand) {
    return this.mutationRpc("create_supplier_contract", {
      p_contract_id: input.contract_id,
      p_tenant_id: input.tenant_id,
      p_tenant_supplier_id: input.tenant_supplier_id,
      p_contract_no: input.contract_no,
      p_name: input.name,
      p_valid_from: input.valid_from,
      p_valid_until: input.valid_until,
      p_settlement_term_days: input.settlement_term_days,
      p_invoice_required_before_payment: input.invoice_required_before_payment,
      p_document_file_id: input.document_file_id,
      p_expected_version: 0,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    }, "新增供应商合同失败");
  }

  async updateContract(input: SupplierContractUpdateCommand) {
    const {
      tenant_id,
      tenant_supplier_id,
      contract_id,
      expected_version,
      updated_by_employee_id,
      ...fields
    } = input;
    const { data, error } = await this.client.from("supplier_contracts")
      .update(compact({
        ...fields,
        updated_by_employee_id,
        version: expected_version + 1,
      }))
      .eq("tenant_id", tenant_id)
      .eq("tenant_supplier_id", tenant_supplier_id)
      .eq("id", contract_id)
      .eq("version", expected_version)
      .select(CONTRACT_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新供应商合同失败", error);
    if (data === null) throw versionConflict();
    return parse(ContractSchema, data, "更新供应商合同失败");
  }

  mutateContract(input: AtomicSupplierContractLifecycleCommand) {
    return this.mutationRpc("mutate_supplier_contract", {
      p_tenant_id: input.tenant_id,
      p_tenant_supplier_id: input.tenant_supplier_id,
      p_contract_id: input.contract_id,
      p_action: input.action,
      p_expected_version: input.expected_version,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
      p_reason: input.reason ?? null,
    }, "变更供应商合同状态失败");
  }

  async listEvents(input: TenantSupplierChildPageInput) {
    const pagination = normalizePage(input);
    const { start, end } = toRange(pagination);
    const { data, error, count } = await this.client
      .from("supplier_command_events")
      .select(EVENT_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenant_id)
      .eq("resource_type", "tenant_supplier")
      .eq("resource_id", input.tenant_supplier_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, end);
    if (error) throw Errors.dbError("查询租户供应商操作记录失败", error);
    return toPage(
      parse(z.array(EventSchema), data ?? [],
        "查询租户供应商操作记录失败"),
      pagination,
      count,
    );
  }

  private async listChildren<T>(
    table: string,
    select: string,
    schema: z.ZodType<T>,
    input: TenantSupplierChildPageInput,
    message: string,
  ) {
    const pagination = normalizePage(input);
    const { start, end } = toRange(pagination);
    const { data, error, count } = await this.client.from(table)
      .select(select, { count: "exact" })
      .eq("tenant_id", input.tenant_id)
      .eq("tenant_supplier_id", input.tenant_supplier_id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, end);
    if (error) throw Errors.dbError(message, error);
    return toPage(
      parse(z.array(schema), data ?? [], message),
      pagination,
      count,
    );
  }

  private async mutationRpc(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ) {
    return parse(
      MutationEnvelopeSchema,
      await this.rpc(name, params, message),
      message,
    );
  }

  private async rpc(
    name: string,
    params: Record<string, unknown>,
    message: string,
  ) {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throw Errors.dbError(message, error);
    return data;
  }
}

function conflictResult(
  status: "tenant_supplier_not_found" | "version_conflict",
  errorCode: string,
) {
  return { status, error_code: errorCode } as const;
}

export const tenantSuppliersRepository = new TenantSuppliersRepository();
