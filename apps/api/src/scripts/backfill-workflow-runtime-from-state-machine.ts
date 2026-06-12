import { parseBackfillArgs } from "./workflow-runtime-backfill/cli";
import { backfillWorkflowRuntimeFromStateMachine } from "./workflow-runtime-backfill/runner";

async function main() {
  const options = parseBackfillArgs(process.argv.slice(2));
  const result = await backfillWorkflowRuntimeFromStateMachine(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
