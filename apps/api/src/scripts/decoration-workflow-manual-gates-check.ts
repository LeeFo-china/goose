import {
  buildDecorationWorkflowManualGateCheckReport,
} from "./decoration-workflow-manual-gates-core";

type DecorationManualGateCheckOptions = {
  evidenceFile: string | null;
};

export { buildDecorationWorkflowManualGateCheckReport };

export function parseDecorationWorkflowManualGateCheckArgs(
  argv: string[],
): DecorationManualGateCheckOptions {
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

async function main() {
  const report = await buildDecorationWorkflowManualGateCheckReport(
    parseDecorationWorkflowManualGateCheckArgs(process.argv.slice(2)).evidenceFile,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "装修 workflow 门禁校验失败",
    );
    process.exit(1);
  });
}
