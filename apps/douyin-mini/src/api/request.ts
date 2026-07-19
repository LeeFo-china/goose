export type ApiRequestInput = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: Record<string, unknown>;
};

export type TransportInput = ApiRequestInput & { token?: string };

export interface RequestTransport {
  send(input: TransportInput): Promise<unknown>;
}

export interface SessionTokenProvider {
  getAccessToken(): Promise<string>;
  refreshAfterUnauthorized(rejectedToken: string): Promise<string>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiClient {
  constructor(
    private readonly transport: RequestTransport,
    private readonly session: SessionTokenProvider,
  ) {}

  async request<T>(input: ApiRequestInput): Promise<T> {
    const token = await this.session.getAccessToken();
    try {
      return await this.send<T>(input, token);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.statusCode !== 401) throw error;
      const refreshedToken = await this.session.refreshAfterUnauthorized(token);
      return this.send<T>(input, refreshedToken);
    }
  }

  private async send<T>(input: ApiRequestInput, token: string): Promise<T> {
    return await this.transport.send({ ...input, token }) as T;
  }
}

type JsonRecord = Record<string, unknown>;

export class DouyinRequestTransport implements RequestTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {
    if (!baseUrl.startsWith("https://")) {
      throw new ApiRequestError(0, "INVALID_API_CONFIG", "API 地址必须使用 HTTPS");
    }
  }

  send(input: TransportInput): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let task: { abort(): void } | undefined;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        callback();
      };
      const timer = globalThis.setTimeout(() => {
        task?.abort();
        finish(() => reject(new ApiRequestError(0, "NETWORK_ERROR", "网络请求超时")));
      }, this.timeoutMs);

      task = tt.request({
        url: `${this.baseUrl}${normalizePath(input.path)}`,
        method: input.method,
        data: input.data,
        dataType: "json",
        header: {
          "content-type": "application/json",
          ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        },
        success: (response) => finish(() => {
          const body = toRecord(response.data);
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(toRequestError(response.statusCode, body));
            return;
          }
          if (!body || !("data" in body)) {
            reject(new ApiRequestError(502, "INVALID_API_RESPONSE", "服务返回数据无效"));
            return;
          }
          resolve(body.data);
        }),
        fail: () => finish(() => reject(
          new ApiRequestError(0, "NETWORK_ERROR", "网络请求失败"),
        )),
      });
    });
  }
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function toRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function toRequestError(statusCode: number, body: JsonRecord | null): ApiRequestError {
  const code = typeof body?.code === "string" ? body.code : "REQUEST_FAILED";
  const message = typeof body?.message === "string" && body.message.trim()
    ? body.message
    : "请求失败，请稍后重试";
  return new ApiRequestError(statusCode, code, message);
}
