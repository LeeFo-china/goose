import { execFile } from "node:child_process";
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

const WORKSPACE = process.env.GITHUB_WORKSPACE || process.cwd();
const ENV_CANDIDATES = [
  resolve(WORKSPACE, ".env"),
  resolve(WORKSPACE, "apps/api/.env"),
  "/home/ubuntu/actions-runner/.env",
  "/home/runner/actions-runner/.env",
].filter(Boolean);

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

function mask(value: string) {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n... truncated ${value.length - maxLength} chars`;
}

async function runCommand(command: string, args: string[], options: { cwd?: string } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd || WORKSPACE,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    return [stdout, stderr].filter(Boolean).join("\n").trim();
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return [
      err.stdout,
      err.stderr,
      err.message ? `command failed: ${err.message}` : "",
    ].filter(Boolean).join("\n").trim();
  }
}

async function collectReport(env: EnvMap) {
  const status = env.DEPLOY_JOB_STATUS || env.JOB_STATUS || "unknown";
  const pm2Bin = env.PM2_BIN || "pm2";
  const healthScript = resolve(WORKSPACE, "scripts/deploy-health-check.sh");
  const health = existsSync(healthScript)
    ? await runCommand("bash", [healthScript])
    : "scripts/deploy-health-check.sh not found";

  const failureLogs = status === "success"
    ? ""
    : [
      "=== Goose Recent Logs ===",
      await runCommand(pm2Bin, ["logs", "goose", "--lines", "80", "--nostream"]),
      "",
      "=== Goose Admin Recent Logs ===",
      await runCommand(pm2Bin, ["logs", "goose-admin", "--lines", "80", "--nostream"]),
    ].join("\n");

  const subjectStatus = status === "success" ? "成功" : "失败";
  const subject = `Goose 部署${subjectStatus}: ${env.GITHUB_REF_NAME || "unknown"} @ ${(env.GITHUB_SHA || "").slice(0, 7) || "unknown"}`;
  const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : "";

  const body = [
    `部署状态：${subjectStatus}`,
    `仓库：${env.GITHUB_REPOSITORY || "unknown"}`,
    `分支：${env.GITHUB_REF_NAME || env.GITHUB_REF || "unknown"}`,
    `Commit：${env.GITHUB_SHA || "unknown"}`,
    `Run ID：${env.GITHUB_RUN_ID || "unknown"}`,
    runUrl ? `Run URL：${runUrl}` : "",
    `服务器：${hostname()}`,
    `工作目录：${WORKSPACE}`,
    `时间：${new Date().toISOString()}`,
    "",
    truncate(health, 16_000),
    failureLogs ? "" : "",
    failureLogs ? truncate(failureLogs, 18_000) : "",
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
  const env = loadEnv();
  try {
    const report = await collectReport(env);
    await sendMail(env, report);
  } catch (error) {
    const err = error as { message?: string; code?: string };
    console.log(`Deploy mail failed but deployment result is unchanged: ${err.code || ""} ${err.message || error}`);
  }
}

await main();
