import type {
  OcrDocumentType,
  OcrFieldSuggestion,
  OcrWarning,
} from "@gooes/domain";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { OcrNormalizedResult } from "./crypto";

type ProviderRecord = Record<string, unknown>;

export type NormalizedOcrProviderResult = OcrNormalizedResult & {
  providerRequestId: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  license_name: "营业执照主体名称",
  license_code: "统一社会信用代码",
  license_address: "注册地址",
  license_period_begin: "营业期限开始日期",
  license_period_end: "营业期限结束日期",
  legal_representative_name: "法定代表人",
  identity_name: "证件姓名",
  identity_number: "身份证号码",
  identity_address: "身份证地址",
  identity_authority: "签发机关",
  identity_period_begin: "证件有效期开始日期",
  identity_period_end: "证件有效期结束日期",
  settlement_account_number: "结算银行卡号",
  settlement_bank_name: "开户银行",
  settlement_card_type: "银行卡类型",
};

const SENSITIVE_FIELDS = new Set([
  "identity_number",
  "identity_address",
  "settlement_account_number",
]);

export function normalizeOcrResponse(
  documentType: OcrDocumentType,
  response: unknown,
): NormalizedOcrProviderResult {
  const record = asRecord(response);
  if (documentType === "business_license") return normalizeBusinessLicense(record);
  if (documentType === "id_card_front") return normalizeIdCardFront(record);
  if (documentType === "id_card_back") return normalizeIdCardBack(record);
  if (documentType === "bank_card") return normalizeBankCard(record);
  throw invalidResult();
}

function normalizeBusinessLicense(record: ProviderRecord) {
  const rawPeriod = text(record.Period);
  const [periodBegin, periodEnd] = splitPeriod(rawPeriod);
  const fields = compactFields([
    field("license_name", text(record.Name)),
    field("license_code", text(record.RegNum)),
    field("license_address", text(record.Address)),
    field("license_period_begin", periodBegin),
    field("license_period_end", periodEnd),
    field("legal_representative_name", text(record.Person)),
  ]);
  assertHasFields(fields);
  const warningCodes = numberList(record.RecognizeWarnCode);
  const warnings = warningCodes.map((code) => providerWarning(code, "license"));
  if (rawPeriod && !periodBegin) {
    warnings.unshift(warning(
      "DOCUMENT_DATE_INCOMPLETE",
      "营业期限开始日期不完整，请人工核对并补充",
    ));
  }
  if (record.IsDuplication === 1 && !warningCodes.includes(-9102)) {
    warnings.push(warning("DOCUMENT_COPY_SUSPECTED", "证照可能为副本，请人工核对"));
  }
  return result(record, fields, warnings, {});
}

function normalizeIdCardFront(record: ProviderRecord) {
  const fields = compactFields([
    field("identity_name", text(record.Name)),
    field("identity_number", text(record.IdNum)),
    field("identity_address", text(record.Address)),
  ]);
  assertHasFields(fields);
  const advanced = parseAdvancedInfo(record.AdvancedInfo);
  return result(
    record,
    fields,
    numberList(advanced.WarnInfos).map((code) => providerWarning(code, "id_card")),
    number(advanced.Quality) === null ? {} : { score: number(advanced.Quality) },
  );
}

function normalizeIdCardBack(record: ProviderRecord) {
  const [periodBegin, periodEnd] = splitPeriod(text(record.ValidDate));
  const fields = compactFields([
    field("identity_authority", text(record.Authority)),
    field("identity_period_begin", periodBegin),
    field("identity_period_end", periodEnd),
  ]);
  assertHasFields(fields);
  const advanced = parseAdvancedInfo(record.AdvancedInfo);
  return result(
    record,
    fields,
    numberList(advanced.WarnInfos).map((code) => providerWarning(code, "id_card")),
    number(advanced.Quality) === null ? {} : { score: number(advanced.Quality) },
  );
}

function normalizeBankCard(record: ProviderRecord) {
  const fields = compactFields([
    field("settlement_account_number", text(record.CardNo)),
    field("settlement_bank_name", text(record.BankInfo)),
    field("settlement_card_type", text(record.CardType)),
  ]);
  assertHasFields(fields);
  const qualityScore = number(record.QualityValue);
  const warnings = numberList(record.WarningCode).map(
    (code) => providerWarning(code, "bank_card"),
  );
  if (qualityScore !== null && qualityScore < 50) {
    warnings.unshift(warning("IMAGE_QUALITY_LOW", "图片清晰度较低，请人工核对"));
  }
  return result(
    record,
    fields,
    warnings,
    qualityScore === null ? {} : { score: qualityScore },
  );
}

function result(
  record: ProviderRecord,
  fields: OcrFieldSuggestion[],
  warnings: OcrWarning[],
  quality: Record<string, unknown>,
): NormalizedOcrProviderResult {
  return {
    fields,
    warnings: uniqueWarnings(warnings),
    quality,
    providerRequestId: text(record.RequestId),
  };
}

