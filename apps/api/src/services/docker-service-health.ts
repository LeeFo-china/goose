import { existsSync } from "node:fs";
import net from "node:net";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";

type DockerContainerPort = {
  IP?: string;
  PrivatePort?: number;
  PublicPort?: number;
  Type?: string;
};

type DockerContainerSummary = {
  Id: string;
  Names?: string[];
  Image?: string;
  ImageID?: string;
  State?: string;
  Status?: string;
  Created?: number;
  Ports?: DockerContainerPort[];
  Labels?: Record<string, string>;
};

type DockerInspectState = {
  Status?: string;
  Running?: boolean;
  StartedAt?: string;
  FinishedAt?: string;
  Restarting?: boolean;
  OOMKilled?: boolean;
  Dead?: boolean;
  ExitCode?: number;
  Error?: string;
  Health?: {
    Status?: string;
    FailingStreak?: number;
    Log?: Array<{
      Start?: string;
      End?: string;
      ExitCode?: number;
      Output?: string;
    }>;
  };
};

type DockerInspectResult = {
  Id?: string;
  Name?: string;
  Config?: {
    Image?: string;
    Labels?: Record<string, string>;
  };
  State?: DockerInspectState;
};

export type ServiceHealthContainer = {
  id: string;
  name: string;
  image: string;
  group: "business" | "supabase" | "infrastructure";
  state: string;
  health: "healthy" | "unhealthy" | "starting" | "none" | "exited" | "unknown";
  status_text: string;
  started_at: string | null;
  ports: string[];
  restart_count: number | null;
  failing_streak: number | null;
  last_health_output: string | null;
};

export type ServiceHealthSnapshot = {
  checked_at: string;
  docker_socket_path: string;
  summary: {
    total: number;
    running: number;
    healthy: number;
    unhealthy: number;
    starting: number;
    without_healthcheck: number;
    exited: number;
  };
  containers: ServiceHealthContainer[];
};

const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock";
const DOCKER_REQUEST_TIMEOUT_MS = Number(process.env.DOCKER_HEALTH_REQUEST_TIMEOUT_MS || 5000);

function normalizeContainerName(value: string | undefined) {
  return (value || "").replace(/^\/+/, "");
}

function classifyContainer(name: string): ServiceHealthContainer["group"] {
  if (name.startsWith("gooes-")) return "business";
  if (name.startsWith("supabase-") || name.startsWith("realtime-dev.supabase-realtime")) return "supabase";
  return "infrastructure";
}

function isRelevantContainer(name: string) {
  return (
    name.startsWith("gooes-") ||
    name.startsWith("supabase-") ||
    name.startsWith("realtime-dev.supabase-realtime")
  );
}

function formatPort(port: DockerContainerPort) {
  const privatePort = port.PrivatePort ? `${port.PrivatePort}` : "";
  const publicPort = port.PublicPort ? `${port.PublicPort}` : "";
  if (!privatePort && !publicPort) return "";
  if (!publicPort) return `${privatePort}/${port.Type || "tcp"}`;
  const host = port.IP && port.IP !== "0.0.0.0" ? `${port.IP}:` : "";
  return `${host}${publicPort}->${privatePort}/${port.Type || "tcp"}`;
}

function decodeChunkedBody(value: Buffer) {
  let cursor = 0;
  const chunks: Buffer[] = [];

  while (cursor < value.length) {
    const lineEnd = value.indexOf("\r\n", cursor, "utf8");
    if (lineEnd === -1) break;

    const sizeText = value.toString("utf8", cursor, lineEnd).split(";", 1)[0]?.trim() || "0";
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size <= 0) break;

    const chunkStart = lineEnd + 2;
    chunks.push(value.subarray(chunkStart, chunkStart + size));
    cursor = chunkStart + size + 2;
  }

  return Buffer.concat(chunks);
}

function parseDockerResponse(raw: Buffer) {
  const headerEnd = raw.indexOf("\r\n\r\n", 0, "utf8");
  if (headerEnd < 0) {
    return { statusCode: 0, body: "", headers: "" };
  }

  const headers = raw.toString("utf8", 0, headerEnd);
  let body = raw.subarray(headerEnd + 4);
  const statusCode = Number(headers.match(/^HTTP\/\d\.\d\s+(\d+)/)?.[1] || 0);

  if (/transfer-encoding:\s*chunked/i.test(headers)) {
    body = decodeChunkedBody(body);
  }

  return { statusCode, body: body.toString("utf8"), headers };
}

