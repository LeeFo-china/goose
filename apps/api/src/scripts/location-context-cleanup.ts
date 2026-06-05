import { userLocationContextRepository } from "@/repositories/user-location-contexts";

type CliOptions = {
  apply: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  return {
    apply: argv.includes("--apply"),
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const now = new Date().toISOString();
  const matched = await userLocationContextRepository.countExpiredUnconfirmed(now);
  const deleted = options.apply
    ? await userLocationContextRepository.deleteExpiredUnconfirmed(now)
    : 0;

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    rule: "expires_at < now AND confirmed_at IS NULL",
    matched,
    deleted,
    confirmed_contexts_preserved: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "定位上下文清理失败");
  process.exit(1);
});
