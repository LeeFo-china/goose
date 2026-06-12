import { loadManualGateEvidence } from "./workflow-destructive-cleanup-preflight";

type ManualGateCheckOptions = {
  evidenceFile: string | null;
};

export type ManualGateCheckReport = {
  ok: boolean;
  generated_at: string;
  checks: Array<{
    name: "manual_gate_evidence";
    ok: boolean;
    detail: string;
  }>;
};

export function parseManualGateCheckArgs(
  argv: string[],
): ManualGateCheckOptions {
  let evidenceFile: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--evidence-file") {
      evidenceFile = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--") continue;
    throw new Error(`未知参数: ${arg}`);
  }

  return { evidenceFile };
}

export async function buildManualGateCheckReport(
  evidenceFile: string | null,
  generatedAt = new Date().toISOString(),
): Promise<ManualGateCheckReport> {
  const check = evidenceFile
    ? await loadManualGateEvidence(evidenceFile)
    : { ok: false, detail: "missing --evidence-file" };

  return {
    ok: check.ok,
    generated_at: generatedAt,
    checks: [
      {
        name: "manual_gate_evidence",
        ok: check.ok,
        detail: check.detail,
      },
    ],
  };
}

async function main() {
  const report = await buildManualGateCheckReport(
    parseManualGateCheckArgs(process.argv.slice(2)).evidenceFile,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "人工门禁证据校验失败",
    );
    process.exit(1);
  });
}
