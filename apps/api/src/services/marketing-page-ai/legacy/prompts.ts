import { BLOCK_AI_FIELD_DEFINITIONS, PAGE_SETTINGS_AI_FIELD_DEFINITIONS } from "./shared";
import type { FieldDefinition, MarketingPageBlockAiFillInput, MarketingPageCreateAiFillInput, MarketingPageSettingsAiFillInput } from "./shared";

export function getAllowedFieldDefinitions(input: MarketingPageBlockAiFillInput) {
  const serverDefinitions = BLOCK_AI_FIELD_DEFINITIONS[input.block.type] || {};
  const allowed: Record<string, FieldDefinition> = {};

  for (const [key, serverDefinition] of Object.entries(serverDefinitions)) {
    const clientDefinition = input.field_schema[key];
    if (!clientDefinition) {
      continue;
    }

    allowed[key] = {
      ...serverDefinition,
      label: clientDefinition.label || serverDefinition.label,
      maxLength: Math.min(
        clientDefinition.maxLength || serverDefinition.maxLength,
        serverDefinition.maxLength,
      ),
      options: serverDefinition.options || clientDefinition.options,
    };
  }

  return allowed;
}

export function getAllowedSettingsFieldDefinitions(input: MarketingPageSettingsAiFillInput) {
  const allowed: Record<string, FieldDefinition> = {};

  for (const [key, serverDefinition] of Object.entries(PAGE_SETTINGS_AI_FIELD_DEFINITIONS)) {
    const clientDefinition = input.field_schema[key];
    if (!clientDefinition) {
      continue;
    }

    allowed[key] = {
      ...serverDefinition,
      label: clientDefinition.label || serverDefinition.label,
      maxLength: Math.min(
        clientDefinition.maxLength || serverDefinition.maxLength,
        serverDefinition.maxLength,
      ),
      options: serverDefinition.options || clientDefinition.options,
    };
  }

  return allowed;
}

export function summarizeBlock(block: MarketingPageBlockAiFillInput["block"]) {
  const props = block.props || {};
  const summary: Record<string, unknown> = {
    id: block.id,
    type: block.type,
  };

  for (const key of ["title", "kicker", "subtitle", "content", "description", "text", "buttonText", "submitText", "caption"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) {
      summary[key] = value.trim().slice(0, 160);
    }
  }

  return summary;
}

export function summarizeConfig(input: MarketingPageBlockAiFillInput) {
  const blocks = input.config?.blocks || [];
  return {
    title: input.config?.title || input.page?.title || "",
    block_count: blocks.length,
    blocks: blocks.slice(0, 30).map((block, index) => ({
      index: index + 1,
      label: BLOCK_AI_FIELD_DEFINITIONS[block.type] ? block.type : "unknown",
      current: summarizeBlock(block),
    })),
  };
}

export function buildUserPrompt(
  input: MarketingPageBlockAiFillInput,
  fieldSchema: Record<string, FieldDefinition>,
) {
  return JSON.stringify({
    page: input.page || {},
    page_context: summarizeConfig(input),
    target_block: summarizeBlock(input.block),
    field_schema: fieldSchema,
    extra_instruction: input.instruction || "",
  });
}

export function buildSettingsUserPrompt(
  input: MarketingPageSettingsAiFillInput,
  fieldSchema: Record<string, FieldDefinition>,
) {
  return JSON.stringify({
    target_page: input.page || {},
    nearby_pages: (input.pages || []).slice(0, 30),
    field_schema: fieldSchema,
    extra_instruction: input.instruction || "",
  });
}

export function buildCreateUserPrompt(input: MarketingPageCreateAiFillInput & {
  scope: "tenant" | "platform";
  tenantName?: string | null;
  pages?: Array<{
    title: string;
    slug: string;
    status: string;
    description: string | null;
  }>;
}) {
  return JSON.stringify({
    scope: input.scope,
    tenant_name: input.tenantName || null,
    user_instruction: input.instruction,
    nearby_pages: (input.pages || []).slice(0, 20),
    output_schema: {
      title: "页面标题，不超过 30 个中文字符",
      description: "页面描述，不超过 80 个中文字符",
    },
  });
}
