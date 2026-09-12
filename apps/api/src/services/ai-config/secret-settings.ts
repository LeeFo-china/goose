import { Errors } from "@/errors/error-factory";
import { systemSettingRepository, type PlatformAiSecretMetadata } from "@/repositories/system-settings";
import { AI_SECRET_SETTING_KEYS, AiSecretSettingKeySchema, ReplaceAiSecretSettingSchema, type AiSecretSettingKey } from "@/schema/ai-secret-settings";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { systemSettingsService } from "@/services/system-settings";
import { definitionByKey } from "@/services/system-settings/legacy/definitions";

type Dependencies = {
  repository?: Pick<typeof systemSettingRepository, "listPlatformAiSecretMetadata">;
  settingsService?: { updateSetting(auth: AuthContext, key: string, value: string): Promise<unknown> };
  hasEnvValue?: (key: string) => boolean;
};
export type AiSecretSettingMetadata = {
  key: AiSecretSettingKey;
  name: string;
  source: "database" | "env" | "empty";
  status: "configured" | "empty" | "invalid";
};

export class AiSecretSettingsService {
  private readonly repository;
  private readonly settingsService;
  private readonly hasEnvValue;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? systemSettingRepository;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.hasEnvValue = dependencies.hasEnvValue ?? (key => Boolean(process.env[key]?.trim()));
  }

  assertPermission(auth: AuthContext, action: "read" | "manage"): void {
    if (auth.tenantId !== null || !(auth.isPlatformStaff || auth.isPlatformAdmin)) throw Errors.forbidden();
    accessPolicyService.assertPermission(auth, `platform.ai_config.${action}`);
    accessPolicyService.assertPermission(auth, `platform.system_setting.${action}`);
  }

  async list(auth: AuthContext): Promise<{ list: AiSecretSettingMetadata[]; can_manage: boolean }> {
    this.assertPermission(auth, "read");
    const records = await this.readMetadata();
    return {
      // 注册表仅含四项，不返回配置值，也不解密或探测供应商。
      list: AI_SECRET_SETTING_KEYS.map(key => {
        const record = records.find(item => item.key === key);
        const definition = definitionByKey.get(key);
        const base = { key, name: definition?.name ?? key };
        if (!this.isValidMetadata(key, record)) return { ...base, source: "empty", status: "invalid" };
        const source = record?.has_value ? "database" : this.hasEnvValue(key) ? "env" : "empty";
        return { ...base, source, status: source === "empty" ? "empty" : "configured" };
      }),
      can_manage: ["platform.ai_config.manage", "platform.system_setting.manage"]
        .every(permission => accessPolicyService.hasPermission(auth, permission)),
    };
  }

  async replace(auth: AuthContext, key: unknown, body: unknown): Promise<{ key: AiSecretSettingKey; saved: true }> {
    this.assertPermission(auth, "manage");
    const keyResult = AiSecretSettingKeySchema.safeParse(key);
    const valueResult = ReplaceAiSecretSettingSchema.safeParse(body);
    // 不透传 Zod issues，未知字段名也可能包含敏感值。
    if (!keyResult.success || !valueResult.success) throw Errors.badRequest("AI 密钥配置参数无效");
    const registeredKey = keyResult.data;
    await this.assertReference(registeredKey);
    try {
      await this.settingsService.updateSetting(auth, registeredKey, valueResult.data.value);
    } catch {
      // 写入结果可能不明；舍弃底层请求、数据库和加密异常的敏感 details/cause。
      throw Errors.dbError("AI 密钥保存结果未确认，请刷新状态后重试");
    }
    return { key: registeredKey, saved: true };
  }

  // 调用方先检查平台上下文和自身业务权限；这里只验证有界配置元数据。
  async assertReference(key: AiSecretSettingKey): Promise<void> {
    const records = await this.readMetadata();
    if (!this.isValidMetadata(key, records.find(record => record.key === key))) {
      throw Errors.business(409, "AI 密钥配置引用异常，请联系管理员", "AI_SECRET_SETTING_INVALID");
    }
  }

  private async readMetadata(): Promise<PlatformAiSecretMetadata[]> {
    try { return await this.repository.listPlatformAiSecretMetadata(); }
    catch { throw Errors.dbError("读取 AI 密钥配置状态失败"); }
  }

  private isValidMetadata(key: AiSecretSettingKey, record?: PlatformAiSecretMetadata): boolean {
    const definition = definitionByKey.get(key);
    if (!definition?.isSecret || definition.groupCode !== "ai" || definition.valueType !== "string") return false;
    return !record || (record.is_secret && record.group_code === "ai" && record.status === "active" && record.value_type === "string");
  }
}

export const aiSecretSettingsService = new AiSecretSettingsService();
