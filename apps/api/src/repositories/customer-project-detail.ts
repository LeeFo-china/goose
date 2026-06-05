import { Errors } from "@/errors/error-factory";
import type { CustomerSelfServiceProjectListItem } from "@/repositories/customer-self-service";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

type ProjectDetailRow = Omit<CustomerSelfServiceProjectListItem, "designer"> & {
  designer: null;
};

export type CustomerProjectAccessRow = {
  id: string;
  tenant_id: string | null;
};

class CustomerProjectDetailRepository {
  private directSqlUnavailable = false;

  private async findViaDirectSql(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const directSql = getDirectPostgresSql();
    if (!directSql) throw new Error("direct postgres is not configured");

    const rows = await directSql`
      SELECT
        project.id,
        project.tenant_id,
        project.name,
        project.status,
        project.budget::double precision AS budget,
        project.address,
        project.property_id,
        project.start_date::text AS start_date,
        project.style_tags,
        NULL::jsonb AS designer,
        jsonb_build_object(
          'id', property.id,
          'community', property.community,
          'building_info', property.building_info,
          'layout', property.layout,
          'area', property.area,
          'latitude', property.latitude,
          'longitude', property.longitude,
          'province', property.province,
          'city', property.city,
          'district', property.district,
          'adcode', property.adcode,
          'location_status', property.location_status
        ) AS property
      FROM public.projects AS project
      LEFT JOIN public.properties AS property
        ON property.id = project.property_id
        AND property.tenant_id = project.tenant_id
      WHERE project.id = ${input.projectId}::uuid
        AND project.customer_id = ${input.customerId}::uuid
        AND project.tenant_id = ${input.tenantId}::uuid
      LIMIT 1
    `;
    return (rows[0] as ProjectDetailRow | undefined) ?? null;
  }

  private async findViaSupabaseRpc(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select(`
        id,
        tenant_id,
        name,
        status,
        budget,
        address,
        property_id,
        start_date,
        style_tags,
        property:properties!projects_property_id_fkey(
          id,
          community,
          building_info,
          layout,
          area,
          latitude,
          longitude,
          province,
          city,
          district,
          adcode,
          location_status
        )
      `)
      .eq("id", input.projectId)
      .eq("customer_id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询客户项目详情失败", error);
    return (data as CustomerSelfServiceProjectListItem | null) ?? null;
  }

  async findOwnedProject(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    if (getDirectPostgresSql() && !this.directSqlUnavailable) {
      try {
        return await this.findViaDirectSql(input);
      } catch {
        this.directSqlUnavailable = true;
      }
    }

    return this.findViaSupabaseRpc(input);
  }

  async findOwnedProjectAccess(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id")
      .eq("id", input.projectId)
      .eq("customer_id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询客户项目访问权限失败", error);
    return (data as CustomerProjectAccessRow | null) ?? null;
  }
}

export const customerProjectDetailRepository =
  new CustomerProjectDetailRepository();
