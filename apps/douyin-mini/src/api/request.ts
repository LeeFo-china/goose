export type ApiRequestInput = {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: Record<string, unknown>;
  timeoutMs?: number;
};

export type TransportInput = ApiRequestInput & { token?: string };

export interface RequestTransport {
  send(input: TransportInput): Promise<unknown>;
}

export interface SessionTokenProvider {
  getAccessToken(): Promise<string>;
  refreshAfterUnauthorized(rejectedToken: string): Promise<string>;
}

export interface ApiOperationClock {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

const systemOperationClock: ApiOperationClock = {
  now: () => Date.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

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

export function isApiRequestErrorCode(error: unknown, code: string): error is ApiRequestError {
  return error instanceof ApiRequestError && error.code === code;
}

export class ApiClient {
  constructor(
    private readonly transport: RequestTransport,
    private readonly session: SessionTokenProvider,
    private readonly clock: ApiOperationClock = systemOperationClock,
  ) {}

  async request<T>(input: ApiRequestInput): Promise<T> {
    if (input.timeoutMs === undefined) return this.requestWithoutDeadline<T>(input);
    if (!isValidTimeout(input.timeoutMs)) throw invalidTimeoutError();
    const deadlineAt = this.clock.now() + input.timeoutMs;
    const token = await this.withDeadline(
      () => this.session.getAccessToken(),
      deadlineAt,
    );
    try {
      return await this.sendWithDeadline<T>(input, token, deadlineAt);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.statusCode !== 401) throw error;
      const refreshedToken = await this.withDeadline(
        () => this.session.refreshAfterUnauthorized(token),
        deadlineAt,
      );
      return this.sendWithDeadline<T>(input, refreshedToken, deadlineAt);
    }
  }

  private async requestWithoutDeadline<T>(input: ApiRequestInput): Promise<T> {
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

  private sendWithDeadline<T>(
    input: ApiRequestInput,
    token: string,
    deadlineAt: number,
  ): Promise<T> {
    const timeoutMs = this.remainingOrThrow(deadlineAt);
    return this.withDeadline(
      async () => await this.transport.send({ ...input, token, timeoutMs }) as T,
      deadlineAt,
    );
  }

  private withDeadline<T>(operation: () => Promise<T>, deadlineAt: number): Promise<T> {
    this.remainingOrThrow(deadlineAt);
    let promise: Promise<T>;
    try {
      promise = operation();
    } catch (error) {
      return Promise.reject(error);
    }
    const remainingMs = deadlineAt - this.clock.now();
    if (remainingMs <= 0) {
      void promise.catch(() => undefined);
      return Promise.reject(operationTimeoutError());
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let cancelTimer = () => {};
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cancelTimer();
        callback();
      };
      cancelTimer = this.clock.schedule(
        () => finish(() => reject(operationTimeoutError())),
        remainingMs,
      );
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  }

  private remainingOrThrow(deadlineAt: number): number {
    const remainingMs = deadlineAt - this.clock.now();
    if (remainingMs <= 0) throw operationTimeoutError();
    return remainingMs;
  }
}

type JsonRecord = Record<string, unknown>;

export class DouyinRequestTransport implements RequestTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
    private readonly request: typeof tt.request = tt.request,
  ) {
    if (!baseUrl.startsWith("https://")) {
      throw new ApiRequestError(0, "INVALID_API_CONFIG", "API 地址必须使用 HTTPS");
    }
  }

  send(input: TransportInput): Promise<unknown> {
    const timeoutMs = input.timeoutMs ?? this.timeoutMs;
    if (!isValidTimeout(timeoutMs)) {
      return Promise.reject(invalidTimeoutError());
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let task: { abort(): void } | undefined;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => {
        task?.abort();
        finish(() => reject(new ApiRequestError(0, "NETWORK_ERROR", "网络请求超时")));
      }, timeoutMs);

      task = this.request({
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

function isValidTimeout(timeoutMs: number): boolean {
  return Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60_000;
}

function invalidTimeoutError(): ApiRequestError {
  return new ApiRequestError(0, "INVALID_API_CONFIG", "请求超时配置无效");
}

function operationTimeoutError(): ApiRequestError {
  return new ApiRequestError(0, "NETWORK_ERROR", "网络请求超时");
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
