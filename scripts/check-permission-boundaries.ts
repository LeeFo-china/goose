import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

type Finding = {
  file: string;
  line: number;
  message: string;
};

const ROOT = process.cwd();
const API_SRC = "apps/api/src";
const CONTROLLERS_SRC = "apps/api/src/controllers";
const findings: Finding[] = [];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walk(path));
      continue;
    }
    if (entry.isFile() && path.endsWith(".ts")) {
      result.push(path);
    }
  }
  return result;
}

function lineNumberAt(content: string, index: number) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function addFinding(file: string, line: number, message: string) {
  findings.push({
    file: relative(ROOT, file),
    line,
    message,
  });
}

function checkSupabaseFrom(file: string, content: string) {
  const patterns = [
    /SupabaseDB\.from\s*\(/g,
    /SupabaseDB\s*\n\s*\.from\s*\(/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      addFinding(
        file,
        lineNumberAt(content, match.index),
        "禁止使用 SupabaseDB.from()，必须显式选择 getAdminClient() 或 getClient()",
      );
    }
  }
}

function checkSupabaseGetClient(file: string, content: string) {
  const pattern = /SupabaseDB\.getClient\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    addFinding(
      file,
      lineNumberAt(content, match.index),
      "SupabaseDB.getClient() 只允许明确 public/RLS 场景；新增前请在 docs/permission 更新例外说明",
    );
  }
}

function checkControllerSupabaseAccess(file: string, content: string) {
  if (!relative(ROOT, file).startsWith(CONTROLLERS_SRC)) return;

  const directPatterns: Array<[RegExp, string]> = [
    [
      /\bSupabaseDB\b/g,
      "controller 禁止直接依赖 SupabaseDB；请下沉到 service/repository",
    ],
    [
      /\bgetAdminClient\s*\(/g,
      "controller 禁止直接调用 getAdminClient()；请下沉到 service/repository",
    ],
    [
      /\bgetClient\s*\(/g,
      "controller 禁止直接调用 getClient()；请下沉到明确 public/RLS service/repository",
    ],
    [
      /\.rpc\s*\(/g,
      "controller 禁止直接调用 Supabase RPC；请下沉到 service/repository",
    ],
  ];

  for (const [pattern, message] of directPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      addFinding(file, lineNumberAt(content, match.index), message);
    }
  }

  const fromPattern = /\.from\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = fromPattern.exec(content)) !== null) {
    const prefix = content.slice(Math.max(0, match.index - 5), match.index);
    if (prefix === "Array") {
      continue;
    }

    addFinding(
      file,
      lineNumberAt(content, match.index),
      "controller 禁止直接调用 Supabase .from()；请下沉到 service/repository",
    );
  }
}

function countCreateResourceRoutesArgs(call: string) {
  const start = call.indexOf("(");
  const end = call.lastIndexOf(")");
  if (start === -1 || end === -1 || end <= start) return 0;

  let depth = 0;
  let args = 1;
  let quote: "'" | "\"" | "`" | null = null;
  let escaped = false;
  const body = call.slice(start + 1, end);

  if (!body.trim()) return 0;

  for (const char of body) {
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) args += 1;
  }

  return args;
}

function checkCreateResourceRoutes(file: string, content: string) {
  const pattern = /createResourceRoutes\s*\([\s\S]*?\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (countCreateResourceRoutesArgs(match[0]) < 3) {
      addFinding(
        file,
        lineNumberAt(content, match.index),
        "createResourceRoutes() 必须显式传入 CRUD 注册配置",
      );
    }
  }
}

for (const file of walk(join(ROOT, API_SRC))) {
  const content = readFileSync(file, "utf8");
  checkSupabaseFrom(file, content);
  checkSupabaseGetClient(file, content);
  checkControllerSupabaseAccess(file, content);

  if (file.endsWith("routes/index.ts")) {
    checkCreateResourceRoutes(file, content);
  }
}

if (findings.length > 0) {
  console.error("权限边界检查失败：");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.message}`);
  }
  process.exit(1);
}

console.log("权限边界检查通过");
