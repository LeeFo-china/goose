import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Errors } from "@/errors/error-factory";

import {
  type OpenRouterCapabilityProbeReport,
  listOpenRouterModelsForOperators,
  runOpenRouterCapabilityProbe,
  sanitizeProbeReport,
} from "@/services/ai-generation/openrouter-capability-probe";

type CliDependencies = {
  env?: NodeJS.ProcessEnv;
  argv?: readonly string[];
  runProbe?: typeof runOpenRouterCapabilityProbe;
  ensureReportDirectory?: (path: string) => Promise<void>;
  writeReport?: (path: string, content: string) => Promise<void>;
  writeOutput?: (message: string) => void;
  writeError?: (message: string) => void;
};

const reportPath = "reports/openrouter-capability-probe.json";

function requireDevelopmentProbe(env: NodeJS.ProcessEnv): string {
  if (env.OPENROUTER_CAPABILITY_PROBE !== "1") {
    throw Errors.business(400, "OpenRouter 探针未启用", "OPENROUTER_CAPABILITY_PROBE_REQUIRED");
  }
  if (env.GOOES_DEPLOY_ENV !== "development") {
    throw Errors.business(400, "OpenRouter 探针仅允许开发环境执行", "OPENROUTER_PROBE_DEVELOPMENT_ONLY");
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw Errors.business(400, "缺少 OpenRouter API Key", "OPENROUTER_API_KEY_REQUIRED");
  }
  return apiKey;
}

function requestedModelsFromEnv(env: NodeJS.ProcessEnv): {
  text?: string;
  image?: string;
  video?: string;
  speech?: string;
} {
  return {
    text: env.OPENROUTER_TEXT_MODEL?.trim() || undefined,
    image: env.OPENROUTER_IMAGE_MODEL?.trim() || undefined,
    video: env.OPENROUTER_VIDEO_MODEL?.trim() || undefined,
    speech: env.OPENROUTER_SPEECH_MODEL?.trim() || undefined,
  };
}

export async function runOpenRouterCapabilityProbeCli(
  dependencies: CliDependencies = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const argv = dependencies.argv ?? process.argv.slice(2);
  const runProbe = dependencies.runProbe ?? runOpenRouterCapabilityProbe;
  const ensureReportDirectory = dependencies.ensureReportDirectory
    ?? ((path: string) => mkdir(path, { recursive: true }).then(() => undefined));
  const writeReport = dependencies.writeReport ?? writeFile;
  const writeOutput = dependencies.writeOutput ?? console.log;
  const writeError = dependencies.writeError ?? console.error;

  try {
    const apiKey = requireDevelopmentProbe(env);
    const mode = argv.includes("--list-models") ? "list-models" : "probe";
    const requestedModels = requestedModelsFromEnv(env);
    if (mode === "probe" && Object.values(requestedModels).some((value) => !value)) {
      throw Errors.business(400, "缺少 OpenRouter 模型 ID", "OPENROUTER_MODEL_IDS_REQUIRED");
    }
    const report: OpenRouterCapabilityProbeReport = await runProbe({
      apiKey,
      mode,
      requestedModels,
    });
    const output = mode === "list-models"
      ? listOpenRouterModelsForOperators(report)
      : sanitizeProbeReport(report);
    await ensureReportDirectory(dirname(reportPath));
    await writeReport(reportPath, `${JSON.stringify(output, null, 2)}\n`);
    writeOutput(JSON.stringify(output));
    return mode === "list-models" || report.modalities.every((item) => item.eligible) ? 0 : 2;
  } catch {
    writeError("OPENROUTER_CAPABILITY_PROBE_FAILED");
    return 1;
  }
}

if (import.meta.main) {
  void runOpenRouterCapabilityProbeCli().then((exitCode) => {
    process.exit(exitCode);
  });
}
