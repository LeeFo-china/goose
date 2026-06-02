import { randomUUID } from 'node:crypto';
import {
  Errors,
  aiGateway,
  type DecorationQaAuthInput,
  type DecorationQaRequestInput,
  type DecorationQaResult,
  type DecorationQaStreamEvent,
  type DecorationQaStreamRequestInput,
  type OpenAiChatResponse,
  type OpenAiChatStreamChunk,
  type OpenAiRequestBody,
} from './shared';
import {
  buildHeaders,
  buildMessages,
  extractDeltaContent,
  getAiRequestTimeoutMs,
  getStreamingSystemPrompt,
  getSystemPrompt,
  normalizeTotalTokens,
  parseQaResult,
} from './ai-runtime';
import { resolveDecorationQaUsageContext } from './usage';
import { buildCustomerProjectQaContext } from './project-context';
import { formatCustomerProjectQaContext } from './project-format';

export async function resolveDecorationQaStreamSystemMessages(
  input: DecorationQaStreamRequestInput,
  authUserId?: string,
) {
  if (input.context?.role !== "customer") {
    return [] as string[];
  }

  const projectId = input.context.project_id?.trim();
  if (!projectId) {
    return [] as string[];
  }

  if (!authUserId) {
    throw Errors.unauthorized("缺少登录凭证");
  }

  const context = await buildCustomerProjectQaContext(authUserId, projectId);
  return [formatCustomerProjectQaContext(context)];
}

