import {
  systemSettingRepository,
  accessPolicyService,
  Errors,
  type AuthContext,
  type SystemSettingRecord,
  type SettingDefinition,
  type EffectiveSetting,
  type SettingScope,
  CACHE_TTL_MS,
} from './shared';
import {
  SETTING_DEFINITIONS,
  definitionByKey,
  TENANT_SMS_CHANNEL_MODE_KEY,
  TENANT_SMS_PLATFORM_MODE,
  TENANT_SMS_BASE_SETTING_KEYS,
  TENANT_ALIYUN_SMS_SETTING_KEYS,
  TENANT_TENCENT_SMS_SETTING_KEYS,
  TENANT_CUSTOMER_SERVICE_SETTING_KEYS,
  TENANT_OVERRIDABLE_SETTING_KEYS,
  TENANT_SETTING_KEYS_HIDE_PLATFORM_VALUE,
  LEGACY_PARTIAL_TENANT_SMS_SETTING_KEYS,
} from './definitions';
import {
  decryptSecretValue,
  encryptSecretValue,
  normalizeStoredValue,
  normalizeTenantSmsChannelMode,
  readEnvValue,
  resolveEffectiveValue,
  validateSettingValue,
} from './crypto';

export async function listRecords(this: any) {
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

export function clearCache(this: any) {
    this.cache = null;
  }

export function isTenantOverridable(this: any, key: string) {
    return TENANT_OVERRIDABLE_SETTING_KEYS.has(key);
  }

export function getPlatformRecord(this: any, records: SystemSettingRecord[], key: string) {
    return records.find((item) => item.key === key && !item.tenant_id) || null;
  }

export function getTenantRecord(this: any, records: SystemSettingRecord[], key: string, tenantId?: string | null) {
    if (!tenantId || !this.isTenantOverridable(key)) {
      return null;
    }

    return records.find((item) => item.key === key && item.tenant_id === tenantId) || null;
  }

export function buildDefinitionRecord(this: any, 
    definition: SettingDefinition,
    tenantId: string | null = null,
  ): SystemSettingRecord {
    return {
      id: `definition:${tenantId || "platform"}:${definition.key}`,
      tenant_id: tenantId,
      key: definition.key,
      group_code: definition.groupCode,
      name: definition.name,
      description: definition.description,
      value_type: definition.valueType,
      value_text: null,
      is_secret: definition.isSecret ?? false,
      status: "active",
      updated_by_employee_id: null,
      created_at: "",
      updated_at: "",
    };
  }

export function getPlatformRecordOrDefinition(this: any, records: SystemSettingRecord[], key: string) {
    const platformRecord = this.getPlatformRecord(records, key);
    if (platformRecord) {
      return platformRecord;
    }

    const definition = definitionByKey.get(key);
    return definition ? this.buildDefinitionRecord(definition) : null;
  }

export function resolveEffectiveRecord(this: any, input: {
    key: string;
    tenantId?: string | null;
    records: SystemSettingRecord[];
  }) {
    const tenantRecord = this.getTenantRecord(input.records, input.key, input.tenantId);
    if (tenantRecord) {
      const tenantStoredValue = normalizeStoredValue(tenantRecord.value_text);
      if (tenantRecord.status === "active" && tenantStoredValue) {
        return {
          record: tenantRecord,
          effective: {
            value: tenantStoredValue,
            source: "database" as const,
          },
          effectiveScope: "tenant" as const,
        };
      }
    }

    const platformRecord = this.getPlatformRecord(input.records, input.key);
    if (platformRecord) {
      return {
        record: platformRecord,
        effective: resolveEffectiveValue(platformRecord),
        effectiveScope: "platform" as const,
      };
    }

    const definition = definitionByKey.get(input.key);
    const fallbackValue = readEnvValue(definition?.envNames || [input.key])
      || definition?.defaultValue
      || null;
    return {
      record: null,
      effective: {
        value: fallbackValue,
        source: fallbackValue
          ? readEnvValue(definition?.envNames || [input.key])
            ? "env" as const
            : "default" as const
          : "empty" as const,
      },
      effectiveScope: "platform" as const,
    };
  }

export function toEffective(this: any, 
    record: SystemSettingRecord,
    options?: {
      effective?: ReturnType<typeof resolveEffectiveValue>;
      effectiveScope?: SettingScope;
    },
  ): EffectiveSetting {
    const effective = options?.effective || resolveEffectiveValue(record);
    return {
      ...record,
      stored_value: record.is_secret && record.value_text ? "******" : record.value_text,
      effective_value: record.is_secret && effective.value ? "******" : effective.value,
      source: effective.source,
      is_configured: effective.source !== "empty",
      effective_scope: options?.effectiveScope || (record.tenant_id ? "tenant" : "platform"),
      can_override_by_tenant: this.isTenantOverridable(record.key),
    };
  }

export function toTenantEditableEffective(this: any, input: {
    platformRecord: SystemSettingRecord;
    tenantRecord: SystemSettingRecord | null;
    tenantId: string;
    effective: ReturnType<typeof resolveEffectiveValue>;
    effectiveScope: SettingScope;
  }) {
    const record: SystemSettingRecord = {
      ...input.platformRecord,
      id: input.tenantRecord?.id ?? input.platformRecord.id,
      tenant_id: input.tenantId,
      value_text: input.tenantRecord?.value_text ?? null,
      updated_by_employee_id: input.tenantRecord?.updated_by_employee_id ?? null,
      created_at: input.tenantRecord?.created_at ?? input.platformRecord.created_at,
      updated_at: input.tenantRecord?.updated_at ?? input.platformRecord.updated_at,
    };

    return this.toEffective(record, {
      effective: input.effective,
      effectiveScope: input.effectiveScope,
    });
  }

export function listTenantSmsSettings(this: any, input: {
    tenantId: string;
    records: SystemSettingRecord[];
  }) {
    const tenantModeRecord = this.getTenantRecord(
      input.records,
      TENANT_SMS_CHANNEL_MODE_KEY,
      input.tenantId,
    );
    const channelMode = normalizeTenantSmsChannelMode(tenantModeRecord?.value_text);
    const visibleKeys = new Set<string>(TENANT_SMS_BASE_SETTING_KEYS);

    for (const key of TENANT_ALIYUN_SMS_SETTING_KEYS) visibleKeys.add(key);
    for (const key of TENANT_TENCENT_SMS_SETTING_KEYS) visibleKeys.add(key);
    for (const key of TENANT_CUSTOMER_SERVICE_SETTING_KEYS) visibleKeys.add(key);

    return SETTING_DEFINITIONS
      .filter((definition) => visibleKeys.has(definition.key))
      .map((definition) => this.getPlatformRecordOrDefinition(input.records, definition.key))
      .filter((platformRecord): platformRecord is SystemSettingRecord => Boolean(platformRecord))
      .map((platformRecord) => {
        const tenantRecord = this.getTenantRecord(
          input.records,
          platformRecord.key,
          input.tenantId,
        );
        const tenantStoredValue = normalizeStoredValue(tenantRecord?.value_text);

        if (platformRecord.key === TENANT_SMS_CHANNEL_MODE_KEY) {
          return this.toTenantEditableEffective({
            platformRecord,
            tenantRecord,
            tenantId: input.tenantId,
            effective: {
              value: channelMode,
              source: tenantStoredValue ? "database" as const : "default" as const,
            },
            effectiveScope: tenantStoredValue ? "tenant" : "platform",
          });
        }

        return this.toTenantEditableEffective({
          platformRecord,
          tenantRecord,
          tenantId: input.tenantId,
          effective: tenantStoredValue
            ? {
              value: tenantStoredValue,
              source: "database" as const,
            }
            : {
              value: null,
              source: "empty" as const,
            },
          effectiveScope: tenantStoredValue ? "tenant" : "platform",
        });
      });
  }
