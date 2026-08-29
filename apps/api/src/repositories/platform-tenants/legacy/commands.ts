import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import {
  PlatformTenantAddressSourceSchema,
  PlatformTenantStatusSchema,
  type CreatePlatformTenantInput,
} from "@/schema/platform-tenants";
import { z } from "zod";

const COMMAND_ERROR_MESSAGE = "创建租户并初始化模板失败";

const PlatformTenantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: PlatformTenantStatusSchema,
  address: z.string().nullable(),
  address_title: z.string().nullable(),
  address_poi_id: z.string().nullable(),
  address_province: z.string().nullable(),
  address_city: z.string().nullable(),
  address_district: z.string().nullable(),
  address_adcode: z.string().nullable(),
  address_latitude: z.number().nullable(),
  address_longitude: z.number().nullable(),
  address_source: PlatformTenantAddressSourceSchema.nullable(),
  address_confidence: z.number().nullable(),
  address_confirmed_at: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  unified_social_credit_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

const PlatformTenantInitializationSchema = z.object({
  template_code: z.literal("default_decoration_company"),
  template_version: z.literal("2026.08.30"),
  departments_count: z.number().int().nonnegative(),
  posts_count: z.number().int().nonnegative(),
  roles_count: z.number().int().nonnegative(),
  admin_employee_id: z.uuid().nullable(),
  admin_role_id: z.uuid().nullable(),
}).strict();

const PlatformTenantAtomicCreateResultSchema = z.object({
  tenant: PlatformTenantSchema,
  initialization: PlatformTenantInitializationSchema,
}).strict();

export type PlatformTenantAtomicCreateResult = z.infer<
  typeof PlatformTenantAtomicCreateResultSchema
>;

export type PlatformTenantRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

const COMMAND_ERRORS = {
  TENANT_SLUG_EXISTS: ["23505", 409, "租户标识已存在"],
  TENANT_ADMIN_PHONE_EXISTS: ["23505", 409, "管理员手机号已绑定员工身份"],
  TENANT_TEMPLATE_STATE_CONFLICT: ["23514", 409, "租户模板状态冲突"],
  TENANT_TEMPLATE_PERMISSION_MISSING: ["23503", 503, "租户模板权限配置不完整"],
  TENANT_INITIALIZATION_INPUT_INVALID: ["22023", 400, "租户管理员信息无效"],
  TENANT_CREATION_INPUT_INVALID: ["22023", 400, "租户信息无效"],
  TENANT_INITIALIZATION_TENANT_STATE_INVALID: ["23514", 409, "租户状态不允许初始化"],
} as const;

function throwCommandError(error: unknown): never {
  for (const [code, [postgresCode, statusCode, message]] of Object.entries(
    COMMAND_ERRORS,
  )) {
    if (matchesPostgresError(error, postgresCode, code)) {
      throw Errors.business(statusCode, message, code);
    }
  }

  throw Errors.dbError(COMMAND_ERROR_MESSAGE);
}

export async function createWithDefaultTemplate(
  rpc: PlatformTenantRpc,
  input: CreatePlatformTenantInput,
  operatorEmployeeId: string | null,
): Promise<PlatformTenantAtomicCreateResult> {
  let result: Awaited<ReturnType<PlatformTenantRpc>>;
  try {
    result = await rpc("create_tenant_with_default_template", {
      p_name: input.name,
      p_slug: input.slug,
      p_status: input.status,
      p_address: input.address ?? null,
      p_address_title: input.address_title ?? null,
      p_address_poi_id: input.address_poi_id ?? null,
      p_address_province: input.address_province ?? null,
      p_address_city: input.address_city ?? null,
      p_address_district: input.address_district ?? null,
      p_address_adcode: input.address_adcode ?? null,
      p_address_latitude: input.address_latitude ?? null,
      p_address_longitude: input.address_longitude ?? null,
      p_address_source: input.address_source ?? null,
      p_address_confidence: input.address_confidence ?? null,
      p_address_confirmed_at: input.address_confirmed_at ?? null,
      p_contact_name: input.contact_name ?? null,
      p_contact_phone: input.contact_phone ?? null,
      p_admin_name: input.admin?.name ?? null,
      p_admin_phone: input.admin?.phone ?? null,
      p_admin_auth_user_id: input.admin?.auth_user_id ?? null,
      p_admin_department_code: input.admin?.department_code ?? "EXEC_OFFICE",
      p_admin_post_code: input.admin?.post_code ?? "SYSTEM_ADMIN",
      p_operator_employee_id: operatorEmployeeId,
    });
  } catch {
    throw Errors.dbError(COMMAND_ERROR_MESSAGE);
  }

  if (result.error) {
    throwCommandError(result.error);
  }

  const parsed = PlatformTenantAtomicCreateResultSchema.safeParse(result.data);
  if (!parsed.success) {
    throw Errors.dbError(COMMAND_ERROR_MESSAGE, parsed.error.issues);
  }

  return parsed.data;
}
