import { Errors } from "@/errors/error-factory";
import { systemSettingRepository, type SystemSettingRecord } from "@/repositories/system-settings";
import type { AuthContext } from "@/services/authorization";

type SettingDefinition = {
  key: string;
  groupCode: string;
  name: string;
  description: string;
  valueType: "string" | "number" | "boolean" | "json";
  envNames: string[];
  defaultValue?: string;
};

type SettingSource = "database" | "env" | "default" | "empty";

type EffectiveSetting = SystemSettingRecord & {
  effective_value: string | null;
  stored_value: string | null;
  source: SettingSource;
  is_configured: boolean;
};

const CACHE_TTL_MS = 30 * 1000;

const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: "SMS_PROVIDER",
    groupCode: "sms",
    name: "短信服务商",
    description: "mock 为模拟发送，disabled 为禁用，aliyun 为阿里云短信。",
    valueType: "string",
    envNames: ["SMS_PROVIDER"],
    defaultValue: "mock",
  },
  {
    key: "ALIYUN_SMS_SIGN_NAME",
    groupCode: "sms",
    name: "阿里云短信签名",
    description: "阿里云短信签名名称。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_SIGN_NAME"],
  },
  {
    key: "ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER",
    groupCode: "sms",
    name: "客户绑定短信模板",
    description: "客户绑定手机号验证码模板 Code。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_TEMPLATE_CODE_BIND_CUSTOMER"],
  },
  {
    key: "ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE",
    groupCode: "sms",
    name: "员工绑定短信模板",
    description: "员工绑定手机号验证码模板 Code。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_TEMPLATE_CODE_BIND_EMPLOYEE"],
  },
  {
    key: "ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN",
    groupCode: "sms",
    name: "后台登录短信模板",
    description: "后台管理员登录验证码模板 Code；为空时回退员工绑定模板。",
    valueType: "string",
    envNames: ["ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN"],
  },
  {
    key: "EZVIZ_API_BASE_URL",
    groupCode: "ezviz",
    name: "萤石开放平台地址",
    description: "萤石云开放平台 API 基础地址。",
    valueType: "string",
    envNames: ["EZVIZ_API_BASE_URL"],
    defaultValue: "https://open.ys7.com",
  },
  {
    key: "EZVIZ_TOKEN_REFRESH_AHEAD_MS",
    groupCode: "ezviz",
    name: "萤石 Token 提前刷新时间",
    description: "访问令牌过期前提前刷新的毫秒数。",
    valueType: "number",
    envNames: ["EZVIZ_TOKEN_REFRESH_AHEAD_MS"],
    defaultValue: String(10 * 60 * 1000),
  },
  {
    key: "EZPLAYER_PLUGIN_VERSION",
    groupCode: "ezviz",
    name: "EZPlayer 插件版本",
    description: "前端播放器使用的 EZPlayer 插件版本。",
    valueType: "string",
    envNames: ["EZPLAYER_PLUGIN_VERSION"],
    defaultValue: "1.5.2",
  },
];

const definitionByKey = new Map(SETTING_DEFINITIONS.map((item) => [item.key, item]));

function normalizeStoredValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readEnvValue(envNames: string[]) {
  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return null;
}

function resolveEffectiveValue(record: SystemSettingRecord): {
  value: string | null;
  source: SettingSource;
} {
  const storedValue = normalizeStoredValue(record.value_text);
  if (record.status === "active" && storedValue) {
    return { value: storedValue, source: "database" };
  }

  const definition = definitionByKey.get(record.key);
  const envValue = definition ? readEnvValue(definition.envNames) : readEnvValue([record.key]);
  if (envValue) {
    return { value: envValue, source: "env" };
  }

  if (definition?.defaultValue) {
    return { value: definition.defaultValue, source: "default" };
  }

  return { value: null, source: "empty" };
}

function validateSettingValue(record: SystemSettingRecord, value: string | null) {
  if (!value) return null;

  if (record.value_type === "number" && !Number.isFinite(Number(value))) {
    throw Errors.badRequest("配置值必须是数字");
  }

  if (record.value_type === "boolean" && !["true", "false"].includes(value.toLowerCase())) {
    throw Errors.badRequest("配置值必须是 true 或 false");
  }

  if (record.value_type === "json") {
    try {
      JSON.parse(value);
    } catch {
      throw Errors.badRequest("配置值必须是合法 JSON");
    }
  }

  return value;
}

class SystemSettingsService {
  private cache: {
    expiresAt: number;
    records: SystemSettingRecord[];
  } | null = null;

  private async listRecords() {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.records;
    }

    const records = await systemSettingRepository.listAll();
    this.cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      records,
    };

    return records;
  }

  private clearCache() {
    this.cache = null;
  }

  private toEffective(record: SystemSettingRecord): EffectiveSetting {
    const effective = resolveEffectiveValue(record);
    return {
      ...record,
      stored_value: record.is_secret && record.value_text ? "******" : record.value_text,
      effective_value: record.is_secret && effective.value ? "******" : effective.value,
      source: effective.source,
      is_configured: effective.source !== "empty",
    };
  }

  async listSettings() {
    const records = await this.listRecords();
    const list = records.map((record) => this.toEffective(record));

    const groups = list.reduce<Record<string, EffectiveSetting[]>>((result, item) => {
      const group = result[item.group_code] || [];
      group.push(item);
      result[item.group_code] = group;
      return result;
    }, {});

    return { list, groups };
  }

  async updateSetting(authContext: AuthContext, key: string, value: string | null) {
    const record = await systemSettingRepository.findByKey(key);
    if (!record) {
      throw Errors.notFound("系统配置不存在");
    }
    if (record.is_secret) {
      throw Errors.forbidden();
    }

    const normalizedValue = normalizeStoredValue(value);
    const validatedValue = validateSettingValue(record, normalizedValue);
    const updated = await systemSettingRepository.updateValue({
      key,
      valueText: validatedValue,
      employeeId: authContext.employeeId,
    });
    this.clearCache();

    return this.toEffective(updated);
  }

  async getString(key: string, fallbackValue = "") {
    const records = await this.listRecords();
    const record = records.find((item) => item.key === key);
    if (!record) {
      const definition = definitionByKey.get(key);
      return readEnvValue(definition?.envNames || [key]) || definition?.defaultValue || fallbackValue;
    }

    return resolveEffectiveValue(record).value || fallbackValue;
  }

  async getNumber(key: string, fallbackValue: number) {
    const value = await this.getString(key, String(fallbackValue));
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

  async getBoolean(key: string, fallbackValue: boolean) {
    const value = (await this.getString(key, String(fallbackValue))).toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
    return fallbackValue;
  }
}

export const systemSettingsService = new SystemSettingsService();