export async function requestQaResult(
  endpoint: string,
  apiKey: string,
  requestBody: OpenAiRequestBody,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    await getAiRequestTimeoutMs(),
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: await buildHeaders(apiKey, endpoint),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const result = await response.json() as OpenAiChatResponse;

    if (!response.ok) {
      throw Errors.dbError(result.error?.message || "大模型接口调用失败");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createStreamRequestBody(
  input: DecorationQaStreamRequestInput,
  model: string,
  temperature: number,
  extraSystemMessages: string[] = [],
): Promise<OpenAiRequestBody> {
  return {
    model,
    temperature,
    messages: buildMessages(
      input.question,
      [],
      await getStreamingSystemPrompt(),
      extraSystemMessages,
    ),
    stream: true,
    stream_options: {
      include_usage: true,
    },
  };
}

export async function requestQaStream(
  endpoint: string,
  apiKey: string,
  requestBody: OpenAiRequestBody,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: await buildHeaders(apiKey, endpoint),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const result = await response.json() as OpenAiChatResponse;
      throw Errors.dbError(result.error?.message || "大模型流式调用失败");
    }

    if (!response.body) {
      throw Errors.dbError("大模型未返回可读取的流");
    }

    return {
      response,
      body: response.body,
      controller,
      clearTimeout: () => clearTimeout(timeout),
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export function toNdjson(event: DecorationQaStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function parseSseEvent(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  return trimmed.slice(5).trim();
}

export async function askDecorationQa(
  input: DecorationQaRequestInput,
  options?: DecorationQaAuthInput,
): Promise<DecorationQaResult> {
  const messages = buildMessages(
    input.question,
    input.history,
    await getSystemPrompt(),
  );
  const usageContext = await resolveDecorationQaUsageContext({
    authUserId: options?.authUserId,
    tenantId: options?.tenantId,
    customerId: options?.customerId,
    employeeId: options?.employeeId,
    roles: options?.roles,
  });

  let result: Awaited<ReturnType<typeof aiGateway.chat>>;

  try {
    result = await aiGateway.chat({
      sceneCode: "decoration_qa",
      tenantId: usageContext.tenantId,
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
      },
      temperature: 0.7,
      messages,
      responseFormat: "json_object",
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "大模型接口调用失败";

    if (!message.includes("response_format")) {
      throw error;
    }

    result = await aiGateway.chat({
      sceneCode: "decoration_qa",
      tenantId: usageContext.tenantId,
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
      },
      temperature: 0.7,
      messages,
    });
  }

  const content = result.content;

  if (!content) {
    throw Errors.dbError("大模型未返回有效内容");
  }

  return parseQaResult(content);
}

export async function streamDecorationQa(
  input: DecorationQaStreamRequestInput,
  onEvent: (event: DecorationQaStreamEvent) => Promise<void> | void,
  options?: {
    authUserId?: string;
    tenantId?: string | null;
    customerId?: string | null;
    employeeId?: string | null;
    roles?: string[];
    extraSystemMessages?: string[];
    signal?: AbortSignal;
  },
) {
  const routeConfig = await aiGateway.resolveChatConfig({
    sceneCode: "decoration_qa",
    temperature: 0.7,
  });
  const endpoint = routeConfig.endpoint;
  const apiKey = routeConfig.apiKey;
  const model = routeConfig.modelName;
  const providerCode = routeConfig.providerCode;
  const conversationId = input.conversation_id?.trim() || `qa_${randomUUID()}`;
  const projectId = input.context?.project_id?.trim() || null;
  const usageContext = await resolveDecorationQaUsageContext({
    authUserId: options?.authUserId,
    tenantId: options?.tenantId,
    customerId: options?.customerId,
    employeeId: options?.employeeId,
    roles: options?.roles,
    role: input.context?.role,
    projectId,
  });
  const extraSystemMessages = options?.extraSystemMessages ||
    await resolveDecorationQaStreamSystemMessages(input, options?.authUserId);
  const startedAt = Date.now();

  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let totalTokens: number | undefined;
  let cachedInputTokens: number | undefined;
  let reasoningTokens: number | undefined;
  let requestId: string | null = null;
  let streamRequest: Awaited<ReturnType<typeof requestQaStream>> | null = null;
  let reader: {
    read: () => Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock: () => void;
  } | null = null;

  try {
    streamRequest = await requestQaStream(
      endpoint,
      apiKey,
      await createStreamRequestBody(
        input,
        model,
        routeConfig.temperature,
        extraSystemMessages,
      ),
      routeConfig.timeoutMs,
      options?.signal,
    );
    reader = streamRequest.body.getReader();

    await onEvent({
      type: "start",
      conversation_id: conversationId,
    });

    while (true) {
      if (!reader) {
        throw Errors.dbError("大模型流读取器未初始化");
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const data = parseSseEvent(rawLine);
        if (!data) {
          continue;
        }

        if (data === "[DONE]") {
          continue;
        }

        let chunk: OpenAiChatStreamChunk;
        try {
          chunk = JSON.parse(data) as OpenAiChatStreamChunk;
        } catch {
          continue;
        }

        if (chunk.error?.message) {
          throw Errors.dbError(chunk.error.message);
        }

        requestId = chunk.id || requestId;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          totalTokens = chunk.usage.total_tokens;
          cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens;
          reasoningTokens = chunk.usage.completion_tokens_details
            ?.reasoning_tokens;
        }

        const delta = extractDeltaContent(chunk.choices);
        if (delta) {
          await onEvent({
            type: "delta",
            content: delta,
          });
        }
      }
    }

    const trailingData = parseSseEvent(buffer);
    if (trailingData && trailingData !== "[DONE]") {
      try {
        const chunk = JSON.parse(trailingData) as OpenAiChatStreamChunk;
        requestId = chunk.id || requestId;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
          totalTokens = chunk.usage.total_tokens;
          cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens;
          reasoningTokens = chunk.usage.completion_tokens_details
            ?.reasoning_tokens;
        }

        const delta = extractDeltaContent(chunk.choices);
        if (delta) {
          await onEvent({
            type: "delta",
            content: delta,
          });
        }
      } catch {
        // Ignore trailing partial chunks.
      }
    }

    await onEvent({
      type: "done",
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    });
    await aiGateway.logCall({
      tenantId: usageContext.tenantId,
      sceneCode: "decoration_qa",
      providerCode,
      modelCode: routeConfig.modelCode,
      modelName: model,
      status: "success",
      requestId,
      durationMs: Date.now() - startedAt,
      promptTokens: inputTokens ?? null,
      completionTokens: outputTokens ?? null,
      totalTokens: normalizeTotalTokens({
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens,
      }),
      cachedInputTokens: cachedInputTokens ?? null,
      reasoningTokens: reasoningTokens ?? null,
      rawUsage: {
        prompt_tokens: inputTokens ?? null,
        completion_tokens: outputTokens ?? null,
        total_tokens: totalTokens ?? null,
        prompt_tokens_details: {
          cached_tokens: cachedInputTokens ?? null,
        },
        completion_tokens_details: {
          reasoning_tokens: reasoningTokens ?? null,
        },
      },
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
        conversation_id: conversationId,
        stream: true,
      },
    });
  } catch (error) {
    await aiGateway.logCall({
      tenantId: usageContext.tenantId,
      sceneCode: "decoration_qa",
      providerCode,
      modelCode: routeConfig.modelCode,
      modelName: model,
      status: "failure",
      requestId,
      durationMs: Date.now() - startedAt,
      promptTokens: inputTokens ?? null,
      completionTokens: outputTokens ?? null,
      totalTokens: normalizeTotalTokens({
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens,
      }),
      cachedInputTokens: cachedInputTokens ?? null,
      reasoningTokens: reasoningTokens ?? null,
      rawUsage: {
        prompt_tokens: inputTokens ?? null,
        completion_tokens: outputTokens ?? null,
        total_tokens: totalTokens ?? null,
        prompt_tokens_details: {
          cached_tokens: cachedInputTokens ?? null,
        },
        completion_tokens_details: {
          reasoning_tokens: reasoningTokens ?? null,
        },
      },
      errorCode: error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "AI_STREAM_FAILED")
        : "AI_STREAM_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
      source: usageContext.source,
      billable: usageContext.billable,
      metadata: {
        source: usageContext.source,
        auth_user_id: usageContext.authUserId ?? null,
        customer_id: usageContext.customerId ?? null,
        employee_id: usageContext.employeeId ?? null,
        project_id: usageContext.projectId ?? null,
        conversation_id: conversationId,
        stream: true,
      },
    });
    throw error;
  } finally {
    streamRequest?.clearTimeout();
    reader?.releaseLock();
  }
}

export function serializeDecorationQaStreamEvent(
  event: DecorationQaStreamEvent,
) {
  return toNdjson(event);
}

export async function getDecorationQaSystemPrompt() {
  return getSystemPrompt();
}
