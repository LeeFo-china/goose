import {
  listRecords,
  clearCache,
  isTenantOverridable,
  getPlatformRecord,
  getTenantRecord,
  buildDefinitionRecord,
  getPlatformRecordOrDefinition,
  resolveEffectiveRecord,
  toEffective,
  toTenantEditableEffective,
  listTenantSmsSettings,
} from './legacy/records';
import {
  listSettings,
  shouldClearLegacyTenantSmsOverrides,
  clearLegacyTenantSmsOverrides,
  updateSetting,
  getString,
  getSecretString,
  getTenantOverrideString,
  getNumber,
  getBoolean,
} from './legacy/settings';
import type { SystemSettingRecord } from './legacy/shared';
import {
  systemSettingRepository,
  type SystemSettingRepository,
} from '@/repositories/system-settings';

type SystemSettingRepositoryPort = Pick<
  SystemSettingRepository,
  'findByKey' | 'updateValue' | 'createValue'
>;

export class SystemSettingsService {
  private readonly systemSettingRepository: SystemSettingRepositoryPort;

  constructor(
    repository: SystemSettingRepositoryPort = systemSettingRepository,
  ) {
    this.systemSettingRepository = repository;
  }

  private cache: {
    expiresAt: number;
    records: SystemSettingRecord[];
  } | null = null;

  private listRecords = listRecords;
  private clearCache = clearCache;
  private isTenantOverridable = isTenantOverridable;
  private getPlatformRecord = getPlatformRecord;
  private getTenantRecord = getTenantRecord;
  private buildDefinitionRecord = buildDefinitionRecord;
  private getPlatformRecordOrDefinition = getPlatformRecordOrDefinition;
  private resolveEffectiveRecord = resolveEffectiveRecord;
  private toEffective = toEffective;
  private toTenantEditableEffective = toTenantEditableEffective;
  private listTenantSmsSettings = listTenantSmsSettings;
  listSettings = listSettings;
  private shouldClearLegacyTenantSmsOverrides = shouldClearLegacyTenantSmsOverrides;
  private clearLegacyTenantSmsOverrides = clearLegacyTenantSmsOverrides;
  updateSetting = updateSetting;
  getString = getString;
  getSecretString = getSecretString;
  getTenantOverrideString = getTenantOverrideString;
  getNumber = getNumber;
  getBoolean = getBoolean;
}

export const systemSettingsService = new SystemSettingsService();
