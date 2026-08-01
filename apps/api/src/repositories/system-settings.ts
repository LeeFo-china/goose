import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import { SupabaseDB } from "@/utils/supabase";

export type SystemSettingValueType = "string" | "number" | "boolean" | "json";
export type SystemSettingStatus = "active" | "inactive";

export type SystemSettingRecord = {
  id: string;
  tenant_id: string | null;
  key: string;
  group_code: string;
  name: string;
  description: string | null;
  value_type: SystemSettingValueType;
  value_text: string | null;
  is_secret: boolean;
  status: SystemSettingStatus;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformSecretSettingRecord = Pick<
  SystemSettingRecord,
  "key" | "value_text" | "is_secret" | "status"
>;

export type PlatformSecretSettingSnapshot = PlatformSecretSettingRecord & Pick<
  SystemSettingRecord,
  "updated_at"
>;

type AdminClient = ReturnType<typeof SupabaseDB.getAdminClient>;

export type PlatformPaymentSecretSettingInput = {
  key: string;
  groupCode: string;
  name: string;
  description: string | null;
  valueType: SystemSettingValueType;
  valueText: string;
  status: SystemSettingStatus;
  employeeId: string | null;
  expectedUpdatedAt: string | null;
};

export class SystemSettingRepository {
  constructor(
    private readonly client: unknown = SupabaseDB.getAdminClient(),
  ) {}

  private table() {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from("system_settings");
  }

  private changeLogTable() {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from("system_setting_change_logs");
  }

  async upsertPlatformPaymentSecret(
    input: PlatformPaymentSecretSettingInput,
  ): Promise<SystemSettingRecord> {
    const client = this.client as Pick<AdminClient, "rpc">;
    const { data, error } = await client.rpc(
      "upsert_platform_payment_secret_setting",
      {
        p_setting_key: input.key,
        p_group_code: input.groupCode,
        p_name: input.name,
        p_description: input.description,
        p_value_type: input.valueType,
        p_value_text: input.valueText,
        p_status: input.status,
        p_changed_by_employee_id: input.employeeId,
        p_expected_updated_at: input.expectedUpdatedAt,
      },
    );
    if (error) {
      throwSystemSettingMutationError(
        error,
        "保存平台支付密钥配置失败",
        true,
      );
    }
    if (!isPlatformPaymentSecretRecord(data, input.key)) {
      throw Errors.dbError("保存平台支付密钥配置失败");
    }
    return data;
  }

  async listAll(): Promise<SystemSettingRecord[]> {
    const { data, error } = await this.table()
      .select("*")
      .order("tenant_id", { ascending: true, nullsFirst: true })
      .order("group_code", { ascending: true })
      .order("key", { ascending: true });

    if (error) {
      throw Errors.dbError("查询系统配置失败", error);
    }

    return (data || []) as SystemSettingRecord[];
  }

  async findByKey(
    key: string,
    tenantId?: string | null,
  ): Promise<SystemSettingRecord | null> {
    let query = this.table()
      .select("*")
      .eq("key", key);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    } else {
      query = query.is("tenant_id", null);
    }

    const { data, error } = await query
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询系统配置失败", error);
    }

    return (data || null) as SystemSettingRecord | null;
  }

  async findPlatformByKeys(
    keys: readonly [string, string],
  ): Promise<PlatformSecretSettingRecord[]> {
    const { data, error } = await this.table()
      .select("key,value_text,is_secret,status")
      .in("key", keys)
      .is("tenant_id", null)
      .limit(2);
    if (error) {
      throw Errors.dbError("查询平台支付密钥配置失败");
    }
    return Array.isArray(data) ? data as PlatformSecretSettingRecord[] : [];
  }

  async findPlatformSecretByKey(
    key: string,
  ): Promise<PlatformSecretSettingSnapshot | null> {
    const { data, error } = await this.table()
      .select("key,value_text,is_secret,status,updated_at")
      .eq("key", key)
      .is("tenant_id", null)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw Errors.dbError("查询平台支付密钥配置失败");
    }
    return (data as PlatformSecretSettingSnapshot | null) ?? null;
  }

  async updateValue(input: {
    key: string;
    tenantId?: string | null;
    valueText: string | null;
    employeeId: string | null;
  }): Promise<SystemSettingRecord> {
    const existing = await this.findByKey(input.key, input.tenantId);
    if (!existing) {
      throw Errors.notFound("系统配置不存在");
    }

    let query = this.table()
      .update({
        value_text: input.valueText,
        updated_by_employee_id: input.employeeId,
      })
      .eq("key", input.key);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    } else {
      query = query.is("tenant_id", null);
    }

    const { data, error } = await query
      .select("*")
      .single();

    if (error) {
      throwSystemSettingMutationError(error, "更新系统配置失败");
    }

    const logResult = await this.changeLogTable()
      .insert({
        tenant_id: input.tenantId || null,
        setting_key: input.key,
        old_value_text: existing.is_secret ? null : existing.value_text,
        new_value_text: existing.is_secret ? null : input.valueText,
        changed_by_employee_id: input.employeeId,
      });

    if (logResult.error) {
      throw Errors.dbError("记录系统配置变更失败", logResult.error);
    }

    return data as SystemSettingRecord;
  }

  async createValue(input: {
    key: string;
    tenantId: string | null;
    groupCode: string;
    name: string;
    description: string | null;
    valueType: SystemSettingValueType;
    valueText: string | null;
    isSecret: boolean;
    status: SystemSettingStatus;
    employeeId: string | null;
  }): Promise<SystemSettingRecord> {
    const { data, error } = await this.table()
      .insert({
        tenant_id: input.tenantId,
        key: input.key,
        group_code: input.groupCode,
        name: input.name,
        description: input.description,
        value_type: input.valueType,
        value_text: input.valueText,
        is_secret: input.isSecret,
        status: input.status,
        updated_by_employee_id: input.employeeId,
      })
      .select("*")
      .single();

    if (error) {
      throwSystemSettingMutationError(error, "创建系统配置失败");
    }

    const logResult = await this.changeLogTable()
      .insert({
        tenant_id: input.tenantId,
        setting_key: input.key,
        old_value_text: null,
        new_value_text: input.isSecret ? null : input.valueText,
        changed_by_employee_id: input.employeeId,
      });

    if (logResult.error) {
      throw Errors.dbError("记录系统配置变更失败", logResult.error);
    }

    return data as SystemSettingRecord;
  }
}