function requestDocker(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(DOCKER_SOCKET_PATH);
    const chunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("Docker Engine 请求超时"));
    }, DOCKER_REQUEST_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        "Host: docker",
        "Accept: application/json",
        "Connection: close",
        "",
        "",
      ].join("\r\n"));
    });

    socket.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    socket.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    socket.on("end", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const response = parseDockerResponse(Buffer.concat(chunks));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(new Error(`Docker Engine 返回 ${response.statusCode}`));
        return;
      }

      try {
        resolve(response.body ? JSON.parse(response.body) : null);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function getHealthStatus(summary: DockerContainerSummary, inspect: DockerInspectResult): ServiceHealthContainer["health"] {
  const state = inspect.State?.Status || summary.State || "unknown";
  const health = inspect.State?.Health?.Status;

  if (health === "healthy" || health === "unhealthy" || health === "starting") {
    return health;
  }

  if (state !== "running") {
    return "exited";
  }

  return "none";
}

function toContainerHealth(
  summary: DockerContainerSummary,
  inspect: DockerInspectResult,
): ServiceHealthContainer {
  const name = normalizeContainerName(inspect.Name || summary.Names?.[0]);
  const healthLog = inspect.State?.Health?.Log || [];
  const latestHealthLog = healthLog[healthLog.length - 1];
  const healthOutput = latestHealthLog?.Output?.trim() || null;

  return {
    id: (summary.Id || inspect.Id || "").slice(0, 12),
    name,
    image: inspect.Config?.Image || summary.Image || "-",
    group: classifyContainer(name),
    state: inspect.State?.Status || summary.State || "unknown",
    health: getHealthStatus(summary, inspect),
    status_text: summary.Status || inspect.State?.Status || "-",
    started_at: inspect.State?.StartedAt || null,
    ports: (summary.Ports || []).map(formatPort).filter(Boolean),
    restart_count: null,
    failing_streak: inspect.State?.Health?.FailingStreak ?? null,
    last_health_output: healthOutput ? healthOutput.slice(0, 300) : null,
  };
}

function buildSummary(containers: ServiceHealthContainer[]): ServiceHealthSnapshot["summary"] {
  return {
    total: containers.length,
    running: containers.filter((item) => item.state === "running").length,
    healthy: containers.filter((item) => item.health === "healthy").length,
    unhealthy: containers.filter((item) => item.health === "unhealthy").length,
    starting: containers.filter((item) => item.health === "starting").length,
    without_healthcheck: containers.filter((item) => item.health === "none").length,
    exited: containers.filter((item) => item.state !== "running").length,
  };
}

class DockerServiceHealthService {
  async getSnapshot(): Promise<ServiceHealthSnapshot> {
    if (!existsSync(DOCKER_SOCKET_PATH)) {
      throw Errors.business(
        500,
        "Docker Socket 未挂载，无法采集微服务健康状态",
        ErrorCodes.OPS_SCRIPT_RUN_FAILED,
        { socket_path: DOCKER_SOCKET_PATH },
      );
    }

    try {
      const summaries = await requestDocker("/containers/json?all=1") as DockerContainerSummary[];
      const relevantSummaries = summaries
        .filter((item) => item.Names?.some((name) => isRelevantContainer(normalizeContainerName(name))))
        .sort((left, right) => normalizeContainerName(left.Names?.[0]).localeCompare(normalizeContainerName(right.Names?.[0])));

      const containers = await Promise.all(
        relevantSummaries.map(async (summary) => {
          const inspect = await requestDocker(`/containers/${summary.Id}/json`) as DockerInspectResult;
          return toContainerHealth(summary, inspect);
        }),
      );

      return {
        checked_at: new Date().toISOString(),
        docker_socket_path: DOCKER_SOCKET_PATH,
        summary: buildSummary(containers),
        containers,
      };
    } catch (error) {
      throw Errors.business(
        500,
        "微服务健康状态采集失败",
        ErrorCodes.OPS_SCRIPT_RUN_FAILED,
        error instanceof Error ? { message: error.message } : undefined,
      );
    }
  }
}

export const dockerServiceHealthService = new DockerServiceHealthService();
