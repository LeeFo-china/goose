import { Errors, SupabaseDB } from "./shared";
import type { ProjectAcceptanceOpenTicketRow } from "@/repositories/project-acceptance-open-tickets";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import type {
  ListAcceptancesInput,
  ProjectAcceptanceActionRow,
  ProjectAcceptanceCustomerRow,
  ProjectAcceptanceEmployeeRow,
  ProjectAcceptanceItemRow,
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
} from "./shared";

export type ProjectAcceptanceDetailGraphRow = ProjectAcceptanceRow & {
  project: ProjectAcceptanceProjectRow | ProjectAcceptanceProjectRow[] | null;
  initiator: ProjectAcceptanceEmployeeRow | ProjectAcceptanceEmployeeRow[] | null;
  reviewer: ProjectAcceptanceEmployeeRow | ProjectAcceptanceEmployeeRow[] | null;
  customer: ProjectAcceptanceCustomerRow | ProjectAcceptanceCustomerRow[] | null;
  items: ProjectAcceptanceItemRow[] | null;
  actions: ProjectAcceptanceActionRow[] | null;
  tickets: ProjectAcceptanceOpenTicketRow[] | null;
};

export async function createAcceptance(this: any, input: Partial<ProjectAcceptanceRow>) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .insert(input)
    .select("*")
    .single();

  if (error) throw Errors.dbError("创建项目验收单失败", error);
  return data as ProjectAcceptanceRow;
}

export async function createItems(this: any, items: Array<Partial<ProjectAcceptanceItemRow>>) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_items")
    .insert(items)
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw Errors.dbError("创建项目验收项失败", error);
  return (data || []) as ProjectAcceptanceItemRow[];
}

export async function listAcceptances(this: any, input: ListAcceptancesInput) {
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;

  const baseQuery = SupabaseDB.getAdminClient().from("project_acceptances");
  let query = (
    input.includeCount === false
      ? baseQuery.select("*")
      : baseQuery.select("*", { count: "exact" })
  )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  if (input.visibleProjectIds) {
    if (input.visibleProjectIds.length === 0) {
      return { list: [] as ProjectAcceptanceRow[], total: 0 };
    }
    query = query.in("project_id", input.visibleProjectIds);
  }

  if (input.project_id) query = query.eq("project_id", input.project_id);
  if (input.acceptance_type) query = query.eq("acceptance_type", input.acceptance_type);
  if (input.status) query = query.eq("status", input.status);
  if (input.stage_code) query = query.eq("stage_code", input.stage_code);
  if (input.reviewer_id) query = query.eq("reviewer_id", input.reviewer_id);
  if (input.customer_id) query = query.eq("customer_id", input.customer_id);

  const { data, error, count } = await query;
  if (error) throw Errors.dbError("查询项目验收列表失败", error);

  return {
    list: (data || []) as ProjectAcceptanceRow[],
    total: count || 0,
  };
}

