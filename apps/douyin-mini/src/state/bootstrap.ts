import { ApiRequestError } from "../api/request";
import type { BootstrapData, ServiceUnavailableCode } from "../models";

const BLOCKING_CODES = new Set<ServiceUnavailableCode>([
  "DOUYIN_INSTALLATION_MISSING",
  "DOUYIN_INSTALLATION_DISABLED",
  "DOUYIN_AUTHORIZATION_EXPIRED",
  "DOUYIN_SESSION_EXCHANGE_FAILED",
  "TENANT_NOT_AVAILABLE",
]);

export class BootstrapStore {
  status: "idle" | "loading" | "ready" | "unavailable" | "error" = "idle";
  data: BootstrapData | null = null;

  constructor(
    private readonly fetchBootstrap: () => Promise<BootstrapData>,
    private readonly navigateUnavailable: (code: ServiceUnavailableCode) => Promise<void>,
  ) {}

  async load(): Promise<BootstrapData | null> {
    this.status = "loading";
    try {
      this.data = await this.fetchBootstrap();
      this.status = "ready";
      return this.data;
    } catch (error) {
      if (error instanceof ApiRequestError && isBlockingCode(error.code)) {
        this.status = "unavailable";
        await this.navigateUnavailable(error.code);
        return null;
      }
      this.status = "error";
      throw error;
    }
  }
}

function isBlockingCode(value: string): value is ServiceUnavailableCode {
  return BLOCKING_CODES.has(value as ServiceUnavailableCode);
}

export function toServiceUnavailableCode(error: unknown): ServiceUnavailableCode {
  return error instanceof ApiRequestError && isBlockingCode(error.code)
    ? error.code
    : "NETWORK_ERROR";
}