function field(key: string, value: string | null): OcrFieldSuggestion | null {
  if (!value) return null;
  return {
    key,
    label: FIELD_LABELS[key] ?? key,
    value,
    normalized: true,
    sensitive: SENSITIVE_FIELDS.has(key),
    confidence: null,
  };
}

function compactFields(fields: Array<OcrFieldSuggestion | null>) {
  return fields.filter((item): item is OcrFieldSuggestion => Boolean(item));
}

function splitPeriod(value: string | null): [string | null, string | null] {
  if (!value) return [null, null];
  const normalized = value.trim();
  if (normalized === "长期") return [null, "长期"];
  const semanticRange = normalized.match(/^(.+?)\s*(?:至|~|—)\s*(.+)$/);
  if (semanticRange) {
    return [
      normalizeDate(semanticRange[1] ?? ""),
      normalizeDate(semanticRange[2] ?? ""),
    ];
  }
  const dateToken = String.raw`\d{4}(?:-\d{1,2}-\d{1,2}|[./]\d{1,2}[./]\d{1,2}|年\d{1,2}月\d{1,2}日?|\d{4})`;
  const hyphenRange = normalized.match(
    new RegExp(`^(${dateToken})\\s*-\\s*(长期|${dateToken})$`),
  );
  if (hyphenRange) {
    return [
      normalizeDate(hyphenRange[1] ?? ""),
      normalizeDate(hyphenRange[2] ?? ""),
    ];
  }
  return [normalizeDate(normalized), null];
}

function normalizeDate(value: string) {
  const normalized = value.trim();
  if (normalized === "长期") return "长期";
  const compactMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }
  const match = normalized.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/);
  if (!match) return null;
  return `${match[1]}-${match[2]?.padStart(2, "0")}-${match[3]?.padStart(2, "0")}`;
}

function providerWarning(code: number, type: "license" | "id_card" | "bank_card") {
  const mappings: Record<string, [string, string]> = {
    "license:-9102": ["DOCUMENT_COPY_SUSPECTED", "证照可能为复印件，请人工核对"],
    "license:-9104": ["DOCUMENT_RESHOOT_SUSPECTED", "证照可能为翻拍件，请人工核对"],
    "id_card:-9100": ["DOCUMENT_DATE_INVALID", "证件有效期可能不合法，请人工核对"],
    "id_card:-9101": ["DOCUMENT_BORDER_INCOMPLETE", "证件边框可能不完整，请人工核对"],
    "id_card:-9102": ["DOCUMENT_COPY_SUSPECTED", "证件可能为复印件，请人工核对"],
    "id_card:-9103": ["DOCUMENT_RESHOOT_SUSPECTED", "证件可能为翻拍件，请人工核对"],
    "id_card:-9106": ["DOCUMENT_EDIT_SUSPECTED", "证件可能存在编辑痕迹，请人工核对"],
    "id_card:-9107": ["DOCUMENT_REFLECTION_SUSPECTED", "证件可能存在反光，请人工核对"],
    "bank_card:-9110": ["DOCUMENT_DATE_INVALID", "银行卡有效期可能不合法，请人工核对"],
    "bank_card:-9111": ["DOCUMENT_BORDER_INCOMPLETE", "银行卡边框可能不完整，请人工核对"],
    "bank_card:-9112": ["DOCUMENT_REFLECTION_SUSPECTED", "银行卡可能存在反光，请人工核对"],
    "bank_card:-9113": ["DOCUMENT_COPY_SUSPECTED", "银行卡可能为复印件，请人工核对"],
    "bank_card:-9114": ["DOCUMENT_RESHOOT_SUSPECTED", "银行卡可能为翻拍件，请人工核对"],
  };
  const mapped = mappings[`${type}:${code}`] ?? ["PROVIDER_WARNING", `识别服务返回告警码 ${code}`];
  return warning(mapped[0], mapped[1]);
}

function warning(code: string, message: string): OcrWarning {
  return { code, level: "warning", message };
}

function uniqueWarnings(warnings: OcrWarning[]) {
  return [...new Map(warnings.map((item) => [item.code, item])).values()];
}

function parseAdvancedInfo(value: unknown): ProviderRecord {
  if (!value) return {};
  if (typeof value === "object") return value as ProviderRecord;
  if (typeof value !== "string") return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function asRecord(value: unknown): ProviderRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResult();
  return value as ProviderRecord;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite);
}

function assertHasFields(fields: OcrFieldSuggestion[]) {
  if (fields.length === 0) throw invalidResult();
}

function invalidResult() {
  return Errors.business(502, "OCR识别结果格式无效", ErrorCodes.OCR_RESULT_INVALID);
}
