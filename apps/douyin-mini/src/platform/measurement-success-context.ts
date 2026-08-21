import type { DouyinVisitPeriod } from "../models";

const APPOINTMENT_NO_PATTERN = /^DYLF-\d{8}-\d{6}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEXT_KEYS = [
  "appointmentNo",
  "preferredVisitDate",
  "preferredVisitPeriod",
  "linkedEstimateId",
] as const;

export type MeasurementSuccessContext = {
  appointmentNo: string;
  preferredVisitDate: string;
  preferredVisitPeriod: DouyinVisitPeriod;
  linkedEstimateId: string | null;
};

let successContext: MeasurementSuccessContext | null = null;
let budgetResultReturnIntent: string | null = null;

export function writeMeasurementSuccessContext(value: unknown): boolean {
  const parsed = parseSuccessContext(value);
  if (!parsed) return false;
  successContext = copyContext(parsed);
  budgetResultReturnIntent = null;
  return true;
}

export function readMeasurementSuccessContext(): MeasurementSuccessContext | null {
  return successContext ? copyContext(successContext) : null;
}

export function clearMeasurementSuccessContext(): void {
  successContext = null;
  budgetResultReturnIntent = null;
}

export function writeBudgetResultReturnIntent(estimateId: unknown): boolean {
  if (typeof estimateId !== "string"
    || successContext?.linkedEstimateId !== estimateId) return false;
  budgetResultReturnIntent = estimateId;
  return true;
}

export function consumeBudgetResultReturnIntent(): string | null {
  const intent = budgetResultReturnIntent;
  budgetResultReturnIntent = null;
  return intent;
}

function parseSuccessContext(value: unknown): MeasurementSuccessContext | null {
  if (!isRecord(value) || !hasOnlyKeys(value, CONTEXT_KEYS)
    || typeof value.appointmentNo !== "string"
    || !APPOINTMENT_NO_PATTERN.test(value.appointmentNo)
    || typeof value.preferredVisitDate !== "string"
    || !isNaturalDate(value.preferredVisitDate)
    || !isVisitPeriod(value.preferredVisitPeriod)
    || (value.linkedEstimateId !== null
      && (typeof value.linkedEstimateId !== "string"
        || !UUID_PATTERN.test(value.linkedEstimateId)))) return null;
  return {
    appointmentNo: value.appointmentNo,
    preferredVisitDate: value.preferredVisitDate,
    preferredVisitPeriod: value.preferredVisitPeriod,
    linkedEstimateId: value.linkedEstimateId,
  };
}

function copyContext(value: MeasurementSuccessContext): MeasurementSuccessContext {
  return { ...value };
}

function isNaturalDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isVisitPeriod(value: unknown): value is DouyinVisitPeriod {
  return value === "morning" || value === "afternoon" || value === "evening";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length
    && actualKeys.every((key) => keys.includes(key));
}
