import {
  DOUYIN_APPOINTMENT_STATUS_VALUES,
  DouyinBudgetAiAnalysisSchema,
  type DouyinAppointmentStatus,
} from "@gooes/domain";

export type DouyinCustomerSourceMetadata = {
  appointment_no: string | null;
  status: DouyinAppointmentStatus | null;
  estimate_no: string | null;
  minimum_total: number | null;
  maximum_total: number | null;
  ai_status: "pending" | "succeeded" | "failed" | "skipped" | null;
  ai_summary: string | null;
  allocation_advice: string[];
  risk_factors: string[];
  onsite_questions: string[];
};

const DOUYIN_APPOINTMENT_STATUS_SET = new Set<string>(
  DOUYIN_APPOINTMENT_STATUS_VALUES,
);
const DOUYIN_AI_STATUS_SET = new Set([
  "pending",
  "succeeded",
  "failed",
  "skipped",
]);
const EMPTY_DOUYIN_SOURCE_METADATA: DouyinCustomerSourceMetadata = {
  appointment_no: null,
  status: null,
  estimate_no: null,
  minimum_total: null,
  maximum_total: null,
  ai_status: null,
  ai_summary: null,
  allocation_advice: [],
  risk_factors: [],
  onsite_questions: [],
};

export function serializeDouyinCustomerSourceMetadata(
  metadata: unknown,
): DouyinCustomerSourceMetadata {
  const source = asRecord(metadata);
  if (!source) return { ...EMPTY_DOUYIN_SOURCE_METADATA };

  const appointmentNo = readPatternString(
    source.appointment_no,
    /^DYLF-\d{8}-\d{6}$/,
  );
  const status = typeof source.appointment_status === "string"
      && DOUYIN_APPOINTMENT_STATUS_SET.has(source.appointment_status)
    ? source.appointment_status as DouyinAppointmentStatus
    : null;
  const estimate = asRecord(source.budget_estimate);
  if (!estimate) {
    return {
      ...EMPTY_DOUYIN_SOURCE_METADATA,
      appointment_no: appointmentNo,
      status,
    };
  }

  const result = asRecord(estimate.result);
  const estimateNo = readPatternString(
    estimate.estimate_no,
    /^DYYS-\d{8}-\d{6}$/,
  );
  const minimumTotal = readSafeAmount(result?.minimum_total);
  const maximumTotal = readSafeAmount(result?.maximum_total);
  const isValidRange = estimateNo !== null
    && minimumTotal !== null
    && maximumTotal !== null
    && minimumTotal <= maximumTotal;
  if (!isValidRange) {
    return {
      ...EMPTY_DOUYIN_SOURCE_METADATA,
      appointment_no: appointmentNo,
      status,
    };
  }

  const aiStatus = typeof estimate.ai_status === "string"
      && DOUYIN_AI_STATUS_SET.has(estimate.ai_status)
    ? estimate.ai_status as DouyinCustomerSourceMetadata["ai_status"]
    : null;
  const aiAnalysis = DouyinBudgetAiAnalysisSchema.safeParse(
    estimate.ai_analysis,
  );
  const analysis = aiStatus === "succeeded" && aiAnalysis.success
    ? aiAnalysis.data
    : null;

  return {
    appointment_no: appointmentNo,
    status,
    estimate_no: estimateNo,
    minimum_total: minimumTotal,
    maximum_total: maximumTotal,
    ai_status: aiStatus,
    ai_summary: analysis?.summary ?? null,
    allocation_advice: analysis ? [...analysis.allocation_advice] : [],
    risk_factors: analysis ? [...analysis.risk_factors] : [],
    onsite_questions: analysis ? [...analysis.onsite_questions] : [],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readPatternString(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function readSafeAmount(value: unknown): number | null {
  return typeof value === "number"
      && Number.isSafeInteger(value)
      && value >= 0
    ? value
    : null;
}
