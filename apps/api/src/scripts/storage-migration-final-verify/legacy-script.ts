import { main } from "./legacy/runner";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
