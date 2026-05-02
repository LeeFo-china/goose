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
  {
    key: "AI_CHAT_COMPLETIONS_URL",
    groupCode: "ai",
    name: "AI 对话接口地址",
    description: "兼容 Chat Completions 的接口地址。",
    valueType: "string",
    envNames: ["AI_CHAT_COMPLETIONS_URL", "DEEPSEEK_CHAT_COMPLETIONS_URL"],
  },
  {
    key: "AI_MODEL",
    groupCode: "ai",
    name: "AI 模型名称",
    description: "默认 AI 模型名称。",
    valueType: "string",
    envNames: ["AI_MODEL", "DEEPSEEK_MODEL"],
  },
  {
    key: "AI_REQUEST_TIMEOUT_MS",
    groupCode: "ai",
    name: "AI 请求超时时间",
    description: "AI 请求超时时间，单位毫秒。",
    valueType: "number",
    envNames: ["AI_REQUEST_TIMEOUT_MS"],
    defaultValue: "60000",
  },
  {
    key: "DECORATION_QA_SYSTEM_PROMPT",
    groupCode: "ai",
    name: "装修问答系统提示词",
    description: "装修问答功能使用的系统提示词。",
    valueType: "string",
    envNames: ["DECORATION_QA_SYSTEM_PROMPT"],
  },
  {
    key: "OPENROUTER_HTTP_REFERER",
    groupCode: "ai",
    name: "OpenRouter Referer",
    description: "OpenRouter 请求头 HTTP-Referer。",
    valueType: "string",
    envNames: ["OPENROUTER_HTTP_REFERER"],
    defaultValue: "https://gooes.local",
  },
  {
    key: "OPENROUTER_APP_NAME",
    groupCode: "ai",
    name: "OpenRouter 应用名",
    description: "OpenRouter 请求头 X-Title。",
    valueType: "string",
    envNames: ["OPENROUTER_APP_NAME"],
    defaultValue: "gooes-decoration-qa",
  },
  {
    key: "WECHAT_SHARE_CAMPAIGN_PAGE",
    groupCode: "wechat",
    name: "微信助力页路径",
    description: "微信小程序客户日志助力页路径。",
    valueType: "string",
    envNames: ["WECHAT_SHARE_CAMPAIGN_PAGE"],
    defaultValue: "pages/share-campaign/index",
  },
  {
    key: "WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE",
    groupCode: "wechat",
    name: "微信领券页路径",
    description: "微信小程序领券页路径。",
    valueType: "string",
    envNames: ["WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE"],
    defaultValue: "pages/share-campaign-claim-voucher/index",
  },
  {
    key: "CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT",
    groupCode: "wechat",
    name: "助力目标人数",
    description: "客户日志分享活动目标助力人数。",
    valueType: "number",
    envNames: ["CUSTOMER_LOG_SHARE_TARGET_ASSIST_COUNT"],
    defaultValue: "10",
  },
  {
    key: "DEPLOY_NOTIFY_TO",
    groupCode: "notify",
    name: "部署通知收件人",
    description: "部署通知邮件收件人。",
    valueType: "string",
    envNames: ["DEPLOY_NOTIFY_TO"],
  },
  {
    key: "DEPLOY_NOTIFY_FROM",
    groupCode: "notify",
    name: "部署通知发件人",
    description: "部署通知邮件发件人。",
    valueType: "string",
    envNames: ["DEPLOY_NOTIFY_FROM"],
  },
  {
    key: "SMTP_HOST",
    groupCode: "notify",
    name: "SMTP 主机",
    description: "SMTP 服务器地址。",
    valueType: "string",
    envNames: ["SMTP_HOST"],
  },
  {
    key: "SMTP_PORT",
    groupCode: "notify",
    name: "SMTP 端口",
    description: "SMTP 服务器端口。",
    valueType: "number",
    envNames: ["SMTP_PORT"],
    defaultValue: "465",
  },
  {
    key: "SMTP_SECURE",
    groupCode: "notify",
    name: "SMTP SSL",
    description: "是否使用 SMTP SSL。",
    valueType: "boolean",
    envNames: ["SMTP_SECURE"],
    defaultValue: "true",
  },
  {
    key: "SMTP_FAMILY",
    groupCode: "notify",
    name: "SMTP 网络协议族",
    description: "SMTP 网络协议族，通常为 4 或 6。",
    valueType: "number",
    envNames: ["SMTP_FAMILY"],
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
