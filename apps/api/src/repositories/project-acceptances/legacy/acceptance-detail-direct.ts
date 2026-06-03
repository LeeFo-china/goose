import { getDirectPostgresSql } from "@/utils/postgres-direct";
import type { ProjectAcceptanceDetailGraphRow } from "./acceptances";

export async function getAcceptanceDetailGraphDirect(
  this: any,
  id: string,
  tenantId?: string | null,
) {
  const directSql = getDirectPostgresSql();
  if (!directSql || this.acceptanceDetailDirectSqlUnavailable) return null;

  try {
    const rows = await directSql`
      SELECT
        acceptance.*,
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
          WHERE item.acceptance_id = acceptance.id
            AND (item.tenant_id = acceptance.tenant_id OR item.tenant_id IS NULL)
        ), '[]'::jsonb) AS items,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(act) ORDER BY act.created_at ASC)
          FROM public.project_acceptance_actions AS act
          WHERE act.acceptance_id = acceptance.id
            AND (act.tenant_id = acceptance.tenant_id OR act.tenant_id IS NULL)
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
            AND employee.tenant_id = acceptance.tenant_id
          WHERE act.acceptance_id = acceptance.id
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
            AND customer.tenant_id = acceptance.tenant_id
          WHERE act.acceptance_id = acceptance.id
            AND act.operator_type = 'customer'
            AND act.operator_id IS NOT NULL
        ), '[]'::jsonb) AS action_customers,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(ticket) ORDER BY ticket.created_at DESC)
          FROM (
            SELECT *
            FROM public.project_acceptance_open_tickets AS ticket
            WHERE ticket.acceptance_id = acceptance.id
              AND (ticket.tenant_id = acceptance.tenant_id OR ticket.tenant_id IS NULL)
            ORDER BY ticket.created_at DESC
            LIMIT 1
          ) AS ticket
        ), '[]'::jsonb) AS tickets
      FROM public.project_acceptances AS acceptance
      LEFT JOIN public.projects AS project
        ON project.id = acceptance.project_id
        AND project.tenant_id = acceptance.tenant_id
      LEFT JOIN public.employees AS initiator
        ON initiator.id = acceptance.initiator_id
        AND initiator.tenant_id = acceptance.tenant_id
      LEFT JOIN public.employees AS reviewer
        ON reviewer.id = acceptance.reviewer_id
        AND reviewer.tenant_id = acceptance.tenant_id
      LEFT JOIN public.customers AS customer
        ON customer.id = acceptance.customer_id
        AND customer.tenant_id = acceptance.tenant_id
      LEFT JOIN public.tenants AS tenant
        ON tenant.id = customer.tenant_id
      WHERE acceptance.id = ${id}::uuid
        AND (${tenantId ?? null}::uuid IS NULL OR acceptance.tenant_id = ${tenantId ?? null}::uuid)
      LIMIT 1
    `;

    return (rows[0] as ProjectAcceptanceDetailGraphRow | undefined) ?? null;
  } catch {
    this.acceptanceDetailDirectSqlUnavailable = true;
    return null;
  }
}
