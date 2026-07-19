import { exchangeDouyinSession } from "./api/auth";
import { fetchBootstrap } from "./api/bootstrap";
import { ApiClient, DouyinRequestTransport } from "./api/request";
import { API_BASE_URL, API_TIMEOUT_MS } from "./config";
import {
  DOUYIN_ENTRY_PATHS,
  DOUYIN_SOURCE_TYPES,
  type DouyinEntryPath,
  type DouyinSourceType,
  type LaunchContext,
} from "./models";
import { readDouyinEnvironment } from "./platform/env-info";
import { readDeploymentConfig } from "./platform/ext-config";
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

export function captureLaunchContext(options: {
  path: string;
  scene: string;
  query: object;
}): LaunchContext {
  const query = isRecord(options.query) ? options.query : {};
  const entryPath = normalizeEntryPath(options.path);
  const sourceType = isSourceType(query.source_type) ? query.source_type : "direct";
  const campaignCode = attributionCode(query.campaign_code);
  const contentId = attributionCode(query.content_id);
  return {
    entry_path: entryPath,
    scene: /^[0-9]{1,20}$/.test(options.scene) ? options.scene : "0",
    source_type: sourceType,
    ...(campaignCode ? { campaign_code: campaignCode } : {}),
    ...(contentId ? { content_id: contentId } : {}),
  };
}

function normalizeEntryPath(value: string): DouyinEntryPath {
  const normalized = value.replace(/^\/+/, "");
  return DOUYIN_ENTRY_PATHS.includes(normalized as DouyinEntryPath)
    ? normalized as DouyinEntryPath
    : "pages/home/index";
}

function isSourceType(value: unknown): value is DouyinSourceType {
  return typeof value === "string"
    && DOUYIN_SOURCE_TYPES.includes(value as DouyinSourceType);
}

function attributionCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
