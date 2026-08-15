import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import type { SupplierOnboardingCreateInput } from "@/schema/supplier-onboarding";
import { SupplierTypeSchema } from "@/schema/platform-suppliers";
import { SupabaseDB } from "@/utils/supabase";

const supplierSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  legal_name: z.string(),
  unified_social_credit_code: z.string().nullable(),
  supplier_type: SupplierTypeSchema,
  onboarding_status: z.literal("draft"),
  operational_status: z.literal("active"),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
}).passthrough();

const qualificationSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  document_file_id: z.uuid(),
  verification_status: z.literal("pending"),
  version: z.number().int().positive(),
}).passthrough();

const contactSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  contact_type: z.literal("primary"),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  is_primary: z.literal(true),
  version: z.number().int().positive(),
}).passthrough();

const resultSchema = z.object({
  status: z.literal("created"),
  idempotent: z.boolean(),
  version: z.literal(1),
  supplier: supplierSchema,
  qualification: qualificationSchema,
  primary_contact: contactSchema,
}).strict();

export type SupplierOnboardingCreateResult = z.infer<typeof resultSchema>;

export type SupplierOnboardingCreateCommand = SupplierOnboardingCreateInput & {
  supplier_id: string;
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
};

type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  limit: (count: number) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};
type Client = {
  from: (table: string) => Query;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export class SupplierOnboardingRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async create(input: SupplierOnboardingCreateCommand) {
    const { data, error } = await this.clientProvider().rpc(
      "create_supplier_onboarding",
      {
        p_supplier_id: input.supplier_id,
        p_name: input.name,
        p_legal_name: input.legal_name,
        p_unified_social_credit_code: input.unified_social_credit_code,
        p_supplier_type: input.supplier_type,
        p_legal_representative_name: input.legal_representative_name ?? null,
        p_registered_address_text: input.registered_address_text ?? null,
        p_license_file_id: input.license_file_id,
        p_ocr_recognition_id: input.ocr_recognition_id ?? null,
        p_license_valid_from: input.license_valid_from ?? null,
        p_license_valid_until: input.license_valid_until ?? null,
        p_primary_contact_name: input.primary_contact.name,
        p_primary_contact_phone: input.primary_contact.phone,
        p_primary_contact_email: input.primary_contact.email ?? null,
        p_expected_version: 0,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
    );
    if (error) throw error;

    const parsed = resultSchema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("供应商准入命令响应不符合契约", parsed.error.issues);
    }
    return parsed.data;
  }

  async findByCreditCode(unifiedSocialCreditCode: string) {
    const normalized = unifiedSocialCreditCode.trim().toUpperCase();
    const { data, error } = await this.clientProvider().from("suppliers")
      .select("id,code,name,legal_name,unified_social_credit_code")
      .eq("unified_social_credit_code", normalized)
      .eq("ownership_scope", "platform")
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商信用代码失败", error);
    return data as {
      id: string;
      code: string;
      name: string;
      legal_name: string;
      unified_social_credit_code: string | null;
    } | null;
  }
}

export const supplierOnboardingRepository = new SupplierOnboardingRepository();
