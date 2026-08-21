import type {
  TenantDouyinAppointmentRow,
  TenantDouyinCustomerRow,
  TenantDouyinEmployeeRow,
  TenantDouyinFollowUpRow,
  TenantDouyinLeadRow,
} from "@/repositories/tenant-douyin-leads-contract";

export const RELATED_IDS_PER_BATCH = 50;
export const APPOINTMENT_LEAD_IDS_PER_BATCH = 49;
export const APPOINTMENTS_PER_LEAD_LIMIT = 20;

export function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function mapById<T extends { readonly id: string }>(
  rows: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export function groupAppointments(
  rows: readonly TenantDouyinAppointmentRow[],
): ReadonlyMap<string, TenantDouyinAppointmentRow[]> {
  const grouped = new Map<string, TenantDouyinAppointmentRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.marketing_lead_id) ?? [];
    if (bucket.length >= APPOINTMENTS_PER_LEAD_LIMIT) {
      throw new RangeError("appointment hydration limit exceeded");
    }
    bucket.push(row);
    grouped.set(row.marketing_lead_id, bucket);
  }
  return grouped;
}

export type TenantDouyinLeadBundle = {
  readonly lead: TenantDouyinLeadRow;
  readonly appointments: readonly TenantDouyinAppointmentRow[];
  readonly customer: TenantDouyinCustomerRow | null;
  readonly assignee: TenantDouyinEmployeeRow | null;
};

export type TenantDouyinFollowUpBundle = {
  readonly followUp: TenantDouyinFollowUpRow;
  readonly employee: TenantDouyinEmployeeRow | null;
};

export function hydrateLeadBundles(input: {
  leads: readonly TenantDouyinLeadRow[];
  appointments: readonly TenantDouyinAppointmentRow[];
  customers: readonly TenantDouyinCustomerRow[];
  employees: readonly TenantDouyinEmployeeRow[];
}): TenantDouyinLeadBundle[] {
  const appointmentsByLead = groupAppointments(input.appointments);
  const customersById = mapById(input.customers);
  const employeesById = mapById(input.employees);
  return input.leads.map((lead) => ({
    lead,
    appointments: appointmentsByLead.get(lead.id) ?? [],
    customer: lead.customer_id
      ? customersById.get(lead.customer_id) ?? null
      : null,
    assignee: lead.assigned_employee_id
      ? employeesById.get(lead.assigned_employee_id) ?? null
      : null,
  }));
}

export function hydrateFollowUps(
  rows: readonly TenantDouyinFollowUpRow[],
  employees: readonly TenantDouyinEmployeeRow[],
): TenantDouyinFollowUpBundle[] {
  const employeesById = mapById(employees);
  return rows.map((followUp) => ({
    followUp,
    employee: employeesById.get(followUp.employee_id) ?? null,
  }));
}
