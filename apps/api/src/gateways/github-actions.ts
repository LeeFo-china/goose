import { unzipSync } from "fflate";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

const MAX_ARTIFACT_ARCHIVE_BYTES = 5 * 1024 * 1024;
const MAX_ARTIFACT_JSON_BYTES = 1024 * 1024;

type GithubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  archive_download_url: string;
};

type DownloadArtifactJsonInput = {
  runId: string;
  artifactName: string;
  fileName: string;
};

export function getGithubConfig() {
  const token = process.env.GITHUB_RELEASE_TOKEN || process.env.GITHUB_TOKEN || "";
  const repository = process.env.GITHUB_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || "LeeFo-china/goose";

  if (!token) {
    throw Errors.business(
      500,
      "缺少 GitHub 发布令牌 GITHUB_RELEASE_TOKEN",
      ErrorCodes.RELEASE_CONFIG_MISSING,
    );
  }

  return {
    token,
    repository,
    apiBase: `https://api.github.com/repos/${repository}`,
    webBase: `https://github.com/${repository}`,
  };
}

export function normalizeGithubError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function githubHeaders(config: ReturnType<typeof getGithubConfig>, init?: RequestInit) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(init?.headers || {}),
  };
}

export async function githubRequest<T>(path: string, init: RequestInit = {}) {
  const config = getGithubConfig();
  const response = await fetch(`${config.apiBase}${path}`, {
    ...init,
    headers: githubHeaders(config, init),
  });

  if (response.status === 204) return null as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Errors.business(
      response.status,
      normalizeGithubError(payload, "GitHub Actions 请求失败"),
      ErrorCodes.RELEASE_DISPATCH_FAILED,
      payload,
    );
  }

  return payload as T;
}

async function githubBinaryRequest(path: string) {
  const config = getGithubConfig();
  const response = await fetch(`${config.apiBase}${path}`, {
    headers: githubHeaders(config),
    redirect: "follow",
  });

  if (!response.ok) {
    throw Errors.business(
      response.status,
      "发布证据下载失败",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  return response.arrayBuffer();
}

async function downloadArtifactJson<T>({
  runId,
  artifactName,
  fileName,
}: DownloadArtifactJsonInput): Promise<T> {
  const payload = await githubRequest<{ artifacts?: GithubArtifact[] }>(
    `/actions/runs/${encodeURIComponent(runId)}/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`,
  );
  const matches = (payload.artifacts || [])
    .filter((item) => item.name === artifactName && !item.expired);

  if (matches.length !== 1) {
    throw Errors.business(
      409,
      "发布证据缺失、重复或已过期",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  const artifact = matches[0];
  if (!artifact || artifact.size_in_bytes > MAX_ARTIFACT_ARCHIVE_BYTES) {
    throw Errors.business(
      413,
      "发布证据归档过大",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  const archive = await githubBinaryRequest(`/actions/artifacts/${artifact.id}/zip`);
  if (archive.byteLength > MAX_ARTIFACT_ARCHIVE_BYTES) {
    throw Errors.business(
      413,
      "发布证据归档过大",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  let targetEntries = 0;
  let isTargetOversized = false;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(archive), {
      filter: (entry) => {
        if (entry.name !== fileName) return false;
        targetEntries += 1;
        if (entry.originalSize > MAX_ARTIFACT_JSON_BYTES) {
          isTargetOversized = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw Errors.business(
      409,
      "发布证据归档无效",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  const content = entries[fileName];
  if (targetEntries !== 1 || isTargetOversized || !content || content.byteLength > MAX_ARTIFACT_JSON_BYTES) {
    throw Errors.business(
      409,
      "发布证据文件缺失或过大",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }

  try {
    return JSON.parse(new TextDecoder().decode(content)) as T;
  } catch {
    throw Errors.business(
      409,
      "发布证据 JSON 无效",
      ErrorCodes.RELEASE_CANDIDATE_INVALID,
    );
  }
}

export const githubActionsGateway = {
  request: githubRequest,
  downloadArtifactJson,
  getConfig: getGithubConfig,
};