export async function listProjectAcceptanceDetailGraphs(this: any,
  input: ListAcceptancesInput & {
    tenantId: string;
    project_id: string;
  },
) {
  const directSql = getDirectPostgresSql();
  if (!directSql || this.acceptanceDetailListDirectSqlUnavailable) {
    return null;
  }

  try {
    const offset = (input.page - 1) * input.pageSize;
    const rows = await directSql`
      WITH filtered AS (
        SELECT *
        FROM public.project_acceptances AS acceptance
        WHERE acceptance.tenant_id = ${input.tenantId}::uuid
          AND acceptance.project_id = ${input.project_id}::uuid
          AND (
            ${input.acceptance_type ?? null}::text IS NULL
            OR acceptance.acceptance_type::text = ${input.acceptance_type ?? null}::text
          )
          AND (
            ${input.status ?? null}::text IS NULL
            OR acceptance.status::text = ${input.status ?? null}::text
          )
          AND (
            ${input.stage_code ?? null}::text IS NULL
            OR acceptance.stage_code::text = ${input.stage_code ?? null}::text
          )
          AND (
            ${input.reviewer_id ?? null}::uuid IS NULL
            OR acceptance.reviewer_id = ${input.reviewer_id ?? null}::uuid
          )
          AND (
            ${input.customer_id ?? null}::uuid IS NULL
            OR acceptance.customer_id = ${input.customer_id ?? null}::uuid
          )
      ),
      paged AS (
        SELECT
          filtered.*,
          COUNT(*) OVER()::integer AS total_count
        FROM filtered
        ORDER BY filtered.created_at DESC
        OFFSET ${offset}::integer
        LIMIT ${input.pageSize}::integer
      )
      SELECT
        paged.id,
        paged.tenant_id,
        paged.project_id,
        paged.acceptance_type,
        paged.stage_code,
        paged.template_id,
        paged.template_version,
        paged.template_snapshot,
        paged.title,
        paged.status,
        paged.initiator_id,
        paged.reviewer_id,
        paged.customer_id,
        paged.summary,
        paged.submitted_at,
        paged.reviewed_at,
        paged.customer_confirmed_at,
        paged.completed_at,
        paged.rejected_at,
        paged.reject_reason,
        paged.reject_source,
        paged.created_at,
        paged.updated_at,
        paged.total_count,
        CASE WHEN project.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', project.id,
          'tenant_id', project.tenant_id,
          'name', project.name,
          'customer_id', project.customer_id,
          'status', project.status
        ) END AS project,
        CASE WHEN initiator.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', initiator.id,
          'tenant_id', initiator.tenant_id,
          'name', initiator.name,
          'avatar', initiator.avatar
        ) END AS initiator,
        CASE WHEN reviewer.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', reviewer.id,
          'tenant_id', reviewer.tenant_id,
          'name', reviewer.name,
          'avatar', reviewer.avatar
        ) END AS reviewer,
        CASE WHEN customer.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', customer.id,
          'tenant_id', customer.tenant_id,
          'name', customer.name,
          'phone', customer.phone,
          'user_id', customer.user_id,
          'tenant', CASE WHEN tenant.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', tenant.id,
            'status', tenant.status
          ) END
        ) END AS customer,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(item) ORDER BY item.sort_order ASC, item.created_at ASC)
          FROM public.project_acceptance_items AS item
          WHERE item.acceptance_id = paged.id
            AND (item.tenant_id = paged.tenant_id OR item.tenant_id IS NULL)
        ), '[]'::jsonb) AS items,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(act) ORDER BY act.created_at ASC)
          FROM public.project_acceptance_actions AS act
          WHERE act.acceptance_id = paged.id
            AND (act.tenant_id = paged.tenant_id OR act.tenant_id IS NULL)
        ), '[]'::jsonb) AS actions,
        COALESCE((
          SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'id', employee.id,
            'tenant_id', employee.tenant_id,
            'name', employee.name,
            'avatar', employee.avatar
          ))
          FROM public.project_acceptance_actions AS act
          JOIN public.employees AS employee
            ON employee.id = act.operator_id
            AND employee.tenant_id = paged.tenant_id
          WHERE act.acceptance_id = paged.id
            AND act.operator_type = 'employee'
            AND act.operator_id IS NOT NULL
        ), '[]'::jsonb) AS action_employees,
        COALESCE((
          SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'id', customer.id,
            'tenant_id', customer.tenant_id,
            'name', customer.name,
            'phone', customer.phone,
            'user_id', customer.user_id
          ))
          FROM public.project_acceptance_actions AS act
          JOIN public.customers AS customer
            ON customer.id = act.operator_id
            AND customer.tenant_id = paged.tenant_id
          WHERE act.acceptance_id = paged.id
            AND act.operator_type = 'customer'
            AND act.operator_id IS NOT NULL
        ), '[]'::jsonb) AS action_customers,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(ticket) ORDER BY ticket.created_at DESC)
          FROM (
            SELECT *
            FROM public.project_acceptance_open_tickets AS ticket
            WHERE ticket.acceptance_id = paged.id
              AND (ticket.tenant_id = paged.tenant_id OR ticket.tenant_id IS NULL)
            ORDER BY ticket.created_at DESC
            LIMIT 1
          ) AS ticket
        ), '[]'::jsonb) AS tickets
      FROM paged
      LEFT JOIN public.projects AS project
        ON project.id = paged.project_id
        AND project.tenant_id = paged.tenant_id
      LEFT JOIN public.employees AS initiator
        ON initiator.id = paged.initiator_id
        AND initiator.tenant_id = paged.tenant_id
      LEFT JOIN public.employees AS reviewer
        ON reviewer.id = paged.reviewer_id
        AND reviewer.tenant_id = paged.tenant_id
      LEFT JOIN public.customers AS customer
        ON customer.id = paged.customer_id
        AND customer.tenant_id = paged.tenant_id
      LEFT JOIN public.tenants AS tenant
        ON tenant.id = customer.tenant_id
      ORDER BY paged.created_at DESC
    `;

    const graphRows = rows as Array<ProjectAcceptanceDetailGraphRow & {
      total_count?: number;
    }>;
    const total = Number((graphRows[0] as { total_count?: number } | undefined)
      ?.total_count ?? 0);
    const list = graphRows.map((row) => {
      const { total_count: _totalCount, ...graph } = row as (
        ProjectAcceptanceDetailGraphRow & { total_count?: number }
      );
      return graph as ProjectAcceptanceDetailGraphRow;
    });
    return { list, total };
  } catch {
    this.acceptanceDetailListDirectSqlUnavailable = true;
    return null;
  }
}

