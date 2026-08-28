import { exchangeDouyinSession } from "./api/auth";
import { fetchBootstrap } from "./api/bootstrap";
import { ApiClient, DouyinRequestTransport } from "./api/request";
import { API_TIMEOUT_MS, resolveApiBaseUrl } from "./config";
import type { BootstrapData, LaunchContext } from "./models";
import {
  AnalyticsQueue,
  type ClientAnalyticsEventName,
} from "./platform/analytics";
import { readBudgetLeadContext } from "./platform/budget-lead-context";
import { readDouyinEnvironment } from "./platform/env-info";
import { readDeploymentConfig } from "./platform/ext-config";
import { captureLaunchContext } from "./platform/launch-context";
import { loginOnce } from "./platform/login";
import { navigateToServiceUnavailable } from "./platform/navigation";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./platform/storage";
import { BootstrapStore, toServiceUnavailableCode } from "./state/bootstrap";
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
const analytics = new AnalyticsQueue(api);
const bootstrap = new BootstrapStore(
  () => fetchBootstrap(api),
  navigateToServiceUnavailable,
);

export type DouyinAppContext = {
  api: ApiClient;
  analytics: AnalyticsQueue;
  bootstrap: BootstrapStore;
  launchContext: LaunchContext;
  recordAnalytics(eventName: ClientAnalyticsEventName, entityId?: string): void;
  startup: Promise<BootstrapData | null>;
};

const DEFAULT_LAUNCH_CONTEXT: LaunchContext = {
  entry_path: "pages/home/index",
  scene: "0",
  source_type: "direct",
};

App({
  api,
  analytics,
  bootstrap,
  launchContext: DEFAULT_LAUNCH_CONTEXT,
  startup: Promise.resolve(null) as Promise<BootstrapData | null>,
  onLaunch(options) {
    readBudgetLeadContext();
    this.launchContext = captureLaunchContext(options);
    this.analytics.record({
      event_id: createUuidV4IdempotencyKey(),
      event_name: "app_launch",
      attribution: this.launchContext,
    });
    this.startup = startApplication(this.launchContext);
  },
  onHide() { void this.analytics.handleAppHide(); },
  recordAnalytics(eventName: ClientAnalyticsEventName, entityId?: string) {
    this.analytics.record({
      event_id: createUuidV4IdempotencyKey(),
      event_name: eventName,
      attribution: this.launchContext,
      ...(entityId ? { entity_id: entityId } : {}),
    });
  },
});

async function startApplication(launchContext: LaunchContext): Promise<BootstrapData | null> {
  try {
    await session.initialize(launchContext);
    return await bootstrap.load();
  } catch (error) {
    await navigateToServiceUnavailable(toServiceUnavailableCode(error));
    return null;
  }
}
