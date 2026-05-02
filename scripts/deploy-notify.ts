import { execFile } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type EnvMap = Record<string, string>;
type SmtpResponse = {
  code: number;
  response: string;
};
type RemoteSystemSetting = {
  key?: string;
  value_text?: string | null;
  status?: string;
};

type ServiceStatus = {
  name: string;
  status: string;
  pid: string;
};

type HealthSummary = {
  gooseHttpStatus: string;
  adminHttpStatus: string;
  services: ServiceStatus[];
  ports: string;
  deployTrace: string;
};

const WORKSPACE = process.env.GITHUB_WORKSPACE || process.cwd();
const ENV_CANDIDATES = [
  resolve(WORKSPACE, ".env"),
  resolve(WORKSPACE, "apps/api/.env"),
  "/home/ubuntu/actions-runner/.env",
  "/home/runner/actions-runner/.env",
].filter(Boolean);

const REMOTE_NOTIFY_SETTING_KEYS = [
  "DEPLOY_NOTIFY_TO",
  "DEPLOY_NOTIFY_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_FAMILY",
  "SMTP_USER",
  "SMTP_PASS",
];
const ENCRYPTED_VALUE_PREFIX = "enc:v1:";

function parseEnvFile(path: string) {
  const parsed: EnvMap = {};
  if (!existsSync(path)) return parsed;

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadEnv() {
  const loaded: EnvMap = {};
  for (const candidate of ENV_CANDIDATES) {
    Object.assign(loaded, parseEnvFile(candidate));
  }
  return {
    ...loaded,
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string"
      ),
    ),
  };
}

function getEncryptionKey(env: EnvMap) {
  const raw = env.APP_CONFIG_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

function decryptRemoteValue(env: EnvMap, value: string) {
  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) {
    return value;
  }

  const key = getEncryptionKey(env);
  if (!key) {
    console.log("Deploy mail remote secret skipped: missing APP_CONFIG_ENCRYPTION_KEY");
    return "";
  }

  const [, , ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) {
    console.log("Deploy mail remote secret skipped: invalid encrypted value");
    return "";
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Deploy mail remote secret skipped: ${message}`);
    return "";
  }
}

async function loadRemoteSystemSettings(env: EnvMap) {
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return {};
  }

  const keyFilter = REMOTE_NOTIFY_SETTING_KEYS.join(",");
  const url = `${supabaseUrl}/rest/v1/system_settings?select=key,value_text,status&status=eq.active&key=in.(${keyFilter})`;

  try {
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!response.ok) {
      console.log(`Deploy mail remote settings skipped: status ${response.status}`);
      return {};
    }

    const rows = await response.json() as RemoteSystemSetting[];
    return rows.reduce<EnvMap>((result, row) => {
      if (
        row.key &&
        REMOTE_NOTIFY_SETTING_KEYS.includes(row.key) &&
        row.status === "active" &&
        row.value_text?.trim()
      ) {
        const value = decryptRemoteValue(env, row.value_text.trim());
        if (value) result[row.key] = value;
      }
      return result;
    }, {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Deploy mail remote settings skipped: ${message}`);
    return {};
  }
}

function mask(value: string) {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function stripAnsi(value: string) {
  return value.replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function truncate(value: string, maxLength: number) {
  const clean = stripAnsi(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}\n... truncated ${clean.length - maxLength} chars`;
}

function formatShanghaiTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const item = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${item("year")}-${item("month")}-${item("day")} ${item("hour")}:${item("minute")}:${item("second")} Asia/Shanghai`;
}

async function runCommand(command: string, args: string[], options: { cwd?: string } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd || WORKSPACE,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    return stripAnsi([stdout, stderr].filter(Boolean).join("\n").trim());
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return stripAnsi([
      err.stdout,
      err.stderr,
      err.message ? `command failed: ${err.message}` : "",
    ].filter(Boolean).join("\n").trim());
  }
}

async function getHttpStatus(url: string) {
  return runCommand("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", url])
    .then((value) => value.trim() || "000")
    .catch(() => "000");
}

