import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SafeDouyinLogIdSchema } from "./release-client";

const TEMPLATE_APP_LIST_URL =
  "https://open.douyin.com/api/tpapp/v2/template/get_tpl_app_list/";
const TEMPLATE_LIST_URL =
  "https://open.douyin.com/api/tpapp/v2/template/get_tpl_list/";
const ADD_TEMPLATE_URL =
  "https://open.douyin.com/api/tpapp/v2/template/add_tpl/";
const REQUEST_TIMEOUT_MS = 10_000;
const ResponseEnvelopeSchema = z.looseObject({
  err_no: z.number().int(),
  log_id: SafeDouyinLogIdSchema.optional(),
});
const Int64IdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

const TemplateAppSchema = z.looseObject({
  tpl_app_id: z.string().trim().min(1).max(128),
  app_name: z.string().trim().min(1).max(120).optional(),
  nick_name: z.string().trim().min(1).max(120).optional(),
  user_version: z.string().trim().min(1).max(64).optional(),
  user_desc: z.string().trim().min(1).max(200).optional(),
  create_time: z.number().int().nonnegative().safe().optional(),
  draft_id: Int64IdSchema.optional(),
});
const TemplateAppsSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
  data: z.looseObject({ tpl_app_list: z.array(TemplateAppSchema).max(200) }),
});
const TemplateSchema = z.looseObject({
  template_id: Int64IdSchema,
  user_version: z.string().trim().min(1).max(64),
  user_desc: z.string().trim().min(1).max(200),
  create_time: z.number().int().nonnegative().safe(),
});
const TemplatesSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
  data: z.looseObject({ template_list: z.array(TemplateSchema).max(200) }),
});
const AddTemplateSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: SafeDouyinLogIdSchema,
});

export type ComponentTemplateRequest = {
  readonly componentAccessToken: string;
};
export type AddTemplateInput = ComponentTemplateRequest & {
  readonly draftId: string;
};
export type DouyinTemplateApp = {
  readonly templateAppId: string;
  readonly appName?: string;
  readonly nickName?: string;
  readonly version?: string;
  readonly description?: string;
  readonly createdAt?: number;
  readonly draftId?: string;
};
export type DouyinCodeTemplate = {
  readonly templateId: string;
  readonly version: string;
  readonly description: string;
  readonly createdAt: number;
};
export type TemplateAppListResult = {
  readonly items: readonly DouyinTemplateApp[];
  readonly logId: string;
};
export type TemplateListResult = {
  readonly items: readonly DouyinCodeTemplate[];
  readonly logId: string;
};
export type AddTemplateResult = { readonly logId: string };

export interface DouyinTemplateManagementGateway {
  listTemplateApps(input: ComponentTemplateRequest): Promise<TemplateAppListResult>;
  listTemplates(input: ComponentTemplateRequest): Promise<TemplateListResult>;
  addTemplate(input: AddTemplateInput): Promise<AddTemplateResult>;
}

export type TemplateManagementTransport = {
  readonly request: (
    url: string,
    init: RequestInit,
  ) => Promise<Record<string, unknown>>;
  readonly assertSuccess: (body: Record<string, unknown>) => void;
  readonly invalidResponse: (body: Record<string, unknown>) => never;
};

type TimeoutHandle = unknown;
type TemplateFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
type ClientOptions = {
  readonly fetch?: TemplateFetch;
  readonly setTimeout?: (handler: () => void, milliseconds: number) => TimeoutHandle;
  readonly clearTimeout?: (handle: TimeoutHandle) => void;
};

export function createDouyinTemplateManagementClient(
  options: ClientOptions = {},
): DouyinTemplateManagementClient {
  const fetch = options.fetch ?? globalThis.fetch;
  const startTimer = options.setTimeout ?? ((handler, milliseconds) =>
    globalThis.setTimeout(handler, milliseconds));
  const stopTimer = options.clearTimeout ?? ((handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>));
  const invalidResponse = (body?: Record<string, unknown>): never => {
    const envelope = ResponseEnvelopeSchema.safeParse(body);
    throw Errors.business(
      502,
      "抖音开放平台响应格式无效",
      "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
      envelope.success && envelope.data.log_id
        ? { log_id: envelope.data.log_id }
        : undefined,
    );
  };
  return new DouyinTemplateManagementClient({
    request: async (url, init) => {
      const controller = new AbortController();
      const timer = startTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const body = await parseResponseObject(response, invalidResponse);
        if (!response.ok) {
          throw providerError(
            "抖音开放平台 HTTP 请求失败",
            "DOUYIN_OPEN_PLATFORM_HTTP_ERROR",
            body,
          );
        }
        return body;
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          throw Errors.business(
            502,
            "抖音开放平台请求超时",
            "DOUYIN_OPEN_PLATFORM_TIMEOUT",
          );
        }
        if (error instanceof AppError) throw error;
        throw Errors.business(
          502,
          "抖音开放平台网络请求失败",
          "DOUYIN_OPEN_PLATFORM_NETWORK_ERROR",
        );
      } finally {
        stopTimer(timer);
      }
    },
    assertSuccess: (body) => {
      const envelope = ResponseEnvelopeSchema.safeParse(body);
      if (!envelope.success) return invalidResponse(body);
      if (envelope.data.err_no !== 0) {
        throw providerError(
          "抖音开放平台请求失败",
          "DOUYIN_OPEN_PLATFORM_API_ERROR",
          body,
        );
      }
    },
    invalidResponse,
  });
}

