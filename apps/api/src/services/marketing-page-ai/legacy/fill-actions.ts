import { aiGateway, CREATE_SYSTEM_PROMPT, Errors, SETTINGS_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./shared";
import type { MarketingPageAiBillingContext, MarketingPageBlockAiFillInput, MarketingPageCreateAiFillInput, MarketingPageSettingsAiFillInput, OpenAiRequestBody } from "./shared";
import { buildCreateUserPrompt, buildSettingsUserPrompt, buildUserPrompt, getAllowedFieldDefinitions, getAllowedSettingsFieldDefinitions } from "./prompts";
import { normalizeCreateResult, normalizePatch, parseJsonObject, resolveAiBillingContext } from "./normalization";

export async function fillMarketingPageBlockWithAi(
  input: MarketingPageBlockAiFillInput & MarketingPageAiBillingContext,
) {
  const fieldDefinitions = getAllowedFieldDefinitions(input);
  if (Object.keys(fieldDefinitions).length === 0) {
    throw Errors.badRequest("当前模块暂无可由 AI 填写的字段");
  }
  const billingContext = resolveAiBillingContext(input);

  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input, fieldDefinitions) },
  ];

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "marketing_page_block_fill",
      tenantId: billingContext.tenantId,
      source: billingContext.source,
      billable: billingContext.billable,
      temperature: 0.4,
      messages,
      responseFormat: "json_object",
      metadata: {
        auth_user_id: input.authUserId ?? null,
        page_id: input.page?.id ?? null,
        block_id: input.block.id,
        block_type: input.block.type,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "marketing_page_block_fill",
      tenantId: billingContext.tenantId,
      source: billingContext.source,
      billable: billingContext.billable,
      temperature: 0.4,
      messages,
      metadata: {
        auth_user_id: input.authUserId ?? null,
        page_id: input.page?.id ?? null,
        block_id: input.block.id,
        block_type: input.block.type,
      },
    });
  }

  const content = result.content;
  if (!content) {
    throw Errors.dbError("大模型未返回有效内容");
  }

  const patch = normalizePatch(parseJsonObject(content), fieldDefinitions);
  if (Object.keys(patch).length === 0) {
    throw Errors.badRequest("AI 未返回可用的模块内容");
  }

  return {
    patch,
    fields: Object.keys(patch),
  };
}

export async function fillMarketingPageSettingsWithAi(
  input: MarketingPageSettingsAiFillInput & MarketingPageAiBillingContext,
) {
  const fieldDefinitions = getAllowedSettingsFieldDefinitions(input);
  if (Object.keys(fieldDefinitions).length === 0) {
    throw Errors.badRequest("当前配置暂无可由 AI 填写的字段");
  }
  const billingContext = resolveAiBillingContext(input);

  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: SETTINGS_SYSTEM_PROMPT },
    { role: "user", content: buildSettingsUserPrompt(input, fieldDefinitions) },
  ];

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "marketing_page_settings_fill",
      tenantId: billingContext.tenantId,
      source: billingContext.source,
      billable: billingContext.billable,
      temperature: 0.35,
      messages,
      responseFormat: "json_object",
      metadata: {
        auth_user_id: input.authUserId ?? null,
        page_id: input.page?.id ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "marketing_page_settings_fill",
      tenantId: billingContext.tenantId,
      source: billingContext.source,
      billable: billingContext.billable,
      temperature: 0.35,
      messages,
      metadata: {
        auth_user_id: input.authUserId ?? null,
        page_id: input.page?.id ?? null,
      },
    });
  }

  const content = result.content;
  if (!content) {
    throw Errors.dbError("大模型未返回有效内容");
  }

  const patch = normalizePatch(parseJsonObject(content), fieldDefinitions, {
    normalizeSlugField: true,
  });
  if (Object.keys(patch).length === 0) {
    throw Errors.badRequest("AI 未返回可用的配置内容");
  }

  return {
    patch,
    fields: Object.keys(patch),
  };
}

export async function fillMarketingPageCreateWithAi(input: MarketingPageCreateAiFillInput & {
  scope: "tenant" | "platform";
  tenantId?: string | null;
  tenantName?: string | null;
  source?: string | null;
  billable?: boolean;
  authUserId?: string | null;
  pages?: Array<{
    title: string;
    slug: string;
    status: string;
    description: string | null;
  }>;
}) {
  const billingContext = resolveAiBillingContext(input);
  const messages: OpenAiRequestBody["messages"] = [
    { role: "system", content: CREATE_SYSTEM_PROMPT },
    { role: "user", content: buildCreateUserPrompt(input) },
  ];

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "marketing_page_create_fill",
      tenantId: billingContext.tenantId,
      source: billingContext.source,
      billable: billingContext.billable,
      temperature: 0.45,
      messages,
      responseFormat: "json_object",
      metadata: {
        auth_user_id: input.authUserId ?? null,
        scope: input.scope,
        tenant_name: input.tenantName ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "marketing_page_create_fill",
      tenantId: billingContext.tenantId,
      source: billingContext.source,
      billable: billingContext.billable,
      temperature: 0.45,
      messages,
      metadata: {
        auth_user_id: input.authUserId ?? null,
        scope: input.scope,
        tenant_name: input.tenantName ?? null,
      },
    });
  }

  const content = result.content;
  if (!content) {
    throw Errors.business(
      502,
      "AI 生成失败，请稍后重试",
      "MARKETING_PAGE_CREATE_AI_EMPTY",
    );
  }

  return normalizeCreateResult(parseJsonObject(content));
}
