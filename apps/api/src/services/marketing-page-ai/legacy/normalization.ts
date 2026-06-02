import { Errors } from "./shared";
import type { FieldDefinition, MarketingPageAiBillingContext } from "./shared";

export function parseJsonObject(content: string) {
  const trimmed = content.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }

  return {};
}

export function truncateByChars(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

export function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function normalizePatchValue(value: unknown, definition: FieldDefinition) {
  if (value == null || typeof value === "object") {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (definition.type === "select") {
    return definition.options?.includes(text) ? text : null;
  }

  return truncateByChars(text, definition.maxLength);
}

export function normalizePatch(
  raw: unknown,
  definitions: Record<string, FieldDefinition>,
  options: { normalizeSlugField?: boolean } = {},
) {
  const source = raw && typeof raw === "object" && "patch" in raw
    ? (raw as { patch?: unknown }).patch
    : raw;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  const patch: Record<string, string> = {};

  for (const [key, definition] of Object.entries(definitions)) {
    let normalized = normalizePatchValue((source as Record<string, unknown>)[key], definition);
    if (normalized && options.normalizeSlugField && key === "slug") {
      normalized = normalizeSlug(normalized);
    }
    if (normalized) {
      patch[key] = normalized;
    }
  }

  return patch;
}

export function normalizeCreateResult(raw: unknown) {
  const source = raw && typeof raw === "object" && "patch" in raw
    ? (raw as { patch?: unknown }).patch
    : raw;

  const definitions: Record<string, FieldDefinition> = {
    title: { type: "string", label: "页面标题", maxLength: 30 },
    description: { type: "text", label: "页面描述", maxLength: 80 },
  };
  const patch = normalizePatch(source, definitions);

  if (!patch.title || !patch.description) {
    throw Errors.business(
      502,
      "AI 生成结果格式异常，请重新生成",
      "MARKETING_PAGE_CREATE_AI_PARSE_FAILED",
    );
  }

  return {
    title: patch.title,
    description: patch.description,
  };
}

export function resolveAiBillingContext(input: MarketingPageAiBillingContext) {
  return {
    tenantId: input.tenantId ?? null,
    source: input.source ?? (input.tenantId ? "admin" : "platform_admin"),
    billable: input.billable ?? Boolean(input.tenantId),
  };
}