const SYSTEM_SETTING_MUTATION_ERRORS = [
  {
    postgresCode: "P0001",
    code: "SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT",
    message: "支付密钥配置已变化，请刷新后重试",
  },
  {
    postgresCode: "23514",
    code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    message: "存在使用当前微信支付配置的待支付充值订单，请等待订单支付或关闭后再修改",
  },
  {
    postgresCode: "P0001",
    code: "BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS",
    message: "存在待签发、签发中或待核对的虚拟支付订单，请完成处理后再变更密钥",
  },
  {
    postgresCode: "P0001",
    code: "BRANDING_VIRTUAL_PAYMENT_SECRET_IDENTITY_IMMUTABLE",
    message: "虚拟支付密钥的标识、归属和密钥属性不可修改",
  },
  {
    postgresCode: "P0001",
    code: "BRANDING_VIRTUAL_PAYMENT_SECRET_SCOPE_INVALID",
    message: "虚拟支付密钥必须是平台级加密配置",
  },
  {
    postgresCode: "P0001",
    code: "WECHAT_VIRTUAL_MESSAGE_TOKEN_IDENTITY_IMMUTABLE",
    message: "虚拟支付消息令牌的标识、归属和密钥属性不可修改",
  },
  {
    postgresCode: "P0001",
    code: "WECHAT_VIRTUAL_MESSAGE_TOKEN_SCOPE_INVALID",
    message: "虚拟支付消息令牌必须是平台级加密配置",
  },
] as const;

const ENCRYPTED_SECRET_ENVELOPE_PATTERN =
  /^enc:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:([A-Za-z0-9_-]{4})*([A-Za-z0-9_-]{2,4})$/;

function isPlatformPaymentSecretRecord(
  value: unknown,
  expectedKey: string,
): value is SystemSettingRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.id.length > 0 &&
    record.tenant_id === null &&
    record.key === expectedKey &&
    record.group_code === "payment" &&
    typeof record.name === "string" && record.name.length > 0 &&
    (record.description === null || typeof record.description === "string") &&
    record.value_type === (expectedKey === "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN"
      ? "string"
      : "json") &&
    typeof record.value_text === "string" &&
    ENCRYPTED_SECRET_ENVELOPE_PATTERN.test(record.value_text) &&
    record.is_secret === true &&
    record.status === "active" &&
    (record.updated_by_employee_id === null ||
      typeof record.updated_by_employee_id === "string") &&
    typeof record.created_at === "string" && record.created_at.length > 0 &&
    typeof record.updated_at === "string" && record.updated_at.length > 0;
}

function throwSystemSettingMutationError(
  error: unknown,
  fallback: string,
  sanitizeUnknown = false,
): never {
  if (error instanceof AppError) {
    if (sanitizeUnknown) throw Errors.dbError(fallback);
    throw error;
  }
  for (const mapped of SYSTEM_SETTING_MUTATION_ERRORS) {
    if (matchesPostgresError(error, mapped.postgresCode, mapped.code)) {
      throw Errors.business(409, mapped.message, mapped.code);
    }
  }
  throw sanitizeUnknown
    ? Errors.dbError(fallback)
    : Errors.dbError(fallback, error);
}

export const systemSettingRepository = new SystemSettingRepository();
