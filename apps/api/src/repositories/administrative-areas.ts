import { Errors } from "@/errors/error-factory";
import type { AdministrativeAreaListQuery } from "@/schema/administrative-areas";
import { SupabaseDB } from "@/utils/supabase";

export type AdministrativeAreaRecord = {
  adcode: string;
  name: string;
  level: "province" | "city" | "district";
  parent_adcode: string | null;
  full_name: string;
  source: string;
  source_version: string | null;
  sort_order: number;
  status: "active" | "inactive";
  synced_at: string;
  created_at: string;
  updated_at: string;
};

class AdministrativeAreaRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as { from: (table: string) => any }).from("administrative_areas");
  }

  async list(query: AdministrativeAreaListQuery) {
    let request = this.table()
      .select("adcode,name,level,parent_adcode,full_name,source,source_version,sort_order,status,synced_at,created_at,updated_at")
      .eq("status", "active");

    if (query.level) request = request.eq("level", query.level);
    if (query.parent_adcode) request = request.eq("parent_adcode", query.parent_adcode);
    if (!query.parent_adcode && query.level === "province") request = request.is("parent_adcode", null);
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      request = request.or(`name.ilike.${keyword},full_name.ilike.${keyword},adcode.ilike.${keyword}`);
    }

    const { data, error } = await request
      .order("sort_order", { ascending: true })
      .order("adcode", { ascending: true });

    if (error) {
      throw Errors.dbError("查询行政区划失败", error);
    }

    return (data || []) as AdministrativeAreaRecord[];
  }
}

export const administrativeAreaRepository = new AdministrativeAreaRepository();
