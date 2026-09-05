export type AiGatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

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
  modelCode: string;
  modelName: string;
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
  temperature: number;
  responseFormat: "json_object" | "text" | null;
};
