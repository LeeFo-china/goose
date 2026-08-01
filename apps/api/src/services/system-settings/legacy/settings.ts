import {
  accessPolicyService,
  Errors,
  type AuthContext,
  type SystemSettingRecord,
  type SettingDefinition,
  type EffectiveSetting,
  type SettingScope,
  type SettingSource,
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
  TENANT_SETTING_KEYS_HIDE_PLATFORM_VALUE,
  LEGACY_PARTIAL_TENANT_SMS_SETTING_KEYS,
  PLATFORM_PAYMENT_SECRET_SETTING_KEYS,
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
import { AppError } from '@/errors/app-error';
import type {
  PlatformSecretSettingRecord,
  SystemSettingRepository,
} from '@/repositories/system-settings';

export async function getPlatformSecretStrings(
  repository: Pick<SystemSettingRepository, "findPlatformByKeys">,
  keys: readonly [string, string],
): Promise<Record<string, string>> {
  const records = await repository.findPlatformByKeys(keys);
  const byKey = new Map<string, PlatformSecretSettingRecord>(
    records.map((record) => [record.key, record] as const),
  );

  return Object.fromEntries(keys.map((key) => {
    const record = byKey.get(key);
    const stored = record?.status === "active"
      ? normalizeStoredValue(record.value_text)
      : null;
    if (stored) {
      try {
        return [key, record?.is_secret ? decryptSecretValue(stored) : stored];
      } catch (error) {
        if (error instanceof AppError) {
          throw Errors.business(error.statusCode, error.message, error.code);
        }
        throw Errors.dbError("读取平台支付密钥配置失败");
      }
    }
    const definition = definitionByKey.get(key);
    return [
      key,
      readEnvValue(definition?.envNames ?? [key]) ??
        definition?.defaultValue ??
        "",
    ];
  }));
}

export async function getPlatformSecretString(
  repository: Pick<SystemSettingRepository, "findPlatformSecretByKey">,
  key: string,
): Promise<string> {
  const record = await repository.findPlatformSecretByKey(key);
  const stored = record?.status === "active"
    ? normalizeStoredValue(record.value_text)
    : null;
  if (stored) {
    try {
      return record?.is_secret ? decryptSecretValue(stored) : stored;
    } catch (error) {
      if (error instanceof AppError) {
        throw Errors.business(error.statusCode, error.message, error.code);
      }
      throw Errors.dbError("读取平台支付密钥配置失败");
    }
  }
  const definition = definitionByKey.get(key);
  return readEnvValue(definition?.envNames ?? [key]) ??
    definition?.defaultValue ??
    "";
}

export type PlatformSettingStatus = {
  configured: boolean;
  source: SettingSource;
};

export async function getPlatformSettingStatus(
  repository: Pick<SystemSettingRepository, "findPlatformSecretByKey">,
  key: string,
): Promise<PlatformSettingStatus> {
  const record = await repository.findPlatformSecretByKey(key);
  if (record?.status === "active" && normalizeStoredValue(record.value_text)) {
    return { configured: true, source: "database" };
  }

  const definition = definitionByKey.get(key);
  if (readEnvValue(definition?.envNames ?? [key])) {
    return { configured: true, source: "env" };
  }
  if (normalizeStoredValue(definition?.defaultValue)) {
    return { configured: true, source: "default" };
  }
  return { configured: false, source: "empty" };
}

export async function listSettings(this: any, authContext?: AuthContext) {
    const records = await this.listRecords();
    const isTenantContext = Boolean(authContext && !authContext.isPlatformAdmin);
    const tenantId = authContext?.isPlatformAdmin ? null : authContext?.tenantId || null;
    const list: EffectiveSetting[] = isTenantContext && tenantId
      ? (this.listTenantSmsSettings({
        tenantId,
        records,
      }) as EffectiveSetting[])
      : SETTING_DEFINITIONS
        .map((definition: SettingDefinition) =>
          this.getPlatformRecordOrDefinition(records, definition.key)
        )
        .filter((record: SystemSettingRecord | null): record is SystemSettingRecord => Boolean(record))
        .map((platformRecord: SystemSettingRecord) => {
          const resolved = this.resolveEffectiveRecord({
            key: platformRecord.key,
            tenantId,
            records,
          });
          return this.toEffective(resolved.record || platformRecord, {
            effective: resolved.effective,
            effectiveScope: resolved.effectiveScope,
          });
        });

    const filteredList = isTenantContext
      ? list.filter((setting: EffectiveSetting) => (
        setting.key === TENANT_SMS_CHANNEL_MODE_KEY ||
        !TENANT_SETTING_KEYS_HIDE_PLATFORM_VALUE.has(setting.key) ||
        setting.effective_scope === "tenant" ||
        setting.source === "empty"
      ))
      : list;

    const groups = filteredList.reduce((result: Record<string, EffectiveSetting[]>, item: EffectiveSetting) => {
      const group = result[item.group_code] || [];
      group.push(item);
      result[item.group_code] = group;
      return result;
    }, {});

    return { list: filteredList, groups };
  }

export function shouldClearLegacyTenantSmsOverrides(this: any, input: {
    tenantId: string | null;
    key: string;
    value: string | null;
  }) {
    return Boolean(
      input.tenantId &&
        input.key === TENANT_SMS_CHANNEL_MODE_KEY &&
        normalizeTenantSmsChannelMode(input.value) === TENANT_SMS_PLATFORM_MODE,
    );
  }

export async function clearLegacyTenantSmsOverrides(this: any, input: {
    tenantId: string;
    employeeId: string | null;
  }) {
    await Promise.all(
      Array.from(LEGACY_PARTIAL_TENANT_SMS_SETTING_KEYS).map(async (key) => {
        const existing = await this.systemSettingRepository.findByKey(
          key,
          input.tenantId,
        );
        if (!existing) return;
        await this.systemSettingRepository.updateValue({
          key,
          tenantId: input.tenantId,
          valueText: null,
          employeeId: input.employeeId,
        });
      }),
    );
  }

export async function updateSetting(this: any, authContext: AuthContext, key: string, value: string | null) {
    if (PLATFORM_PAYMENT_SECRET_SETTING_KEYS.has(key)) {
      throw Errors.business(
        409,
        '支付密钥只能通过支付配置专用接口更新',
        'SYSTEM_SETTING_PAYMENT_SECRET_PROTECTED',
      );
    }
    return persistSetting.call(this, authContext, key, value);
  }

export async function updatePlatformPaymentSecretSetting(
    this: any,
    authContext: AuthContext,
    key: string,
    value: string,
  ) {
    if (!PLATFORM_PAYMENT_SECRET_SETTING_KEYS.has(key)) {
      throw Errors.business(
        409,
        '支付密钥专用接口不支持该配置项',
        'SYSTEM_SETTING_PAYMENT_SECRET_KEY_INVALID',
      );
    }
    return persistSetting.call(this, authContext, key, value);
  }

async function persistSetting(
    this: any,
    authContext: AuthContext,
    key: string,
    value: string | null,
  ) {
    const tenantId = authContext.isPlatformAdmin
      ? null
      : accessPolicyService.assertTenantId(authContext);
    if (tenantId && !this.isTenantOverridable(key)) {
      throw Errors.business(
        403,
        "该配置为平台级配置，不支持租户覆盖",
        "SYSTEM_SETTING_PLATFORM_ONLY",
      );
    }

    const definition = definitionByKey.get(key);
    const platformRecord = await this.systemSettingRepository.findByKey(
      key,
      null,
    )
      || (definition ? this.buildDefinitionRecord(definition) : null);
    const record = tenantId
      ? await this.systemSettingRepository.findByKey(key, tenantId) ||
        platformRecord
      : platformRecord;
    if (!record) {
      throw Errors.notFound("系统配置不存在");
    }
    const normalizedValue = normalizeStoredValue(value);
    const validatedValue = validateSettingValue(record, normalizedValue);
    const valueText = record.is_secret && validatedValue
      ? encryptSecretValue(validatedValue)
      : validatedValue;
    const existingExact = await this.systemSettingRepository.findByKey(
      key,
      tenantId,
    );
    const updated = existingExact
      ? await this.systemSettingRepository.updateValue({
        key,
        tenantId,
        valueText,
        employeeId: authContext.employeeId,
      })
      : await this.systemSettingRepository.createValue({
        key,
        tenantId,
        groupCode: record.group_code,
        name: record.name,
        description: record.description,
        valueType: record.value_type,
        valueText,
        isSecret: record.is_secret,
        status: record.status,
        employeeId: authContext.employeeId,
      });

    if (
      this.shouldClearLegacyTenantSmsOverrides({
        tenantId,
        key,
        value: validatedValue,
      }) &&
      tenantId
    ) {
      await this.clearLegacyTenantSmsOverrides({
        tenantId,
        employeeId: authContext.employeeId,
      });
    }
    this.clearCache();

    return this.toEffective(updated);
  }

export async function getString(this: any, 
    key: string,
    fallbackValue = "",
    options?: { tenantId?: string | null },
  ): Promise<string> {
    const records = await this.listRecords();
    const resolved = this.resolveEffectiveRecord({
      key,
      tenantId: options?.tenantId,
      records,
    });
    const record = resolved.record;
    if (!record) {
      const definition = definitionByKey.get(key);
      return readEnvValue(definition?.envNames || [key]) || definition?.defaultValue || fallbackValue;
    }

    const effective = resolved.effective;
    if (record.is_secret && effective.source === "database" && effective.value) {
      return decryptSecretValue(effective.value) || fallbackValue;
    }

    return effective.value || fallbackValue;
  }

export async function getSecretString(this: any, 
    key: string,
    fallbackValue = "",
    options?: { tenantId?: string | null },
  ): Promise<string> {
    return this.getString(key, fallbackValue, options);
  }

export async function getTenantOverrideString(this: any, 
    key: string,
    tenantId: string | null | undefined,
    fallbackValue = "",
  ): Promise<string> {
    if (!tenantId || !this.isTenantOverridable(key)) {
      return fallbackValue;
    }

    const records = await this.listRecords();
    const record = this.getTenantRecord(records, key, tenantId);
    const value = normalizeStoredValue(record?.value_text);
    if (!record || record.status !== "active" || !value) {
      return fallbackValue;
    }

    if (record.is_secret) {
      return decryptSecretValue(value) || fallbackValue;
    }

    return value;
  }

export async function getNumber(this: any, 
    key: string,
    fallbackValue: number,
    options?: { tenantId?: string | null },
  ) {
    const value = await this.getString(key, String(fallbackValue), options);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  }

export async function getBoolean(this: any, 
    key: string,
    fallbackValue: boolean,
    options?: { tenantId?: string | null },
  ) {
    const value = (await this.getString(key, String(fallbackValue), options)).toLowerCase();
    if (value === "true") return true;
    if (value === "false") return false;
    return fallbackValue;
  }