async function getServiceStatuses(pm2Bin: string) {
  const output = await runCommand(pm2Bin, ["jlist"]);
  try {
    const list = JSON.parse(output) as Array<{
      name?: string;
      pid?: number;
      pm2_env?: {
        status?: string;
      };
    }>;
    return ["goose", "goose-admin"].map((name) => {
      const app = list.find((item) => item.name === name);
      return {
        name,
        status: app?.pm2_env?.status || "missing",
        pid: app?.pid ? String(app.pid) : "-",
      };
    });
  } catch {
    return [
      { name: "goose", status: "unknown", pid: "-" },
      { name: "goose-admin", status: "unknown", pid: "-" },
    ];
  }
}

async function collectHealthSummary(pm2Bin: string): Promise<HealthSummary> {
  const [gooseHttpStatus, adminHttpStatus, services, ports, deployTrace] = await Promise.all([
    getHttpStatus("http://127.0.0.1:3000/"),
    getHttpStatus("http://127.0.0.1:3010/dashboard"),
    getServiceStatuses(pm2Bin),
    runCommand("bash", ["-lc", "ss -lntp | grep -E ':(3000|3010)\\b' || true"]),
    runCommand("bash", ["-lc", "tail -80 /tmp/goose-deploy-trace.log 2>/dev/null || true"]),
  ]);

  return {
    gooseHttpStatus,
    adminHttpStatus,
    services,
    ports: ports || "No service port details",
    deployTrace: deployTrace || "No deploy trace found",
  };
}

function formatServiceLine(service: ServiceStatus, health: string) {
  return `- ${service.name}: ${service.status}, pid=${service.pid}, health=${health}`;
}

async function collectReport(env: EnvMap) {
  const status = env.DEPLOY_JOB_STATUS || env.JOB_STATUS || "unknown";
  const pm2Bin = env.PM2_BIN || "pm2";
  const health = await collectHealthSummary(pm2Bin);
  const gooseService = health.services.find((service) => service.name === "goose")
    || { name: "goose", status: "unknown", pid: "-" };
  const adminService = health.services.find((service) => service.name === "goose-admin")
    || { name: "goose-admin", status: "unknown", pid: "-" };

  const failureLogs = status === "success"
    ? ""
    : [
      "=== Service Ports ===",
      health.ports,
      "",
      "=== Recent Deploy Trace ===",
      health.deployTrace,
      "",
      "=== Goose Recent Logs ===",
      await runCommand(pm2Bin, ["logs", "goose", "--lines", "80", "--nostream", "--no-color"]),
      "",
      "=== Goose Admin Recent Logs ===",
      await runCommand(pm2Bin, ["logs", "goose-admin", "--lines", "80", "--nostream", "--no-color"]),
    ].join("\n");

  const subjectStatus = status === "success" ? "成功" : "失败";
  const subject = `Goose 部署${subjectStatus}: ${env.GITHUB_REF_NAME || "unknown"} @ ${(env.GITHUB_SHA || "").slice(0, 7) || "unknown"}`;
  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : "";

  const body = [
    `Goose 部署${subjectStatus}`,
    "",
    `环境：production`,
    `部署状态：${subjectStatus}`,
    `分支：${env.GITHUB_REF_NAME || env.GITHUB_REF || "unknown"}`,
    `Commit：${(env.GITHUB_SHA || "unknown").slice(0, 12)}`,
    `时间：${formatShanghaiTime()}`,
    `服务器：${hostname()}`,
    `工作目录：${WORKSPACE}`,
    "",
    "服务状态：",
    formatServiceLine(gooseService, health.gooseHttpStatus),
    formatServiceLine(adminService, health.adminHttpStatus),
    "",
    "GitHub Actions：",
    runUrl || `Run ID：${env.GITHUB_RUN_ID || "unknown"}`,
    failureLogs ? "" : "",
    failureLogs ? truncate(failureLogs, 24_000) : "",
  ].filter(Boolean).join("\n");

  return { subject, body };
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function sanitizeSmtp(response: string) {
  return response
    .replace(/334\s+.*/g, "334 ***")
    .replace(/235\s+.*/g, "235 ***")
    .replace(/535\s+.*/g, "535 authentication failed")
    .slice(0, 500);
}

function readResponse(socket: Socket | TLSSocket, label: string) {
  return new Promise<SmtpResponse>((resolveResponse, reject) => {
    let buffer = "";
    const timer = setTimeout(() => cleanup(new Error(`SMTP response timeout at ${label}`)), 20_000);

    function cleanup(error?: Error, response?: SmtpResponse) {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      if (error) reject(error);
      else if (response) resolveResponse(response);
    }

    function onError(error: Error) {
      cleanup(error);
    }

    function onTimeout() {
      cleanup(new Error(`SMTP socket timeout at ${label}`));
    }

    function onData(chunk: Buffer | string) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      const match = last.match(/^(\d{3})\s/);
      if (!match) return;
      cleanup(undefined, { code: Number(match[1]), response: buffer });
    }

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("timeout", onTimeout);
  });
}

