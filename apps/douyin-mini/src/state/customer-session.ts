import type { StoredSession } from "../models";
import { ApiRequestError, type SessionTokenProvider } from "../api/request";

const EXPIRY_SAFETY_WINDOW_MS = 30_000;

export type CustomerSessionDependencies = {
  now(): number;
  readStoredCustomerSession(): StoredSession | null;
  writeStoredCustomerSession(session: StoredSession): void;
  clearStoredCustomerSession(): void;
};

export class CustomerSessionManager implements SessionTokenProvider {
  private currentSession: StoredSession | null = null;
  private hydrated = false;

  constructor(private readonly dependencies: CustomerSessionDependencies) {}

  async getAccessToken(): Promise<string> {
    const session = this.getCurrentSession();
    if (session && this.isUsable(session)) return session.accessToken;
    this.clear();
    throw customerAuthRequired();
  }

  async refreshAfterUnauthorized(_rejectedToken: string): Promise<string> {
    this.clear();
    throw customerAuthRequired();
  }

  acceptAuth(input: {
    token: string;
    expiresIn?: number;
    mode: "customer" | "platform_visitor";
    phoneMasked?: string;
  }): void {
    const session = {
      accessToken: input.token,
      expiresAt: this.dependencies.now() + (input.expiresIn ?? 7 * 24 * 60 * 60) * 1_000,
      mode: input.mode,
      ...(input.phoneMasked ? { phoneMasked: input.phoneMasked } : {}),
    };
    this.currentSession = session;
    this.hydrated = true;
    this.dependencies.writeStoredCustomerSession(session);
  }

  clear(): void {
    this.currentSession = null;
    this.hydrated = true;
    this.dependencies.clearStoredCustomerSession();
  }

  isAuthenticated(): boolean {
    return this.getAuthState() !== null;
  }

  hasCustomerProfile(): boolean {
    return this.getAuthState()?.mode === "customer";
  }

  getAuthState(): {
    mode: "customer" | "platform_visitor";
    phoneMasked: string;
  } | null {
    const session = this.getCurrentSession();
    if (!session || !this.isUsable(session)) return null;
    return {
      mode: session.mode ?? "customer",
      phoneMasked: session.phoneMasked ?? "",
    };
  }

  private getCurrentSession(): StoredSession | null {
    if (!this.hydrated) {
      this.currentSession = this.dependencies.readStoredCustomerSession();
      this.hydrated = true;
    }
    return this.currentSession;
  }

  private isUsable(session: StoredSession): boolean {
    return session.expiresAt > this.dependencies.now() + EXPIRY_SAFETY_WINDOW_MS;
  }
}

function customerAuthRequired(): ApiRequestError {
  return new ApiRequestError(401, "CUSTOMER_AUTH_REQUIRED", "请先登录后查看我的项目");
}
