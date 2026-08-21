import {
  DOUYIN_ENTRY_PATH_VALUES,
  DOUYIN_SOURCE_TYPES,
  type DouyinEntryPath,
  type DouyinSourceType,
  type LaunchContext,
} from "../models";

export function captureLaunchContext(options: {
  path: string;
  scene: string;
  query: object;
}): LaunchContext {
  const query = isRecord(options.query) ? options.query : {};
  const campaignCode = attributionCode(query.campaign_code);
  const contentId = attributionCode(query.content_id);
  return {
    entry_path: normalizeEntryPath(options.path),
    scene: /^[0-9]{1,20}$/.test(options.scene) ? options.scene : "0",
    source_type: isSourceType(query.source_type) ? query.source_type : "direct",
    ...(campaignCode ? { campaign_code: campaignCode } : {}),
    ...(contentId ? { content_id: contentId } : {}),
  };
}

function normalizeEntryPath(value: string): DouyinEntryPath {
  const normalized = value.replace(/^\/+/, "");
  return DOUYIN_ENTRY_PATH_VALUES.includes(normalized as DouyinEntryPath)
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