async function expectResponse(
  responsePromise: Promise<SmtpResponse>,
  expectedCodes: number[],
  label: string,
) {
  const response = await responsePromise;
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`${label} failed with ${response.code}: ${sanitizeSmtp(response.response)}`);
  }
  return response;
}

async function sendCommand(
  socket: Socket | TLSSocket,
  command: string,
  expectedCodes: number[],
  label: string,
) {
  socket.write(`${command}\r\n`);
  return expectResponse(readResponse(socket, label), expectedCodes, label);
}

async function createSmtpSocket(env: EnvMap) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT || 465);
  const secure = env.SMTP_SECURE !== "false";
  const family = Number(env.SMTP_FAMILY || 0) || undefined;

  if (secure) {
    const socket = tlsConnect({
      host,
      port,
      servername: host,
      family,
      rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED === "false" ? false : true,
      timeout: 20_000,
    });
    socket.setEncoding("utf8");
    await new Promise<void>((resolveSocket, reject) => {
      socket.once("secureConnect", resolveSocket);
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("SMTP secure connect timeout")));
    });
    return socket;
  }

  const socket = createConnection({ host, port, family, timeout: 20_000 });
  socket.setEncoding("utf8");
  await new Promise<void>((resolveSocket, reject) => {
    socket.once("connect", resolveSocket);
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("SMTP connect timeout")));
  });
  return socket;
}

async function sendMail(env: EnvMap, input: { subject: string; body: string }) {
  const required = [
    "DEPLOY_NOTIFY_TO",
    "DEPLOY_NOTIFY_FROM",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    console.log(`Deploy mail skipped: missing ${missing.join(", ")}`);
    return;
  }

  const socket = await createSmtpSocket(env);
  try {
    await expectResponse(readResponse(socket, "connect"), [220], "connect");
    await sendCommand(socket, "EHLO goose-deploy.local", [250], "EHLO");
    await sendCommand(socket, "AUTH LOGIN", [334], "AUTH LOGIN");
    await sendCommand(socket, Buffer.from(env.SMTP_USER).toString("base64"), [334], "SMTP user");
    await sendCommand(socket, Buffer.from(env.SMTP_PASS).toString("base64"), [235], "SMTP password");
    await sendCommand(socket, `MAIL FROM:<${env.DEPLOY_NOTIFY_FROM}>`, [250], "MAIL FROM");
    await sendCommand(socket, `RCPT TO:<${env.DEPLOY_NOTIFY_TO}>`, [250, 251], "RCPT TO");
    await sendCommand(socket, "DATA", [354], "DATA");

    const encodedBody = Buffer.from(input.body, "utf8")
      .toString("base64")
      .replace(/.{1,76}/g, "$&\r\n");
    const message = [
      `From: Goose Deploy <${env.DEPLOY_NOTIFY_FROM}>`,
      `To: ${env.DEPLOY_NOTIFY_TO}`,
      `Subject: ${encodeHeader(input.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodedBody,
      ".",
      "",
    ].join("\r\n");

    socket.write(message);
    await expectResponse(readResponse(socket, "message send"), [250], "message send");
    await sendCommand(socket, "QUIT", [221], "QUIT");
    console.log(`Deploy mail sent to ${mask(env.DEPLOY_NOTIFY_TO)}`);
  } finally {
    socket.end();
  }
}

async function main() {
  const localEnv = loadEnv();
  const remoteSettings = await loadRemoteSystemSettings(localEnv);
  const env = {
    ...localEnv,
    ...remoteSettings,
  };
  try {
    const report = await collectReport(env);
    await sendMail(env, report);
  } catch (error) {
    const err = error as { message?: string; code?: string };
    console.log(`Deploy mail failed but deployment result is unchanged: ${err.code || ""} ${err.message || error}`);
  }
}

await main();
