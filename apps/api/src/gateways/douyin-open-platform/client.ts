import { z } from "zod";
import { AppError } from "@/errors/app-error";
import {
  buildAuthorizationLinkRequest,
  GENERATE_AUTHORIZATION_LINK_URL,
  parseAuthorizationLinkResponse,
  type GenerateAuthorizationLinkInput,
  type GenerateAuthorizationLinkResult,
} from "./authorization-link";
import { assertAuthorizationCodeUsable } from "./authorization-token";
import {
  accessTokenRefreshError,
  assertOpenApiSuccess,
  assertRetrieveAuthorizationSuccess,
  invalidResponseError,
  openPlatformError,
  safeLogId,
} from "./client-errors";
import {
  DouyinMiniappReleaseClient,
  type AuthorizerRequestInput,
  type AvailableAuditHostsResult,
  type DouyinMiniappReleaseGateway,
  type DouyinQrCodeVersion,
  type DouyinVersionListResult,
  type QrCodeInput,
  type ReleaseOperationResult,
  type SubmitVersionAuditInput,
  type TestQrCodeResult,
  type UploadTemplateVersionInput,
  type UploadTemplateVersionResult,
} from "./release-client";
import {
  GET_PHONE_NUMBER_INFO_URL,
  parseGetPhoneNumberInfoResult,
  type GetPhoneNumberInfoInput,
  type GetPhoneNumberInfoResult,
} from "./phone-number";
export type { GenerateAuthorizationLinkInput, GenerateAuthorizationLinkResult } from "./authorization-link";
export type {
  AuthorizerRequestInput,
  AvailableAuditHostsResult,
  DouyinMiniappReleaseGateway,
  DouyinQrCodeVersion,
  DouyinTemplateExtJson,
  DouyinVersionListResult,
  QrCodeInput,
  ReleaseOperationResult,
  SafeDouyinVersionStage,
  SubmitVersionAuditInput,
  TestQrCodeResult,
  UploadTemplateVersionInput,
  UploadTemplateVersionResult,
} from "./release-client";
const REQUEST_TIMEOUT_MS = 10_000;
const COMPONENT_TOKEN_URL = "https://open.douyin.com/openapi/v2/auth/tp/token/";
const AUTHORIZER_TOKEN_URL = "https://open.douyin.com/api/tpapp/v2/auth/get_auth_token/";
const RETRIEVE_AUTH_CODE_URL = "https://open.douyin.com/api/tpapp/v2/auth/retrieve_auth_code/";
const MERCHANT_CODE2SESSION_URL = "https://open.douyin.com/api/apps/v1/microapp/code2session/";
const TEMPLATE_CODE2SESSION_URL = "https://developer.toutiao.com/api/apps/v2/jscode2session";
const JsonObjectSchema = z.looseObject({});
const ComponentSuccessSchema = z.looseObject({
  component_access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
const ComponentFailureSchema = z.looseObject({
  errno: z.union([z.string(), z.number()]),
});
const AuthorizerSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: z.string().min(1),
  data: z.looseObject({
    authorizer_access_token: z.string().min(1),
    authorizer_appid: z.string().min(1),
    authorizer_refresh_token: z.string().min(1),
    expires_in: z.number().int().positive(),
    refresh_expires_in: z.number().int().positive(),
    authorize_permission: z.array(z.unknown()),
  }),
});
const RetrieveAuthorizationCodeSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: z.string().min(1),
  data: z.looseObject({ authorization_code: z.string().min(1) }),
});
const OptionalSessionIdentitySchema = z.union([
  z.string().min(1),
  z.literal("").transform(() => undefined),
]).optional();
const MerchantSessionIdentitySchema = z.looseObject({
  session_key: z.string().min(1),
  open_id: OptionalSessionIdentitySchema,
  anonymous_open_id: OptionalSessionIdentitySchema,
  union_id: OptionalSessionIdentitySchema,
}).superRefine((value, context) => {
  if (!value.open_id && !value.anonymous_open_id) {
    context.addIssue({ code: "custom", message: "missing Douyin session identity" });
  }
});
const MerchantCode2SessionSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: z.string().min(1),
  data: MerchantSessionIdentitySchema,
});
const TemplateSessionIdentitySchema = z.looseObject({
  session_key: z.string().min(1),
  openid: OptionalSessionIdentitySchema,
  anonymous_openid: OptionalSessionIdentitySchema,
  unionid: OptionalSessionIdentitySchema,
}).superRefine((value, context) => {
  if (!value.openid && !value.anonymous_openid) {
    context.addIssue({ code: "custom", message: "missing Douyin session identity" });
  }
});
const TemplateCode2SessionSuccessSchema = z.looseObject({
  err_no: z.literal(0),
  log_id: z.string().min(1),
  data: TemplateSessionIdentitySchema,
});

