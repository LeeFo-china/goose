import { exchangeDouyinSession } from "./api/auth";
import { fetchBootstrap } from "./api/bootstrap";
import { ApiClient, DouyinRequestTransport } from "./api/request";
import { API_BASE_URL, API_TIMEOUT_MS } from "./config";
import type { LaunchContext } from "./models";
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

const transport = new DouyinRequestTransport(API_BASE_URL, API_TIMEOUT_MS);
const session = new SessionManager({
  now: () => Date.now(),
  readEnvironment: readDouyinEnvironment,
  readDeploymentConfig,
  loginOnce,
  exchangeSession: (input) => exchangeDouyinSession(transport, input),
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
});
const api = new ApiClient(transport, session);
const bootstrap = new BootstrapStore(
  () => fetchBootstrap(api),
  navigateToServiceUnavailable,
);

App({
  onLaunch(options) {
    void startApplication(captureLaunchContext(options));
  },
});

async function startApplication(launchContext: LaunchContext): Promise<void> {
  try {
    await session.initialize(launchContext);
    await bootstrap.load();
  } catch (error) {
    await navigateToServiceUnavailable(toServiceUnavailableCode(error));
  }
}