export class DouyinTemplateManagementClient
  implements DouyinTemplateManagementGateway {
  constructor(private readonly transport: TemplateManagementTransport) {}

  async listTemplateApps(
    input: ComponentTemplateRequest,
  ): Promise<TemplateAppListResult> {
    const body = await this.get(TEMPLATE_APP_LIST_URL, input.componentAccessToken);
    const parsed = TemplateAppsSuccessSchema.safeParse(body);
    if (!parsed.success) this.transport.invalidResponse(body);
    return {
      items: parsed.data.data.tpl_app_list.map((item) => ({
        templateAppId: item.tpl_app_id,
        ...(item.app_name ? { appName: item.app_name } : {}),
        ...(item.nick_name ? { nickName: item.nick_name } : {}),
        ...(item.user_version ? { version: item.user_version } : {}),
        ...(item.user_desc ? { description: item.user_desc } : {}),
        ...(item.create_time !== undefined ? { createdAt: item.create_time } : {}),
        ...(item.draft_id !== undefined ? { draftId: item.draft_id } : {}),
      })),
      logId: parsed.data.log_id,
    };
  }

  async listTemplates(input: ComponentTemplateRequest): Promise<TemplateListResult> {
    const body = await this.get(TEMPLATE_LIST_URL, input.componentAccessToken);
    const parsed = TemplatesSuccessSchema.safeParse(body);
    if (!parsed.success) this.transport.invalidResponse(body);
    return {
      items: parsed.data.data.template_list.map((item) => ({
        templateId: item.template_id,
        version: item.user_version,
        description: item.user_desc,
        createdAt: item.create_time,
      })),
      logId: parsed.data.log_id,
    };
  }

  async addTemplate(input: AddTemplateInput): Promise<AddTemplateResult> {
    if (!Int64IdSchema.safeParse(input.draftId).success) {
      throw Errors.business(
        400,
        "抖音模板草稿编号无效",
        "DOUYIN_TEMPLATE_DRAFT_ID_INVALID",
      );
    }
    const body = await this.transport.request(ADD_TEMPLATE_URL, {
      method: "POST",
      headers: {
        "access-token": input.componentAccessToken,
        "content-type": "application/json",
      },
      body: `{"draft_id":${input.draftId}}`,
    });
    this.transport.assertSuccess(body);
    const parsed = AddTemplateSuccessSchema.safeParse(body);
    if (!parsed.success) this.transport.invalidResponse(body);
    return { logId: parsed.data.log_id };
  }

  private async get(url: string, componentAccessToken: string) {
    const body = await this.transport.request(url, {
      method: "GET",
      headers: { "access-token": componentAccessToken },
    });
    this.transport.assertSuccess(body);
    return body;
  }
}

async function parseResponseObject(
  response: Response,
  invalidResponse: (body?: Record<string, unknown>) => never,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    const text = await response.text();
    body = JSON.parse(text, preserveInt64Identifiers);
  } catch {
    return invalidResponse();
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalidResponse();
  }
  return body as Record<string, unknown>;
}

function preserveInt64Identifiers(
  key: string,
  value: unknown,
  context?: { readonly source?: string },
): unknown {
  if (
    (key === "draft_id" || key === "template_id")
    && typeof context?.source === "string"
    && /^[1-9][0-9]{0,18}$/.test(context.source)
  ) {
    return context.source;
  }
  return value;
}

function providerError(
  message: string,
  code: string,
  body: Record<string, unknown>,
) {
  const envelope = ResponseEnvelopeSchema.safeParse(body);
  return Errors.business(
    502,
    message,
    code,
    envelope.success && envelope.data.log_id
      ? { log_id: envelope.data.log_id }
      : undefined,
  );
}
