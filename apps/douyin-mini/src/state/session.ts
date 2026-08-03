import type {
  DeploymentConfig,
  DouyinEnvironment,
  LaunchContext,
  SessionExchangeInput,
  SessionExchangeResult,
  StoredSession,
} from "../models";
import { ApiRequestError, type SessionTokenProvider } from "../api/request";

const EXPIRY_SAFETY_WINDOW_MS = 30_000;

export type SessionDependencies = {
  now(): number;
  readEnvironment(): DouyinEnvironment;
  readDeploymentConfig(): DeploymentConfig;
  loginOnce(): Promise<{ code: string }>;
  exchangeSession(input: SessionExchangeInput): Promise<SessionExchangeResult>;
  readStoredSession(): StoredSession | null;
  writeStoredSession(session: StoredSession): void;
  clearStoredSession(): void;
};

export class SessionManager implements SessionTokenProvider {
  private launchContext: LaunchContext | null = null;
  private currentSession: StoredSession | null = null;
  private hydrated = false;
  private refreshFlight: Promise<StoredSession> | null = null;

  constructor(private readonly dependencies: SessionDependencies) {}

  initialize(launchContext: LaunchContext): Promise<string> {
    this.launchContext = launchContext;
    return this.getAccessToken();
  }

  async getAccessToken(): Promise<string> {
    const stored = this.getCurrentSession();
    if (stored && this.isUsable(stored)) return stored.accessToken;
    return (await this.refresh()).accessToken;
  }

  async refreshAfterUnauthorized(rejectedToken: string): Promise<string> {
    if (this.refreshFlight) return (await this.refreshFlight).accessToken;
    const current = this.getCurrentSession();
    if (current && current.accessToken !== rejectedToken && this.isUsable(current)) {
      return current.accessToken;
    }
    this.currentSession = null;
    this.dependencies.clearStoredSession();
    return (await this.refresh()).accessToken;
  }

  private getCurrentSession(): StoredSession | null {
    if (!this.hydrated) {
      this.currentSession = this.dependencies.readStoredSession();
      this.hydrated = true;
    }
    return this.currentSession;
  }

  private isUsable(session: StoredSession): boolean {
    return session.expiresAt > this.dependencies.now() + EXPIRY_SAFETY_WINDOW_MS;
  }

  private async refresh(): Promise<StoredSession> {
    if (this.refreshFlight) return this.refreshFlight;
    const flight = this.exchangeFreshSession();
    this.refreshFlight = flight;
    try {
      return await flight;
    } finally {
      if (this.refreshFlight === flight) this.refreshFlight = null;
    }
  }

  private async exchangeFreshSession(): Promise<StoredSession> {
    if (!this.launchContext) {
      throw new ApiRequestError(
        0,
        "DOUYIN_SESSION_EXCHANGE_FAILED",
        "缺少抖音小程序启动上下文",
      );
    }
    const environment = this.dependencies.readEnvironment();
    const deployment = this.dependencies.readDeploymentConfig();
    const login = await this.dependencies.loginOnce();
    const input: SessionExchangeInput = {
      app_id: environment.appId,
      code: login.code,
      launch_context: this.launchContext,
      ...(deployment.deployment_key
        ? { deployment_key: deployment.deployment_key }
        : {}),
    };
    const exchanged = await this.dependencies.exchangeSession(input);
    const session = {
      accessToken: exchanged.accessToken,
      expiresAt: this.dependencies.now() + exchanged.expiresIn * 1_000,
    };
    this.currentSession = session;
    this.dependencies.writeStoredSession(session);
    return session;
  }
}
