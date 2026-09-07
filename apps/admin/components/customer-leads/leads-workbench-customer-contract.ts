import { z } from "zod";
import { CUSTOMER_LEAD_SOURCE_VALUES, CUSTOMER_LEAD_STATUS_VALUES,
  type CustomerLeadSummary, type CustomerLeadAppointment } from "@gooes/domain";
import { appointmentCommonShape, employeeSchema, followUpSchema, paginationSchema,
  sourceSchema, validPage, type Appointment, type LeadRow, type LeadPage,
  type LeadDetail, type Pagination, type AppointmentPage, type FollowUpPage } from "./leads-workbench-contract";

const summaryShape = {
  id: z.uuid(), source: z.enum(CUSTOMER_LEAD_SOURCE_VALUES), source_label: z.string().min(1),
  name: z.string().nullable(), phone_masked: z.string().nullable(), community: z.string().nullable(),
  status: z.enum(CUSTOMER_LEAD_STATUS_VALUES), version: z.int().min(1),
  assigned_employee_id: z.uuid().nullable(), assignee: employeeSchema.nullable(),
  customer_id: z.uuid().nullable(), can_view_customer: z.boolean(),
  created_at: z.iso.datetime({ offset: true }), followed_at: z.iso.datetime({ offset: true }).nullable(),
  follow_remark: z.string().nullable(),
};
const validCustomerLink = (row: { customer_id: string | null; can_view_customer: boolean }) =>
  row.can_view_customer === (row.customer_id !== null);
const summarySchema = z.strictObject(summaryShape).refine(validCustomerLink);
const appointmentSchema = z.strictObject({ ...appointmentCommonShape,
  source_context: sourceSchema.nullable() });
const historySchema = followUpSchema.extend({ id: z.uuid(), appointment_id: z.uuid().nullable() });
const appointmentPageSchema = z.strictObject({ list: z.array(appointmentSchema), pagination: paginationSchema });
const followUpPageSchema = z.strictObject({ list: z.array(historySchema), pagination: paginationSchema });
const availabilitySchema = z.discriminatedUnion("enabled", [
  z.strictObject({ enabled: z.literal(true), reason: z.null() }),
  z.strictObject({ enabled: z.literal(false), reason: z.string().min(1) }),
]);
const customerSourceSchema = sourceSchema.extend({
  h5: z.strictObject({ page_id: z.uuid().nullable(), page_version_id: z.uuid().nullable(),
    page_title: z.string().nullable(), page_slug: z.string().nullable() }).optional(),
});
const detailSchema = z.strictObject({ ...summaryShape,
  source_context: customerSourceSchema.nullable(), latest_appointment: appointmentSchema.nullable(),
  appointments: appointmentPageSchema, follow_ups: followUpPageSchema,
  actions: z.strictObject({ assign: availabilitySchema, follow_up: availabilitySchema,
    convert: availabilitySchema, mark_invalid: availabilitySchema }),
}).refine(validCustomerLink);
const pageSchema = z.strictObject({ list: z.array(summarySchema), pagination: paginationSchema });

// Parsed DTOs are projected into the existing workbench view; legacy parsers stay strict.
function projectSummary(row: CustomerLeadSummary | z.infer<typeof summarySchema>): LeadRow {
  return { ...row, customer: null, latest_appointment: null };
}
function projectAppointment(row: CustomerLeadAppointment): Appointment {
  const { source_context: context, ...appointment } = row;
  return { ...appointment, budget_range: context?.budget ?? null,
    ...(context ? { source: { ...context, ai: context.ai ? {
      ...context.ai, allocation_advice: [...context.ai.allocation_advice],
      risk_factors: [...context.ai.risk_factors], onsite_questions: [...context.ai.onsite_questions],
    } : null } } : {}) };
}
export function normalizeCustomerLeadPage(raw: unknown, expected: Pagination | { page: number; pageSize: number }): LeadPage | null {
  const parsed = pageSchema.safeParse(raw);
  return parsed.success && validPage(parsed.data, expected)
    ? { list: parsed.data.list.map(projectSummary), pagination: parsed.data.pagination } : null;
}
export function normalizeCustomerLeadDetail(raw: unknown): LeadDetail | null {
  const parsed = detailSchema.safeParse(raw);
  if (!parsed.success || !validPage(parsed.data.appointments, { page: 1, pageSize: 20 })
    || !validPage(parsed.data.follow_ups, { page: 1, pageSize: 20 })) return null;
  const row = parsed.data;
  return { ...projectSummary(row),
    ...(row.source_context ?? { attribution: {}, demand: null, budget: null, ai: null }),
    actions: row.actions,
    latest_appointment: row.latest_appointment ? projectAppointment(row.latest_appointment) : null,
    appointments: { list: row.appointments.list.map(projectAppointment),
      pagination: row.appointments.pagination,
      truncated: row.appointments.pagination.total > row.appointments.list.length },
    follow_ups: row.follow_ups };
}
export function normalizeCustomerAppointmentPage(raw: unknown, expected: { page: number; pageSize: number }): AppointmentPage | null {
  const parsed = appointmentPageSchema.safeParse(raw);
  return parsed.success && validPage(parsed.data, expected)
    ? { list: parsed.data.list.map(projectAppointment), pagination: parsed.data.pagination } : null;
}
export function normalizeCustomerFollowUpPage(raw: unknown, expected: { page: number; pageSize: number }): FollowUpPage | null {
  const parsed = followUpPageSchema.safeParse(raw);
  return parsed.success && validPage(parsed.data, expected) ? parsed.data : null;
}
