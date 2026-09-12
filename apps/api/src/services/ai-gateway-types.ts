export type AiGatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiGatewayProviderType = "openai_compatible" | "openrouter";

export type AiGatewayChatInput = {
  sceneCode: string;
  tenantId?: string | null;
  messages: AiGatewayMessage[];
  temperature?: number;
  responseFormat?: "json_object" | "text" | null;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
  source?: string | null;
  billable?: boolean;
};

export type AiGatewayChatResult = {
  content: string;
  raw: unknown;
  provider: string;
  model: string;
  modelName: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type AiGatewayResolvedChatConfig = {
  providerCode: string;
  providerType: AiGatewayProviderType;
  modelCode: string;
  modelName: string;
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
  temperature: number;
  responseFormat: "json_object" | "text" | null;
};

export type AiGatewayResolvedImageConfig = {
  providerCode: string;
  providerType: "openai_compatible";
  modelCode: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

export type AiGatewayFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type AiProviderRow = {
  code: string;
  provider_type: AiGatewayProviderType;
  endpoint_url: string | null;
  api_key_setting_key: string | null;
  status?: "active" | "inactive" | null;
};

export type AiModelRow = {
  code: string;
  model_name: string;
  modality: "text" | "image" | "video" | "speech";
  status?: "active" | "inactive" | null;
  provider?: AiProviderRow | AiProviderRow[] | null;
};

export type AiSceneRouteRow = {
  scene_code: string;
  modality: AiModelRow["modality"];
  temperature: number | null;
  response_format: "json_object" | "text" | null;
  timeout_ms: number | null;
  primary_model?: AiModelRow | AiModelRow[] | null;
  fallback_model?: AiModelRow | AiModelRow[] | null;
};

export type OpenAiCompatibleResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { code?: string; message?: string };
};
