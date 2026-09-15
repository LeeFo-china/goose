import { exchangeDouyinSession } from "./api/auth";
import { fetchBootstrap } from "./api/bootstrap";
import { ApiClient, DouyinRequestTransport } from "./api/request";
import { API_TIMEOUT_MS, resolveApiBaseUrl } from "./config";
import type { BootstrapData, LaunchContext } from "./models";
import {
  AnalyticsQueue,
  type ClientAnalyticsEventName,
} from "./platform/analytics";
import { EntryAttribution } from "./platform/analysis-info";
import { readBudgetLeadContext } from "./platform/budget-lead-context";
import { readDouyinEnvironment } from "./platform/env-info";
import { readDeploymentConfig } from "./platform/ext-config";
import { captureLaunchContext } from "./platform/launch-context";
import { loginOnce } from "./platform/login";
import { navigateToServiceUnavailable } from "./platform/navigation";
import { recoveryIdentityFromToken, type RenderingRecoveryIdentity } from "./platform/rendering-recovery";
import {
  clearStoredSession,
  clearStoredCustomerSession,
  readStoredSession,
  readStoredCustomerSession,
  writeStoredSession,
  writeStoredCustomerSession,
} from "./platform/storage";
import { BootstrapStore, toServiceUnavailableCode } from "./state/bootstrap";
import { CustomerSessionManager } from "./state/customer-session";
import { SessionManager } from "./state/session";
import { createUuidV4IdempotencyKey } from "./utils/idempotency";

const environment = readDouyinEnvironment();
const deployment = readDeploymentConfig();
const transport = new DouyinRequestTransport(
  resolveApiBaseUrl(environment.envType, deployment.deployment_environment),
  API_TIMEOUT_MS,
);
const session = new SessionManager({
  now: () => Date.now(),
  readEnvironment: () => environment,
  readDeploymentConfig: () => deployment,
  loginOnce,
  exchangeSession: (input) => exchangeDouyinSession(transport, input),
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
});
const api = new ApiClient(transport, session);
const customerSession = new CustomerSessionManager({
  now: () => Date.now(),
  readStoredCustomerSession,
  writeStoredCustomerSession,
  clearStoredCustomerSession,
});
const customerApi = new ApiClient(transport, customerSession);
const analytics = new AnalyticsQueue(api);
const entryAttribution = new EntryAttribution();
const bootstrap = new BootstrapStore(
  () => fetchBootstrap(api),
  navigateToServiceUnavailable,
);

export type DouyinAppContext = {
  api: ApiClient;
  session: SessionManager;
  customerApi: ApiClient;
  customerSession: CustomerSessionManager;
  analytics: AnalyticsQueue;
  bootstrap: BootstrapStore;
  launchContext: LaunchContext;
  attributionEntryVersion: number;
  getLeadAttribution(): LaunchContext | Promise<LaunchContext>;
  recordAnalytics(eventName: ClientAnalyticsEventName, entityId?: string): void;
  startup: Promise<BootstrapData | null>;
  getRenderingRecoveryIdentity(): Promise<RenderingRecoveryIdentity | null>;
};

const DEFAULT_LAUNCH_CONTEXT: LaunchContext = {
  entry_path: "pages/home/index",
  scene: "0",
  source_type: "direct",
};

App({
  api,
  session,
  customerApi,
  customerSession,
  analytics,
  bootstrap,
  launchContext: DEFAULT_LAUNCH_CONTEXT,
  attributionEntryVersion: 0,
  hasShown: false,
  startup: Promise.resolve(null) as Promise<BootstrapData | null>,
  onLaunch(options) {
    readBudgetLeadContext();
    this.launchContext = captureLaunchContext(options);
    entryAttribution.start(this.launchContext);
    this.attributionEntryVersion = entryAttribution.version;
    this.analytics.record({
      event_id: createUuidV4IdempotencyKey(),
      event_name: "app_launch",
      attribution: this.launchContext,
    });
    this.startup = startApplication(this.launchContext);
  },
  onShow(options) {
    if (!this.hasShown) { this.hasShown = true; return; }
    const next = captureLaunchContext(options);
    if (options.showFrom !== 10 && sameEntry(this.launchContext, next)) return;
    this.launchContext = next;
    entryAttribution.start(next);
    this.attributionEntryVersion = entryAttribution.version;
  },
  onHide() { void this.analytics.handleAppHide(); },
  async getRenderingRecoveryIdentity() {
    if (!await this.startup) return null;
    try { return recoveryIdentityFromToken(await session.getAccessToken()); }
    catch { return null; }
  },
  getLeadAttribution() { return entryAttribution.ready(); },
  recordAnalytics(eventName: ClientAnalyticsEventName, entityId?: string) {
    this.analytics.record({
      event_id: createUuidV4IdempotencyKey(),
      event_name: eventName,
      attribution: entryAttribution.current,
      ...(entityId ? { entity_id: entityId } : {}),
    });
  },
});

function sameEntry(left: LaunchContext, right: LaunchContext): boolean {
  return left.entry_path === right.entry_path && left.scene === right.scene
    && left.source_type === right.source_type
    && left.campaign_code === right.campaign_code
    && left.content_id === right.content_id;
}

async function startApplication(launchContext: LaunchContext): Promise<BootstrapData | null> {
  try {
    await session.initialize(launchContext);
    return await bootstrap.load();
  } catch (error) {
    await navigateToServiceUnavailable(toServiceUnavailableCode(error));
    return null;
  }
}
