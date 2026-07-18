import { join } from "node:path";

const PROBE_TIMEOUT_MS = 5_000;

export async function runCredentialFreeProbe(source: string) {
  const environment = withoutSupabaseCredentials(process.env);
  const child = Bun.spawn([process.execPath, "-e", source], {
    cwd: apiDirectory(),
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const operation = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }));
  return withProbeTimeout({
    operation,
    timeoutMs: PROBE_TIMEOUT_MS,
    cleanup: () => cleanupChild(child),
  });
}

export async function runStandaloneProbe(input: {
  waitForMessage: string;
  environment?: Record<string, string>;
}) {
  const environment = withoutSupabaseCredentials({
    ...process.env,
    ...input.environment,
    BILLING_RECHARGE_EXPIRATION_INTERVAL_MS: "1000",
  });
  const child = Bun.spawn([
    process.execPath,
    "src/workers/billing-recharge-expiration-worker.ts",
  ], {
    cwd: apiDirectory(),
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  let hasSignalled = false;
  const signalOnMessage = (text: string): void => {
    if (!hasSignalled && text.includes(input.waitForMessage)) {
      hasSignalled = true;
      child.kill("SIGTERM");
    }
  };
  const operation = Promise.all([
    child.exited,
    readStream(child.stdout, signalOnMessage),
    readStream(child.stderr, signalOnMessage),
  ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }));
  return withProbeTimeout({
    operation,
    timeoutMs: PROBE_TIMEOUT_MS,
    cleanup: () => cleanupChild(child),
  });
}

export async function withProbeTimeout<Result>(input: {
  operation: Promise<Result>;
  timeoutMs: number;
  cleanup: () => Promise<void>;
}): Promise<Result> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`worker probe timed out after ${input.timeoutMs}ms`));
    }, input.timeoutMs);
  });
  try {
    return await Promise.race([input.operation, timeoutFailure]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await input.cleanup();
  }
}

export function parseJsonLines(output: string): Array<Record<string, unknown>> {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text + decoder.decode();
}

function withoutSupabaseCredentials(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const environment = { ...source };
  environment.SUPABASE_URL = "";
  environment.SUPABASE_PUBLISH = "";
  environment.SUPABASE_SERVICE_ROLE_KEY = "";
  return environment;
}

function apiDirectory(): string {
  return join(import.meta.dir, "../..");
}

async function cleanupChild(child: ReturnType<typeof Bun.spawn>): Promise<void> {
  if (child.exitCode === null) child.kill("SIGKILL");
  await child.exited;
}