export type ComponentTokenInput = {
  readonly componentAppId: string;
  readonly componentAppSecret: string;
  readonly componentTicket: string;
};

export type ComponentTokenResult = {
  readonly accessToken: string;
  readonly expiresIn: number;
};

export type AuthorizationCodeInput = {
  readonly componentAccessToken: string;
  readonly authorizationCode: string;
};

export type RefreshAuthorizerTokenInput = {
  readonly componentAccessToken: string;
  readonly authorizerRefreshToken: string;
};

export type RetrieveAuthorizationCodeInput = {
  readonly componentAccessToken: string;
  readonly authorizationAppId: string;
};

export type AuthorizerTokenResult = {
  readonly accessToken: string;
  readonly authorizerAppId: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly refreshExpiresIn: number;
  readonly permissions: readonly unknown[];
};

type Code2SessionCredential = { readonly code: string; readonly anonymousCode?: never }
  | { readonly code?: never; readonly anonymousCode: string };

export type Code2SessionInput = Code2SessionCredential & {
  readonly authorizerAccessToken: string;
  readonly appId: string;
};

export type TemplateCode2SessionInput = Code2SessionCredential & {
  readonly appId: string;
  readonly appSecret: string;
};

export type Code2SessionResult = {
  readonly sessionKey: string;
  readonly openId?: string;
  readonly anonymousOpenId?: string;
  readonly unionId?: string;
};

function serializeCode2SessionCredential(input: Code2SessionCredential) {
  return input.code ? { code: input.code } : { anonymous_code: input.anonymousCode };
}

export interface DouyinOpenPlatformGateway {
  getComponentAccessToken(input: ComponentTokenInput): Promise<ComponentTokenResult>;
  exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<AuthorizerTokenResult>;
  refreshAuthorizerToken(input: RefreshAuthorizerTokenInput): Promise<AuthorizerTokenResult>;
  retrieveAuthorizationCode(input: RetrieveAuthorizationCodeInput): Promise<string>;
  generateAuthorizationLink(
    input: GenerateAuthorizationLinkInput,
  ): Promise<GenerateAuthorizationLinkResult>;
  code2Session(input: Code2SessionInput): Promise<Code2SessionResult>;
  code2SessionForTemplate(input: TemplateCode2SessionInput): Promise<Code2SessionResult>;
  getPhoneNumberInfo(input: GetPhoneNumberInfoInput): Promise<GetPhoneNumberInfoResult>;
}

type TimeoutHandle = unknown;
export type DouyinFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
type ClientOptions = {
  readonly fetch?: DouyinFetch;
  readonly setTimeout?: (handler: () => void, milliseconds: number) => TimeoutHandle;
  readonly clearTimeout?: (handle: TimeoutHandle) => void;
  readonly retryAccessToken?: (input: { readonly appId: string }) => Promise<string>;
};

