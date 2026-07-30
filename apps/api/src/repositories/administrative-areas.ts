import { Errors } from "@/errors/error-factory";
import type { AdministrativeAreaListQuery } from "@/schema/administrative-areas";
import { SupabaseDB } from "@/utils/supabase";

const ADMINISTRATIVE_AREA_PAGE_SIZE = 1000;
const MAX_ADMINISTRATIVE_AREA_PAGES = 20;

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

export type PublicAdministrativeAreaRecord = Pick<
  AdministrativeAreaRecord,
  | "adcode"
  | "name"
  | "level"
  | "parent_adcode"
  | "full_name"
  | "source_version"
  | "synced_at"
  | "sort_order"
>;

class AdministrativeAreaRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as { from: (table: string) => any }).from("administrative_areas");
  }

  async list(query: AdministrativeAreaListQuery) {
    const rows: AdministrativeAreaRecord[] = [];
    for (let page = 0; page < MAX_ADMINISTRATIVE_AREA_PAGES; page += 1) {
      const from = page * ADMINISTRATIVE_AREA_PAGE_SIZE;
      const to = from + ADMINISTRATIVE_AREA_PAGE_SIZE - 1;
      const request = this.buildListRequest(query).range(from, to);
      const { data, error } = await request;

      if (error) {
        throw Errors.dbError("查询行政区划失败", error);
      }

      const pageRows = (data || []) as AdministrativeAreaRecord[];
      rows.push(...pageRows);
      if (pageRows.length < ADMINISTRATIVE_AREA_PAGE_SIZE) break;
    }

    return rows;
  }

  async listPublicSnapshot(): Promise<PublicAdministrativeAreaRecord[]> {
    const rows: PublicAdministrativeAreaRecord[] = [];
    for (let page = 0; page < MAX_ADMINISTRATIVE_AREA_PAGES; page += 1) {
      const from = page * ADMINISTRATIVE_AREA_PAGE_SIZE;
      const to = from + ADMINISTRATIVE_AREA_PAGE_SIZE - 1;
      const { data, error } = await this.buildPublicSnapshotRequest().range(from, to);

      if (error) {
        throw Errors.dbError("查询行政区划失败", error);
      }

      const pageRows = (data || []) as PublicAdministrativeAreaRecord[];
      rows.push(...pageRows);
      if (pageRows.length < ADMINISTRATIVE_AREA_PAGE_SIZE) break;
    }

    return rows;
  }

  async findActiveByAdcodes(adcodes: string[]) {
    if (adcodes.length === 0) return [];

    const { data, error } = await this.table()
      .select("adcode,name,level,parent_adcode,full_name,status")
      .in("adcode", adcodes)
      .eq("status", "active")
      .order("adcode", { ascending: true });

    if (error) {
      throw Errors.dbError("查询行政区划失败", error);
    }

    return (data || []) as Array<
      Pick<
        AdministrativeAreaRecord,
        | "adcode"
        | "name"
        | "level"
        | "parent_adcode"
        | "full_name"
        | "status"
      >
    >;
  }

  private buildListRequest(query: AdministrativeAreaListQuery) {
    let request = this.table()
      .select("adcode,name,level,parent_adcode,full_name,source,source_version,sort_order,status,synced_at,created_at,updated_at")
      .eq("status", "active");

    if (query.level) request = request.eq("level", query.level);
    if (query.parent_adcode) request = request.eq("parent_adcode", query.parent_adcode);
    if (query.adcodes?.length) request = request.in("adcode", query.adcodes);
    if (!query.parent_adcode && query.level === "province") request = request.is("parent_adcode", null);
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      request = request.or(`name.ilike.${keyword},full_name.ilike.${keyword},adcode.ilike.${keyword}`);
    }

    return request
      .order("sort_order", { ascending: true })
      .order("adcode", { ascending: true });
  }

  private buildPublicSnapshotRequest() {
    return this.table()
      .select(
        "adcode,name,level,parent_adcode,full_name,source_version,synced_at,sort_order",
      )
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("adcode", { ascending: true });
  }
}

export const administrativeAreaRepository = new AdministrativeAreaRepository();
