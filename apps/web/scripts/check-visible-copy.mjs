import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptRoot, "..");
const publicRoots = [
  join(webRoot, "app"),
  join(webRoot, "components", "content"),
  join(webRoot, "components", "official-site"),
];
const ignoredDirectories = new Set(["api", "ui"]);
const rules = {
  "em-dash": /[—–]/u,
  "scroll-cue": /\bScroll(?:\s+to\s+explore)?\b/iu,
  "version-footer": /\bv\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?\b/iu,
};

export function scanVisibleCopySource(source, filePath = "source.tsx") {
  const findings = [];
  const candidates = extractVisibleCandidates(source);

  for (const candidate of candidates) {
    for (const [rule, pattern] of Object.entries(rules)) {
      if (pattern.test(candidate.text)) {
        findings.push(toFinding(filePath, source, candidate.index, rule, candidate.text));
      }
    }
  }

  const sectionNumbers = candidates
    .map((candidate) => ({
      ...candidate,
      number: parseSectionNumber(candidate.text),
    }))
    .filter((candidate) => candidate.number !== null);
  for (let index = 0; index <= sectionNumbers.length - 3; index += 1) {
    const first = sectionNumbers[index];
    const second = sectionNumbers[index + 1];
    const third = sectionNumbers[index + 2];
    if (
      first.number + 1 === second.number
      && second.number + 1 === third.number
    ) {
      findings.push(toFinding(
        filePath,
        source,
        first.index,
        "section-number",
        `${first.text} / ${second.text} / ${third.text}`,
      ));
      break;
    }
  }

  findings.push(...findPlaceholderLabels(source, filePath));
  return findings;
}

function extractVisibleCandidates(source) {
  const candidates = [];
  const textPattern = />([^<>{]+)</gu;
  const stringPattern = /(["'`])((?:(?!\1)[^\\]|\\.)*)\1/gu;

  for (const match of source.matchAll(textPattern)) {
    const text = match[1]?.trim();
    if (text) candidates.push({ text, index: (match.index ?? 0) + 1 });
  }

  for (const match of source.matchAll(stringPattern)) {
    const index = match.index ?? 0;
    const lineStart = source.lastIndexOf("\n", index) + 1;
    const prefix = source.slice(lineStart, index);
    const text = match[2]?.trim();
    if (!text || shouldIgnoreString(prefix, text)) continue;
    candidates.push({ text, index });
  }

  return candidates;
}

function shouldIgnoreString(prefix, text) {
  if (/^\s*(?:import|export\s+.+\s+from)\b/u.test(prefix)) return true;
  if (/(?:aria-[\w-]+|className|href|src|id|htmlFor|data-[\w-]+)\s*=\s*$/u.test(prefix)) {
    return true;
  }
  if (/^(?:@\/|\.\.?\/|https?:\/\/)/u.test(text)) return true;
  return false;
}

function parseSectionNumber(text) {
  const match = text.match(/^\s*(?:section\s*)?0([1-9])(?:\s|[./:·-]|$)/iu);
  return match ? Number(match[1]) : null;
}

function findPlaceholderLabels(source, filePath) {
  const findings = [];
  const placeholderPattern = /<(?:Input|Textarea|SelectValue)\b[^>]*\bplaceholder\s*=\s*(?:["'`][^"'`]*["'`]|\{[^}]+\})[^>]*>/gu;

  for (const match of source.matchAll(placeholderPattern)) {
    const index = match.index ?? 0;
    const fieldStart = source.lastIndexOf("<Field", index);
    const fieldEnd = source.indexOf("</Field>", index);
    const fieldSource = fieldStart >= 0 && fieldEnd >= index
      ? source.slice(fieldStart, fieldEnd)
      : "";
    if (!/<(?:FieldLabel|label)\b/gu.test(fieldSource)) {
      findings.push(toFinding(
        filePath,
        source,
        index,
        "placeholder-as-label",
        "输入框 placeholder 缺少可见标签",
      ));
    }
  }

  return findings;
}

function toFinding(filePath, source, index, rule, text) {
  return {
    filePath,
    line: source.slice(0, index).split("\n").length,
    rule,
    text: text.replace(/\s+/gu, " ").slice(0, 120),
  };
}

function collectTsxFiles(root) {
  if (!statSync(root).isDirectory()) return root.endsWith(".tsx") ? [root] : [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

export function scanVisibleCopyFiles(roots = publicRoots) {
  return roots.flatMap((root) => collectTsxFiles(root).flatMap((filePath) =>
    scanVisibleCopySource(readFileSync(filePath, "utf8"), relative(webRoot, filePath))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scanVisibleCopyFiles();
  if (findings.length === 0) {
    console.log("Visible copy check passed.");
  } else {
    for (const finding of findings) {
      console.error(`${finding.filePath}:${finding.line} [${finding.rule}] ${finding.text}`);
    }
    process.exitCode = 1;
  }
}