export async function getAcceptanceById(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .select("*")
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw Errors.dbError("查询项目验收单失败", error);
  return (data || null) as ProjectAcceptanceRow | null;
}

export async function getAcceptanceDetailGraph(this: any,
  id: string,
  tenantId?: string | null,
) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .select(`
      *,
      project:projects!project_acceptances_project_id_fkey(id, tenant_id, name, customer_id, status),
      initiator:employees!project_acceptances_initiator_id_fkey(id, tenant_id, name, avatar),
      reviewer:employees!project_acceptances_reviewer_id_fkey(id, tenant_id, name, avatar),
      customer:customers!project_acceptances_customer_id_fkey(
        id,
        tenant_id,
        name,
        phone,
        user_id,
        tenant:tenants!customers_tenant_id_fkey(id,status)
      ),
      items:project_acceptance_items!project_acceptance_items_acceptance_id_fkey(*),
      actions:project_acceptance_actions!project_acceptance_actions_acceptance_id_fkey(*),
      tickets:project_acceptance_open_tickets!project_acceptance_open_tickets_acceptance_id_fkey(*)
    `)
    .eq("id", id)
    .order("sort_order", {
      referencedTable: "project_acceptance_items",
      ascending: true,
    })
    .order("created_at", {
      referencedTable: "project_acceptance_items",
      ascending: true,
    })
    .order("created_at", {
      referencedTable: "project_acceptance_actions",
      ascending: true,
    })
    .order("created_at", {
      referencedTable: "project_acceptance_open_tickets",
      ascending: false,
    })
    .limit(1, { referencedTable: "project_acceptance_open_tickets" });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw Errors.dbError("查询项目验收详情失败", error);
  return (data || null) as ProjectAcceptanceDetailGraphRow | null;
}

export async function updateAcceptance(this: any, 
  id: string,
  input: Record<string, unknown>,
  tenantId?: string | null,
) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .update(input)
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) throw Errors.dbError("更新项目验收单失败", error);
  if (!data) throw Errors.badRequest("项目验收单不存在");
  return data as ProjectAcceptanceRow;
}

export async function deleteAcceptance(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .delete()
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { error } = await query.select("id");

  if (error) throw Errors.dbError("删除项目验收草稿失败", error);
}
