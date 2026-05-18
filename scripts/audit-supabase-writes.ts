import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

type Finding = {
  file: string;
  line: number;
  method: string;
  table: string | null;
  snippet: string;
};

const ROOT = process.cwd();
const TARGET_ROOTS = [
  "apps/api/src/controllers",
  "apps/api/src/repositories",
  "apps/api/src/services",
];
const WRITE_METHOD_PATTERN = /\.(insert|update|upsert|delete)\s*\(/;

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

function findStatementEnd(content: string, start: number) {
  let quote: "'" | "\"" | "`" | null = null;
  let escaped = false;
  let round = 0;
  let square = 0;
  let curly = 0;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

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

    if (char === "/" && next === "/") {
      const lineEnd = content.indexOf("\n", index);
      if (lineEnd === -1) return content.length;
      index = lineEnd;
      continue;
    }

    if (char === "/" && next === "*") {
      const commentEnd = content.indexOf("*/", index + 2);
      if (commentEnd === -1) return content.length;
      index = commentEnd + 1;
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") round += 1;
    if (char === ")") round -= 1;
    if (char === "[") square += 1;
    if (char === "]") square -= 1;
    if (char === "{") curly += 1;
    if (char === "}") curly -= 1;

    if (char === ";" && round <= 0 && square <= 0 && curly <= 0) {
      return index + 1;
    }
  }

  return content.length;
}

function findChainStart(content: string, methodIndex: number) {
  const fromIndex = content.lastIndexOf(".from(", methodIndex);
  if (fromIndex === -1) return methodIndex;

  const statementStart = Math.max(
    content.lastIndexOf(";", fromIndex),
    content.lastIndexOf("{", fromIndex),
    content.lastIndexOf("\n\n", fromIndex),
  );

  return statementStart === -1 ? fromIndex : statementStart + 1;
}

function compactSnippet(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 360);
}

function extractTable(chain: string) {
  const match = chain.match(/\.from\(\s*["']([^"']+)["']\s*\)/);
  return match?.[1] ?? null;
}

function findSupabaseFromBefore(content: string, index: number) {
  let result = -1;
  const pattern = /\.from\s*\(/g;

  while (true) {
    const match = pattern.exec(content);
    if (!match || match.index >= index) break;

    const prefix = content.slice(Math.max(0, match.index - 12), match.index);
    if (/\bArray$/.test(prefix)) continue;
    result = match.index;
  }

  return result;
}

function hasSelectAfterWrite(chain: string, methodIndexInChain: number) {
  return chain.slice(methodIndexInChain).includes(".select(");
}

function scanFile(path: string): Finding[] {
  const content = readFileSync(path, "utf8");
  const findings: Finding[] = [];
  let searchIndex = 0;

  while (searchIndex < content.length) {
    const rest = content.slice(searchIndex);
    const match = rest.match(WRITE_METHOD_PATTERN);
    if (!match || match.index == null) break;

    const methodIndex = searchIndex + match.index;
    const method = match[1];
    const lastStatementBoundary = Math.max(
      content.lastIndexOf(";", methodIndex),
      content.lastIndexOf("\n\n", methodIndex),
    );
    const fromIndex = findSupabaseFromBefore(content, methodIndex);
    if (fromIndex === -1 || fromIndex < lastStatementBoundary) {
      searchIndex = methodIndex + match[0].length;
      continue;
    }

    const chainStart = findChainStart(content, methodIndex);
    const chainEnd = findStatementEnd(content, chainStart);
    const chain = content.slice(chainStart, chainEnd);
    const methodIndexInChain = methodIndex - chainStart;
    const assignedVariable = chain.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/)?.[1] ?? null;
    const followUp = assignedVariable
      ? content.slice(chainEnd, Math.min(content.length, chainEnd + 2400))
      : "";
    const hasDeferredSelect = assignedVariable
      ? new RegExp(`\\bawait\\s+${assignedVariable}\\b[\\s\\S]{0,240}?\\.select\\s*\\(`).test(followUp)
      : false;

    if (
      chain.includes(".from(") &&
      !hasSelectAfterWrite(chain, methodIndexInChain) &&
      !hasDeferredSelect
    ) {
      findings.push({
        file: relative(ROOT, path),
        line: lineNumberAt(content, methodIndex),
        method,
        table: extractTable(chain),
        snippet: compactSnippet(chain),
      });
    }

    searchIndex = methodIndex + match[0].length;
  }

  return findings;
}

function main() {
  const files = TARGET_ROOTS.flatMap((root) => walk(join(ROOT, root)));
  const findings = files.flatMap(scanFile);

  if (findings.length === 0) {
    console.log("Supabase write audit passed: no naked write chains found.");
    return;
  }

  console.log(`Supabase write audit found ${findings.length} candidate(s):`);
  for (const item of findings) {
    const tableText = item.table ? ` table=${item.table}` : "";
    console.log(`- ${item.file}:${item.line} ${item.method}${tableText}`);
    console.log(`  ${item.snippet}`);
  }

  if (process.argv.includes("--fail-on-candidates")) {
    process.exitCode = 1;
  }
}

main();
