import type { LeadField, LeadFormValue } from "./form-model";

export const INITIAL_FORM: LeadFormValue = {
  name: "",
  phone: "",
  sms_code: "",
  community: "",
  preferred_visit_date: "",
  preferred_visit_period: "",
  demand: "",
  consented_at: "",
};

export const LEAD_FIELDS = new Set<LeadField>([
  "name",
  "phone",
  "sms_code",
  "community",
  "preferred_visit_date",
  "preferred_visit_period",
  "demand",
  "consented_at",
]);
