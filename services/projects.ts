import {
    type ProjectListQuery,
    ProjectListQuerySchema,
} from "@/schema/projects";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

class ProjectService {
    async getProjectsByStatus(param: ProjectListQuery) {
        const { page, pageSize } = param;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = SupabaseDB
            .from("projects")
            .select(
                `
            id,
            name,
            status,
            budget,
            address,
            created_at,
            designer:employees!projects_designer_id_fkey(
              id,
              name,
              avatar,
              phone
            ),
        property:properties!projects_property_id_fkey(community,building_info,area,layout,latitude,longitude),
            customer:customers!projects_customer_id_fkey(
              id,
              name,
           
              phone
            ),
        
            supervisor:employees!projects_supervisor_id_fkey(
              id,
              name,
              avatar,
              phone
            )
            `,
                { count: "exact" },
            );
        // .order("created_at", { ascending: false })
        // .range(from, to);

        if (param.status) {
            query = query.eq("status", param.status);
        }
        if (param.keyword) {
            query = query.or(
                `name.ilike.%${param.keyword}%,address.ilike.%${param.keyword}%`,
            );
        }

        const { data, error, count } = await query
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) throw Errors.dbError("列表查询失败", error);

        return {
            list: data || [],
            pagination: {
                page,
                pageSize,
                total: count || 0,
                totalPages: count ? Math.ceil(count / pageSize) : 0,
            },
        };
    }

    async searchProjectsByName() {
    }
}

export const projectSer = new ProjectService();