export class DouyinOpenPlatformClient
  implements DouyinOpenPlatformGateway, DouyinMiniappReleaseGateway {
  private readonly fetch: DouyinFetch;
  private readonly startTimer: NonNullable<ClientOptions["setTimeout"]>;
  private readonly stopTimer: NonNullable<ClientOptions["clearTimeout"]>;
  private readonly retryAccessToken?: ClientOptions["retryAccessToken"];
  private readonly releases: DouyinMiniappReleaseClient;

  constructor(options: ClientOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.startTimer = options.setTimeout ?? ((handler, milliseconds) =>
      globalThis.setTimeout(handler, milliseconds));
    this.stopTimer = options.clearTimeout ?? ((handle) =>
      globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>));
    this.retryAccessToken = options.retryAccessToken;
    this.releases = new DouyinMiniappReleaseClient({
      request: (url, init) => this.request(url, init),
      executeWithAuthorizerToken: (input, operation) =>
        this.withAuthorizerAccessToken(input, operation),
      assertSuccess: assertOpenApiSuccess,
      invalidResponse: (body) => {
        throw invalidResponseError(safeLogId(body));
      },
    });
  }

  async getComponentAccessToken(input: ComponentTokenInput): Promise<ComponentTokenResult> {
    const query = new URLSearchParams({
      component_appid: input.componentAppId,
      component_appsecret: input.componentAppSecret,
      component_ticket: input.componentTicket,
    });
    const body = await this.request(`${COMPONENT_TOKEN_URL}?${query}`, { method: "GET" });
    const failure = ComponentFailureSchema.safeParse(body);
    if (failure.success && String(failure.data.errno) !== "0") {
      throw openPlatformError("DOUYIN_OPEN_PLATFORM_API_ERROR", "抖音开放平台请求失败");
    }
    const success = ComponentSuccessSchema.safeParse(body);
    if (!success.success) throw invalidResponseError(safeLogId(body));
    return {
      accessToken: success.data.component_access_token,
      expiresIn: success.data.expires_in,
    };
  }

  async exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<AuthorizerTokenResult> {
    return this.requestAuthorizerToken(input.componentAccessToken, {
      grant_type: "app_to_tp_authorization_code",
      authorization_code: input.authorizationCode,
    });
  }

  async refreshAuthorizerToken(input: RefreshAuthorizerTokenInput): Promise<AuthorizerTokenResult> {
    return this.requestAuthorizerToken(input.componentAccessToken, {
      grant_type: "app_to_tp_refresh_token",
      authorizer_refresh_token: input.authorizerRefreshToken,
    });
  }

  async retrieveAuthorizationCode(input: RetrieveAuthorizationCodeInput): Promise<string> {
    const body = await this.request(RETRIEVE_AUTH_CODE_URL, {
      method: "POST",
      headers: {
        "access-token": input.componentAccessToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ authorization_appid: input.authorizationAppId }),
    });
    assertRetrieveAuthorizationSuccess(body);
    const parsed = RetrieveAuthorizationCodeSuccessSchema.safeParse(body);
    if (!parsed.success) throw invalidResponseError(safeLogId(body));
    return parsed.data.data.authorization_code;
  }

  async generateAuthorizationLink(
    input: GenerateAuthorizationLinkInput,
  ): Promise<GenerateAuthorizationLinkResult> {
    const body = await this.request(
      GENERATE_AUTHORIZATION_LINK_URL,
      buildAuthorizationLinkRequest(input),
    );
    assertOpenApiSuccess(body);
    return parseAuthorizationLinkResponse(
      body,
      () => {
        throw invalidResponseError(safeLogId(body));
      },
    );
  }

  async code2Session(input: Code2SessionInput): Promise<Code2SessionResult> {
    return this.withAuthorizerAccessToken(input, (accessToken) =>
      this.requestMerchantCode2Session(input, accessToken));
  }

  async code2SessionForTemplate(input: TemplateCode2SessionInput): Promise<Code2SessionResult> {
    const body = await this.request(TEMPLATE_CODE2SESSION_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appid: input.appId, secret: input.appSecret, ...serializeCode2SessionCredential(input) }),
    });
    assertOpenApiSuccess(body);
    const parsed = TemplateCode2SessionSuccessSchema.safeParse(body);
    if (!parsed.success) throw invalidResponseError(safeLogId(body));
    return {
      sessionKey: parsed.data.data.session_key,
      openId: parsed.data.data.openid,
      anonymousOpenId: parsed.data.data.anonymous_openid,
      unionId: parsed.data.data.unionid,
    };
  }

  async getPhoneNumberInfo(input: GetPhoneNumberInfoInput): Promise<GetPhoneNumberInfoResult> {
    return this.withAuthorizerAccessToken(input, async (accessToken) => {
      const body = await this.request(GET_PHONE_NUMBER_INFO_URL, {
        method: "POST",
        headers: { "access-token": accessToken, "content-type": "application/json" },
        body: JSON.stringify({ code: input.code }),
      });
      assertOpenApiSuccess(body);
      return parseGetPhoneNumberInfoResult(body, {
        appId: input.appId,
        privateKeyPem: input.privateKeyPem,
      });
    });
  }

  async uploadTemplateVersion(input: UploadTemplateVersionInput): Promise<UploadTemplateVersionResult> {
    return this.releases.uploadTemplateVersion(input);
  }

  async getTestQrCode(input: QrCodeInput): Promise<TestQrCodeResult> {
    return this.releases.getTestQrCode(input);
  }

  async getAvailableAuditHosts(input: AuthorizerRequestInput): Promise<AvailableAuditHostsResult> {
    return this.releases.getAvailableAuditHosts(input);
  }

  async submitVersionAudit(input: SubmitVersionAuditInput): Promise<ReleaseOperationResult> {
    return this.releases.submitVersionAudit(input);
  }

  async getVersionList(input: AuthorizerRequestInput): Promise<DouyinVersionListResult> {
    return this.releases.getVersionList(input);
  }

  async releaseVersion(input: AuthorizerRequestInput): Promise<ReleaseOperationResult> {
    return this.releases.releaseVersion(input);
  }

  private async requestAuthorizerToken(
    accessToken: string,
    queryInput: Record<string, string>,
  ): Promise<AuthorizerTokenResult> {
    const query = new URLSearchParams(queryInput);
    const body = await this.request(`${AUTHORIZER_TOKEN_URL}?${query}`, {
      method: "GET",
      headers: { "access-token": accessToken },
    });
    assertAuthorizationCodeUsable(body, queryInput.grant_type ?? "");
    assertOpenApiSuccess(body);
    const parsed = AuthorizerSuccessSchema.safeParse(body);
    if (!parsed.success) throw invalidResponseError(safeLogId(body));
    return {
      accessToken: parsed.data.data.authorizer_access_token,
      authorizerAppId: parsed.data.data.authorizer_appid,
      refreshToken: parsed.data.data.authorizer_refresh_token,
      expiresIn: parsed.data.data.expires_in,
      refreshExpiresIn: parsed.data.data.refresh_expires_in,
      permissions: parsed.data.data.authorize_permission,
    };
  }

  private async requestMerchantCode2Session(
    input: Code2SessionInput,
    accessToken: string,
  ): Promise<Code2SessionResult> {
    const body = await this.request(MERCHANT_CODE2SESSION_URL, {
      method: "POST",
      headers: { "access-token": accessToken, "content-type": "application/json" },
      body: JSON.stringify({ ...serializeCode2SessionCredential(input), app_id: input.appId }),
    });
    assertOpenApiSuccess(body);
    const parsed = MerchantCode2SessionSuccessSchema.safeParse(body);
    if (!parsed.success) throw invalidResponseError(safeLogId(body));
    return {
      sessionKey: parsed.data.data.session_key,
      openId: parsed.data.data.open_id,
      anonymousOpenId: parsed.data.data.anonymous_open_id,
      unionId: parsed.data.data.union_id,
    };
  }

  private async withAuthorizerAccessToken<Result>(
    input: AuthorizerRequestInput,
    operation: (accessToken: string) => Promise<Result>,
  ): Promise<Result> {
    try {
      return await operation(input.authorizerAccessToken);
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        error.code !== "DOUYIN_OPEN_PLATFORM_ACCESS_TOKEN_EXPIRED" ||
        !this.retryAccessToken
      ) {
        throw error;
      }
      let accessToken: string;
      try {
        accessToken = await this.retryAccessToken({ appId: input.appId });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw accessTokenRefreshError();
      }
      if (!accessToken.trim()) throw accessTokenRefreshError();
      return operation(accessToken);
    }
  }

  private async request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = this.startTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw openPlatformError(
          "DOUYIN_OPEN_PLATFORM_HTTP_ERROR",
          "抖音开放平台 HTTP 请求失败",
          await bestEffortHttpLogId(response),
        );
      }
      return await parseJsonObject(response);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw openPlatformError("DOUYIN_OPEN_PLATFORM_TIMEOUT", "抖音开放平台请求超时");
      }
      if (error instanceof AppError) throw error;
      throw openPlatformError("DOUYIN_OPEN_PLATFORM_NETWORK_ERROR", "抖音开放平台网络请求失败");
    } finally {
      this.stopTimer(timer);
    }
  }
}

async function bestEffortHttpLogId(response: Response): Promise<string | undefined> {
  try {
    return safeLogId(await response.json());
  } catch (error) {
    if (isAbortError(error)) throw error;
    return undefined;
  }
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw invalidResponseError();
  }
  const parsed = JsonObjectSchema.safeParse(body);
  if (!parsed.success || Array.isArray(body)) throw invalidResponseError();
  return parsed.data;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
