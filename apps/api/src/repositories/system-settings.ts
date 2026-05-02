import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type SystemSettingValueType = "string" | "number" | "boolean" | "json";
export type SystemSettingStatus = "active" | "inactive";

export type SystemSettingRecord = {
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

class SystemSettingRepository {
  private client = SupabaseDB.getAdminClient();

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

  async listAll(): Promise<SystemSettingRecord[]> {
    const { data, error } = await this.table()
      .select("*")
      .order("group_code", { ascending: true })
      .order("key", { ascending: true });

    if (error) {
      throw Errors.dbError("查询系统配置失败", error);
    }

    return (data || []) as SystemSettingRecord[];
  }

  async findByKey(key: string): Promise<SystemSettingRecord | null> {
    const { data, error } = await this.table()
      .select("*")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询系统配置失败", error);
    }

    return (data || null) as SystemSettingRecord | null;
  }

  async updateValue(input: {
    key: string;
    valueText: string | null;
    employeeId: string | null;
  }): Promise<SystemSettingRecord> {
    const existing = await this.findByKey(input.key);
    if (!existing) {
      throw Errors.notFound("系统配置不存在");
    }

    const { data, error } = await this.table()
      .update({
        value_text: input.valueText,
        updated_by_employee_id: input.employeeId,
      })
      .eq("key", input.key)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新系统配置失败", error);
    }

    const logResult = await this.changeLogTable()
      .insert({
        setting_key: input.key,
        old_value_text: existing.value_text,
        new_value_text: input.valueText,
        changed_by_employee_id: input.employeeId,
      });

    if (logResult.error) {
      throw Errors.dbError("记录系统配置变更失败", logResult.error);
    }

    return data as SystemSettingRecord;
  }
}

export const systemSettingRepository = new SystemSettingRepository();
