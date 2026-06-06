import { pictureLibraryHealthService } from "@/services/picture-library-health";

type CliOptions = {
  issueLimit: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options = {
    issueLimit: Number(process.env.PICTURE_LIBRARY_HEALTH_ISSUE_LIMIT || 50),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--issue-limit" || arg === "--limit") {
      options.issueLimit = Number(argv[index + 1] || options.issueLimit);
      index += 1;
    }
  }

  if (!Number.isFinite(options.issueLimit) || options.issueLimit <= 0) {
    throw new Error("--issue-limit 必须是大于 0 的数字");
  }

  return {
    issueLimit: Math.min(Math.trunc(options.issueLimit), 500),
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const report = await pictureLibraryHealthService.buildReport({
    issueLimit: options.issueLimit,
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "图片资料库健康检查失败");
  process.exit(1);
});
